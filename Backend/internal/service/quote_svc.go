package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/pricing"
	"dealflow360/backend/internal/domain/risk"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/cache"
	"dealflow360/backend/internal/platform/db"
)

// QuoteService builds quotations and keeps their governance verdict current.
//
// The invariant it exists to hold: a quotation's stored totals, per-line
// breakdown, and risk score are always the output of one run of the engines
// over the current set of lines. Any mutation recalculates everything and
// writes it back in a single transaction, so a list view reading stored
// columns can never disagree with the detail view.
type QuoteService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	cache *cache.Config
}

// NewQuoteService builds the service.
func NewQuoteService(pool *pgxpool.Pool, q *sqlcgen.Queries, c *cache.Config) *QuoteService {
	return &QuoteService{pool: pool, q: q, cache: c}
}

// Quotation is a quotation with everything the builder needs to render it.
type Quotation struct {
	Header sqlcgen.GetQuotationRow
	Lines  []sqlcgen.ListQuotationLinesRow

	// Risk is recomputed on read as well as on write. Reading it from the
	// engine rather than from stored columns means the "Why This Quote Was
	// Flagged" table and the score beside it always come from one call and
	// cannot drift apart.
	Risk risk.Result

	Totals pricing.OrderTotals

	// ConfigVersion identifies the governance snapshot that produced Risk.
	ConfigVersion int64
}

// LineInput is a line as the caller supplies it.
type LineInput struct {
	ProductID   int64
	Qty         decimal.Decimal
	DiscountPct decimal.Decimal
	PlanID      *int64
}

func (in LineInput) validate() error {
	switch {
	case in.ProductID == 0:
		return apierr.Validation("product_id is required")
	case in.Qty.LessThanOrEqual(decimal.Zero):
		return apierr.Validation("qty must be greater than zero")
	case in.DiscountPct.IsNegative() || in.DiscountPct.GreaterThan(decimal.NewFromInt(100)):
		return apierr.Validation("discount_pct must be between 0 and 100")
	}
	return nil
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// ListFilter narrows a quotation listing.
type ListFilter struct {
	Status     *string
	CustomerID *int64
	Cursor     *int64
	Limit      int32
}

// List returns quotations the caller is allowed to see.
//
// Visibility is decided here rather than in a route guard: a rep sees their
// own deals, a manager their team's, and finance or an administrator all of
// them. Putting it in the service means a handler added later cannot widen it
// by forgetting a filter.
func (s *QuoteService) List(ctx context.Context, actor auth.Principal, f ListFilter) ([]sqlcgen.ListQuotationsRow, error) {
	params := sqlcgen.ListQuotationsParams{
		Status:     f.Status,
		CustomerID: f.CustomerID,
		Cursor:     f.Cursor,
		PageSize:   f.Limit,
	}

	switch actor.Role {
	case auth.RoleRep:
		id := actor.UserID
		params.RepID = &id
	case auth.RoleManager:
		team := actor.SalesTeam
		params.SalesTeam = &team
	case auth.RoleFinance, auth.RoleAdmin:
		// Unrestricted: finance reconciles across teams and an administrator
		// oversees the platform.
	default:
		return nil, apierr.Forbidden("your role cannot view quotations")
	}

	rows, err := s.q.ListQuotations(ctx, params)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list quotations: %w", err))
	}
	return rows, nil
}

// Get returns one quotation, its lines, and its current governance verdict.
func (s *QuoteService) Get(ctx context.Context, actor auth.Principal, id int64) (Quotation, error) {
	header, err := s.q.GetQuotation(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Quotation{}, apierr.NotFound("quotation not found")
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("get quotation: %w", err))
	}
	if err := s.authorise(actor, header); err != nil {
		return Quotation{}, err
	}

	lines, err := s.q.ListQuotationLines(ctx, id)
	if err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("list quotation lines: %w", err))
	}

	totals, verdict, version := s.evaluate(lines, header.OrderDiscountPct, risk.Tier(header.CustomerTier))
	return Quotation{
		Header: header, Lines: lines,
		Risk: verdict, Totals: totals, ConfigVersion: version,
	}, nil
}

// authorise enforces record-level visibility.
//
// A quotation not visible to the caller returns "not found" rather than
// "forbidden": telling a rep that a deal exists but is not theirs leaks the
// shape of the pipeline.
func (s *QuoteService) authorise(actor auth.Principal, header sqlcgen.GetQuotationRow) error {
	switch actor.Role {
	case auth.RoleAdmin, auth.RoleFinance:
		return nil
	case auth.RoleManager:
		if header.RepSalesTeam != actor.SalesTeam {
			return apierr.NotFound("quotation not found")
		}
		return nil
	case auth.RoleRep:
		if header.RepID != actor.UserID {
			return apierr.NotFound("quotation not found")
		}
		return nil
	default:
		return apierr.Forbidden("your role cannot view quotations")
	}
}

// evaluate runs the pricing and risk engines over a set of lines.
//
// It reads governance from the in-process cache, so scoring a quotation on
// every keystroke costs no database queries at all.
func (s *QuoteService) evaluate(
	lines []sqlcgen.ListQuotationLinesRow,
	orderDiscountPct decimal.Decimal,
	tier risk.Tier,
) (pricing.OrderTotals, risk.Result, int64) {
	priceIn := make([]pricing.LineInput, 0, len(lines))
	for _, l := range lines {
		priceIn = append(priceIn, pricing.LineInput{
			LineID:          l.ID,
			ProductID:       l.ProductID,
			CategoryID:      l.CategoryID,
			Qty:             l.Qty,
			UnitPrice:       l.UnitPrice,
			UnitCost:        l.UnitCost,
			LineDiscountPct: l.LineDiscountPct,
			TaxRatePct:      l.TaxRatePct,
			LineType:        pricing.LineType(l.LineType),
			PlanID:          l.PlanID,
		})
	}
	totals := pricing.Compute(priceIn, orderDiscountPct)

	riskIn := make([]risk.LineInput, 0, len(totals.Lines))
	for i, l := range totals.Lines {
		riskIn = append(riskIn, risk.LineInput{
			LineID:       l.LineID,
			ProductID:    l.ProductID,
			ProductName:  lines[i].ProductName,
			CategoryID:   l.CategoryID,
			CategoryName: lines[i].CategoryName,
			// The effective discount, with any order-level discount already
			// folded in. Scoring the raw line discount would let a rep hide
			// a large order discount behind compliant-looking lines.
			GivenPct:  l.EffectiveDiscountPct,
			ListValue: l.ListValue,
		})
	}

	snap := s.cache.Get()
	if snap == nil {
		// Nothing loaded yet. An empty config has no ceilings, so every line
		// would look compliant; returning a zero verdict is the honest answer
		// and the caller surfaces it rather than approving silently.
		return totals, risk.Result{Breakdown: []risk.LineBreakdown{}}, 0
	}
	return totals, risk.Score(riskIn, tier, snap.Risk), snap.Version
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// Create opens a draft quotation for a customer.
func (s *QuoteService) Create(ctx context.Context, actor auth.Principal, customerID int64) (Quotation, error) {
	if !actor.Role.Is(auth.RoleRep, auth.RoleManager, auth.RoleAdmin) {
		return Quotation{}, apierr.Forbidden("your role cannot create quotations")
	}
	if customerID == 0 {
		return Quotation{}, apierr.Validation("customer_id is required")
	}

	ref, err := s.q.NextQuotationReference(ctx)
	if err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("next reference: %w", err))
	}

	row, err := s.q.CreateQuotation(ctx, sqlcgen.CreateQuotationParams{
		Reference: ref, CustomerID: customerID, RepID: actor.UserID,
	})
	if err != nil {
		if isForeignKeyViolation(err) {
			return Quotation{}, apierr.Validation("customer_id does not refer to an existing customer")
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("create quotation: %w", err))
	}

	s.audit(ctx, row.ID, "CREATED", actor, "Quotation opened", nil)
	return s.Get(ctx, actor, row.ID)
}

// AddLine appends a product to a draft and recalculates.
func (s *QuoteService) AddLine(ctx context.Context, actor auth.Principal, quotationID int64, in LineInput) (Quotation, error) {
	if err := in.validate(); err != nil {
		return Quotation{}, err
	}

	header, err := s.editable(ctx, actor, quotationID)
	if err != nil {
		return Quotation{}, err
	}

	product, err := s.q.GetProduct(ctx, in.ProductID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Quotation{}, apierr.Validation("product_id does not refer to an existing product")
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("get product: %w", err))
	}

	lineType := pricing.LineOneTime
	planID := in.PlanID
	if product.IsSubscription {
		lineType = pricing.LineRecurring
		if planID == nil {
			return Quotation{}, apierr.Validation(
				"plan_id is required for a subscription product")
		}
	} else {
		// A one-off product with a plan attached would generate a billing
		// schedule for something that is not recurring.
		planID = nil
	}

	// Price and cost are copied onto the line rather than referenced, so a
	// later catalogue change cannot silently restate an approved quotation.
	if _, err := s.q.InsertQuotationLine(ctx, sqlcgen.InsertQuotationLineParams{
		QuotationID:     quotationID,
		ProductID:       product.ID,
		CategoryID:      product.CategoryID,
		Qty:             in.Qty,
		UnitPrice:       product.UnitPrice,
		UnitCost:        product.UnitCost,
		LineDiscountPct: in.DiscountPct,
		TaxRatePct:      product.TaxRatePct,
		LineType:        string(lineType),
		PlanID:          planID,
	}); err != nil {
		if isForeignKeyViolation(err) {
			return Quotation{}, apierr.Validation("plan_id does not refer to an existing plan")
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("insert line: %w", err))
	}

	return s.recalculate(ctx, actor, header)
}

// UpdateLine changes a line's quantity or discount and recalculates.
func (s *QuoteService) UpdateLine(ctx context.Context, actor auth.Principal, quotationID, lineID int64, qty, discountPct decimal.Decimal) (Quotation, error) {
	if qty.LessThanOrEqual(decimal.Zero) {
		return Quotation{}, apierr.Validation("qty must be greater than zero")
	}
	if discountPct.IsNegative() || discountPct.GreaterThan(decimal.NewFromInt(100)) {
		return Quotation{}, apierr.Validation("discount_pct must be between 0 and 100")
	}

	header, err := s.editable(ctx, actor, quotationID)
	if err != nil {
		return Quotation{}, err
	}

	// Scoped by quotation as well as by id, so a line id from another
	// quotation cannot be edited through this one.
	if _, err := s.q.GetQuotationLine(ctx, sqlcgen.GetQuotationLineParams{
		ID: lineID, QuotationID: quotationID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Quotation{}, apierr.NotFound("line not found on this quotation")
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("get line: %w", err))
	}

	if _, err := s.q.UpdateQuotationLineInput(ctx, sqlcgen.UpdateQuotationLineInputParams{
		ID: lineID, Qty: qty, LineDiscountPct: discountPct,
	}); err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("update line: %w", err))
	}

	return s.recalculate(ctx, actor, header)
}

// DeleteLine removes a line and recalculates.
func (s *QuoteService) DeleteLine(ctx context.Context, actor auth.Principal, quotationID, lineID int64) (Quotation, error) {
	header, err := s.editable(ctx, actor, quotationID)
	if err != nil {
		return Quotation{}, err
	}

	n, err := s.q.DeleteQuotationLine(ctx, sqlcgen.DeleteQuotationLineParams{
		ID: lineID, QuotationID: quotationID,
	})
	if err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("delete line: %w", err))
	}
	if n == 0 {
		return Quotation{}, apierr.NotFound("line not found on this quotation")
	}

	return s.recalculate(ctx, actor, header)
}

// SetOrderDiscount applies a discount across the whole order.
//
// It composes with each line's own discount rather than replacing it, and the
// composed figure is what governance scores.
func (s *QuoteService) SetOrderDiscount(ctx context.Context, actor auth.Principal, quotationID int64, pct decimal.Decimal) (Quotation, error) {
	if pct.IsNegative() || pct.GreaterThan(decimal.NewFromInt(100)) {
		return Quotation{}, apierr.Validation("order_discount_pct must be between 0 and 100")
	}

	header, err := s.editable(ctx, actor, quotationID)
	if err != nil {
		return Quotation{}, err
	}
	header.OrderDiscountPct = pct

	return s.recalculate(ctx, actor, header)
}

// editable loads a quotation and refuses the write unless it is in a state
// that accepts edits.
//
// Editing an approved quotation would let a rep have terms signed off and
// then change them, so a quotation past DRAFT must be returned for revision
// before it can move again.
func (s *QuoteService) editable(ctx context.Context, actor auth.Principal, id int64) (sqlcgen.GetQuotationRow, error) {
	header, err := s.q.GetQuotation(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return header, apierr.NotFound("quotation not found")
		}
		return header, apierr.Internal(fmt.Errorf("get quotation: %w", err))
	}
	if err := s.authorise(actor, header); err != nil {
		return header, err
	}

	switch header.Status {
	case "DRAFT":
		return header, nil
	case "PENDING_APPROVAL":
		return header, apierr.Conflict(
			"this quotation is awaiting approval; it must be returned for revision before it can be edited")
	case "REJECTED":
		return header, apierr.Conflict("this quotation was rejected and cannot be edited")
	case "CONFIRMED":
		return header, apierr.Conflict("this quotation is confirmed and cannot be edited")
	default:
		return header, apierr.Conflict(
			fmt.Sprintf("a quotation in %s cannot be edited", header.Status))
	}
}

// computedLine is the JSON shape the batched line update expects. Decimals
// serialise as strings so they never pass through a float.
type computedLine struct {
	ID                   int64  `json:"id"`
	EffectiveDiscountPct string `json:"effective_discount_pct"`
	ListValue            string `json:"list_value"`
	DiscountAmount       string `json:"discount_amount"`
	NetAmount            string `json:"net_amount"`
	TaxAmount            string `json:"tax_amount"`
	CostAmount           string `json:"cost_amount"`
	MarginAmount         string `json:"margin_amount"`
	MarginPct            string `json:"margin_pct"`
	CeilingPct           string `json:"ceiling_pct"`
	OveragePts           string `json:"overage_pts"`
}

// recalculate re-runs both engines over the quotation's current lines and
// writes the results back atomically.
//
// Everything derived lands in one transaction: per-line figures, order
// totals, and the governance verdict. A partial write here would leave a list
// view showing one total and the detail view another.
func (s *QuoteService) recalculate(ctx context.Context, actor auth.Principal, header sqlcgen.GetQuotationRow) (Quotation, error) {
	lines, err := s.q.ListQuotationLines(ctx, header.ID)
	if err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("list lines: %w", err))
	}

	totals, verdict, version := s.evaluate(lines, header.OrderDiscountPct, risk.Tier(header.CustomerTier))

	byLine := make(map[int64]risk.LineBreakdown, len(verdict.Breakdown))
	for _, b := range verdict.Breakdown {
		byLine[b.LineID] = b
	}

	payload := make([]computedLine, 0, len(totals.Lines))
	for _, l := range totals.Lines {
		b := byLine[l.LineID]
		payload = append(payload, computedLine{
			ID:                   l.LineID,
			EffectiveDiscountPct: l.EffectiveDiscountPct.String(),
			ListValue:            l.ListValue.String(),
			DiscountAmount:       l.DiscountAmount.String(),
			NetAmount:            l.NetAmount.String(),
			TaxAmount:            l.TaxAmount.String(),
			CostAmount:           l.CostAmount.String(),
			MarginAmount:         l.MarginAmount.String(),
			MarginPct:            l.MarginPct.String(),
			CeilingPct:           b.AllowedPct.String(),
			OveragePts:           b.OveragePts.String(),
		})
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("encode computed lines: %w", err))
	}

	var updated sqlcgen.Quotation

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if len(payload) > 0 {
			if err := qtx.UpdateQuotationLinesComputed(ctx, sqlcgen.UpdateQuotationLinesComputedParams{
				QuotationID: header.ID, Lines: encoded,
			}); err != nil {
				return fmt.Errorf("update computed lines: %w", err)
			}
		}

		var policyID *int64
		if verdict.MatchedPolicyID != 0 {
			id := verdict.MatchedPolicyID
			policyID = &id
		}

		// Guarded by the version the read observed: a concurrent edit bumps
		// it and this update matches no rows rather than overwriting.
		row, err := qtx.UpdateQuotationTotals(ctx, sqlcgen.UpdateQuotationTotalsParams{
			ID:               header.ID,
			Version:          header.Version,
			ListSubtotal:     totals.ListSubtotal,
			DiscountTotal:    totals.DiscountTotal,
			NetSubtotal:      totals.NetSubtotal,
			TaxTotal:         totals.TaxTotal,
			GrandTotal:       totals.GrandTotal,
			CostTotal:        totals.CostTotal,
			MarginAmount:     totals.MarginAmount,
			MarginPct:        totals.MarginPct,
			BlendedRiskScore: verdict.BlendedScore,
			MaxLineOverage:   verdict.MaxLineOverage,
			RequiredLevel:    string(levelOrNone(verdict.RequiredLevel)),
			MatchedPolicyID:  policyID,
			RiskRationale:    verdict.Rationale,
			OrderDiscountPct: header.OrderDiscountPct,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apierr.Conflict(
					"this quotation was changed by someone else; reload and try again")
			}
			return fmt.Errorf("update totals: %w", err)
		}
		updated = row
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Quotation{}, apiErr
		}
		return Quotation{}, apierr.Internal(err)
	}

	// The response is assembled from what was just written rather than by
	// reading it back. The joined labels on the header have not changed, and
	// the line figures the client renders come from the engine output above,
	// so two extra round trips would only re-fetch what is already in hand.
	header.Version = updated.Version
	header.Status = updated.Status
	header.LastActivityAt = updated.LastActivityAt
	header.ListSubtotal = updated.ListSubtotal
	header.DiscountTotal = updated.DiscountTotal
	header.NetSubtotal = updated.NetSubtotal
	header.TaxTotal = updated.TaxTotal
	header.GrandTotal = updated.GrandTotal
	header.CostTotal = updated.CostTotal
	header.MarginAmount = updated.MarginAmount
	header.MarginPct = updated.MarginPct
	header.BlendedRiskScore = updated.BlendedRiskScore
	header.MaxLineOverage = updated.MaxLineOverage
	header.RequiredLevel = updated.RequiredLevel
	header.RiskRationale = updated.RiskRationale

	return Quotation{
		Header: header, Lines: lines,
		Risk: verdict, Totals: totals, ConfigVersion: version,
	}, nil
}

// Submit sends a quotation for approval, or straight through when none is
// required.
//
// The rep never asks for approval and never chooses an approver: the blended
// risk score decides whether the quotation needs one, and which chain it
// takes. That is the whole point of the governance engine.
func (s *QuoteService) Submit(ctx context.Context, actor auth.Principal, quotationID int64) (Quotation, error) {
	header, err := s.editable(ctx, actor, quotationID)
	if err != nil {
		return Quotation{}, err
	}

	lines, err := s.q.ListQuotationLines(ctx, quotationID)
	if err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("list lines: %w", err))
	}
	if len(lines) == 0 {
		return Quotation{}, apierr.Validation("a quotation needs at least one line before it can be submitted")
	}

	// Score against what is on the quotation right now, not what was stored
	// when a line was last touched: a ceiling may have changed since.
	quote, err := s.recalculate(ctx, actor, header)
	if err != nil {
		return Quotation{}, err
	}

	level := levelOrNone(quote.Risk.RequiredLevel)
	round, err := s.q.CurrentApprovalRound(ctx, quotationID)
	if err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("current approval round: %w", err))
	}
	nextRound := round + 1

	status := "APPROVED"
	if level != risk.LevelNone {
		status = "PENDING_APPROVAL"
	}

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		// Any chain from a previous round is closed, never deleted: the audit
		// trail has to keep submitted, returned, and resubmitted side by side.
		if _, err := qtx.SupersedeOpenApprovals(ctx, quotationID); err != nil {
			return fmt.Errorf("supersede open approvals: %w", err)
		}

		// Steps are numbered from one in chain order, so the approvals inbox
		// can refuse a decision taken out of sequence.
		var step int32
		for _, required := range chainFor(level) {
			step++
			if _, err := qtx.CreateApprovalRequest(ctx, sqlcgen.CreateApprovalRequestParams{
				QuotationID:  quotationID,
				Step:         step,
				RequiredRole: string(required),
				Round:        nextRound,
			}); err != nil {
				return fmt.Errorf("create approval step %d: %w", step, err)
			}
		}

		if _, err := qtx.UpdateQuotationStatus(ctx, sqlcgen.UpdateQuotationStatusParams{
			ID: quotationID, Status: status,
		}); err != nil {
			return fmt.Errorf("update status: %w", err)
		}
		return nil
	})
	if err != nil {
		return Quotation{}, apierr.Internal(err)
	}

	note := "Submitted; no approval required"
	if level != risk.LevelNone {
		note = fmt.Sprintf("Submitted; routed to %s (blended %s, worst line %s pts)",
			level, quote.Risk.BlendedScore, quote.Risk.MaxLineOverage)
	}
	s.audit(ctx, quotationID, "SUBMITTED", actor, note, map[string]any{
		"blended_risk_score": quote.Risk.BlendedScore.String(),
		"max_line_overage":   quote.Risk.MaxLineOverage.String(),
		"required_level":     string(level),
		"config_version":     quote.ConfigVersion,
	})

	return s.Get(ctx, actor, quotationID)
}

// chainFor turns a required level into the ordered list of approvers.
func chainFor(level risk.Level) []auth.Role {
	switch level {
	case risk.LevelManagerFinance:
		return []auth.Role{auth.RoleManager, auth.RoleFinance}
	case risk.LevelManager:
		return []auth.Role{auth.RoleManager}
	default:
		return nil
	}
}

func levelOrNone(l risk.Level) risk.Level {
	if l == "" {
		return risk.LevelNone
	}
	return l
}

// audit appends to the trail. A failure to record is logged by the caller's
// error path but never fails the business operation it describes: losing an
// audit line is bad, losing the approval that line describes is worse.
func (s *QuoteService) audit(ctx context.Context, quotationID int64, action string, actor auth.Principal, note string, payload map[string]any) {
	encoded := []byte("{}")
	if payload != nil {
		if b, err := json.Marshal(payload); err == nil {
			encoded = b
		}
	}

	actorID := actor.UserID
	_, _ = s.q.AppendAuditLog(ctx, sqlcgen.AppendAuditLogParams{
		EntityType: "quotation",
		EntityID:   quotationID,
		Action:     action,
		ActorID:    &actorID,
		ActorLabel: actor.Email,
		Note:       note,
		Payload:    encoded,
	})
}

// AuditTrail returns the recorded history for a quotation.
func (s *QuoteService) AuditTrail(ctx context.Context, quotationID int64, limit int32) ([]sqlcgen.AuditLog, error) {
	rows, err := s.q.ListAuditLogs(ctx, sqlcgen.ListAuditLogsParams{
		EntityType: "quotation", EntityID: quotationID, Limit: limit,
	})
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list audit logs: %w", err))
	}
	return rows, nil
}

// Approvals returns every approval step recorded for a quotation, including
// superseded rounds.
func (s *QuoteService) Approvals(ctx context.Context, quotationID int64) ([]sqlcgen.ListApprovalsForQuotationRow, error) {
	rows, err := s.q.ListApprovalsForQuotation(ctx, quotationID)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list approvals: %w", err))
	}
	return rows, nil
}
