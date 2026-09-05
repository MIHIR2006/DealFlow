package http

import (
	"net/http"
	"strconv"
	"time"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
	"github.com/gin-gonic/gin"
)

type quotationHandler struct {
	svc *service.QuoteService
}

// auditPageSize bounds how much history the detail view carries. The full
// trail is available on its own endpoint when someone needs it.
const auditPageSize int32 = 50

func (h quotationHandler) list(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

	customerID, err := optionalInt64Query(c, "customer_id")
	if err != nil {
		Fail(c, err)
		return
	}
	cursor, err := optionalInt64Query(c, "cursor")
	if err != nil {
		Fail(c, err)
		return
	}

	var status *string
	if s := c.Query("status"); s != "" {
		status = &s
	}

	limit := pageLimit(c)
	rows, err := h.svc.List(c.Request.Context(), actor, service.ListFilter{
		Status: status, CustomerID: customerID, Cursor: cursor, Limit: limit + 1,
	})
	if err != nil {
		Fail(c, err)
		return
	}

	// One extra row tells the handler another page exists without a second
	// count query. The listing is newest first, so the cursor walks down.
	var next string
	if len(rows) > int(limit) {
		rows = rows[:limit]
		next = strconv.FormatInt(rows[len(rows)-1].ID, 10)
	}

	out := make([]dto.QuotationSummary, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.QuotationSummary{
			ID: r.ID, Reference: r.Reference, Status: r.Status,
			CustomerID: r.CustomerID, CustomerName: r.CustomerName,
			CustomerTier: r.CustomerTier, RepName: r.RepName,
			LineCount:        r.LineCount,
			NetSubtotal:      r.NetSubtotal.String(),
			GrandTotal:       r.GrandTotal.String(),
			MarginPct:        r.MarginPct.String(),
			BlendedRiskScore: r.BlendedRiskScore.String(),
			RequiredLevel:    r.RequiredLevel,
			LastActivityAt:   iso(r.LastActivityAt),
		})
	}
	OK(c, http.StatusOK, Page[dto.QuotationSummary]{Data: out, NextCursor: next})
}

func (h quotationHandler) get(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
	ctx := c.Request.Context()

	quote, err := h.svc.Get(ctx, actor, id)
	if err != nil {
		Fail(c, err)
		return
	}

	// The detail view is one request: header, lines, verdict, chain, trail.
	// Four queries in total, which is what keeps the builder responsive with
	// thousands of quotations seeded.
	approvals, err := h.svc.Approvals(ctx, id)
	if err != nil {
		Fail(c, err)
		return
	}
	audit, err := h.svc.AuditTrail(ctx, id, auditPageSize)
	if err != nil {
		Fail(c, err)
		return
	}

	body := quotationDTO(quote)
	body.Approvals = approvalsDTO(approvals)
	body.Audit = auditDTO(audit)
	OK(c, http.StatusOK, body)
}

func (h quotationHandler) create(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

	var req dto.CreateQuotationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	quote, err := h.svc.Create(c.Request.Context(), actor, req.CustomerID)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, quotationDTO(quote))
}

func (h quotationHandler) addLine(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.AddLineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	qty, err := parseDecimal(req.Qty, "qty")
	if err != nil {
		Fail(c, err)
		return
	}
	discount, err := parseOptionalDecimal(req.DiscountPct, "discount_pct")
	if err != nil {
		Fail(c, err)
		return
	}

	quote, err := h.svc.AddLine(c.Request.Context(), actor, id, service.LineInput{
		ProductID: req.ProductID, Qty: qty, DiscountPct: discount, PlanID: req.PlanID,
	})
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, quotationDTO(quote))
}

func (h quotationHandler) updateLine(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
	lineID, err := pathInt64(c, "lineId")
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.UpdateLineRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	qty, err := parseDecimal(req.Qty, "qty")
	if err != nil {
		Fail(c, err)
		return
	}
	discount, err := parseOptionalDecimal(req.DiscountPct, "discount_pct")
	if err != nil {
		Fail(c, err)
		return
	}

	quote, err := h.svc.UpdateLine(c.Request.Context(), actor, id, lineID, qty, discount)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, quotationDTO(quote))
}

func (h quotationHandler) deleteLine(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}
	lineID, err := pathInt64(c, "lineId")
	if err != nil {
		Fail(c, err)
		return
	}

	quote, err := h.svc.DeleteLine(c.Request.Context(), actor, id, lineID)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, quotationDTO(quote))
}

func (h quotationHandler) setOrderDiscount(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.SetOrderDiscountRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}
	pct, err := parseDecimal(req.OrderDiscountPct, "order_discount_pct")
	if err != nil {
		Fail(c, err)
		return
	}

	quote, err := h.svc.SetOrderDiscount(c.Request.Context(), actor, id, pct)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, quotationDTO(quote))
}

func (h quotationHandler) submit(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	quote, err := h.svc.Submit(c.Request.Context(), actor, id)
	if err != nil {
		Fail(c, err)
		return
	}

	approvals, err := h.svc.Approvals(c.Request.Context(), id)
	if err != nil {
		Fail(c, err)
		return
	}

	body := quotationDTO(quote)
	body.Approvals = approvalsDTO(approvals)
	OK(c, http.StatusOK, body)
}

// upsell ranks products worth suggesting for this quotation, with the margin
// impact of adding each one.
func (h quotationHandler) upsell(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	suggestions, err := h.svc.Upsells(c.Request.Context(), actor, id, int(pageLimit(c)))
	if err != nil {
		Fail(c, err)
		return
	}

	out := make([]dto.Upsell, 0, len(suggestions))
	for _, s := range suggestions {
		out = append(out, dto.Upsell{
			ProductID: s.ProductID, Name: s.Name, SKU: s.SKU,
			UnitPrice: s.UnitPrice.String(), IsPromoted: s.IsPromoted,
			Score:          s.Score.String(),
			MarginDelta:    s.MarginDelta.String(),
			MarginPctDelta: s.MarginPctDelta.String(),
		})
	}
	OK(c, http.StatusOK, Page[dto.Upsell]{Data: out})
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

func quotationDTO(q service.Quotation) dto.Quotation {
	h := q.Header

	out := dto.Quotation{
		ID: h.ID, Reference: h.Reference, Status: h.Status, Version: h.Version,
		CustomerID: h.CustomerID, CustomerName: h.CustomerName,
		CustomerTier: h.CustomerTier, RepName: h.RepName,
		OrderDiscountPct: h.OrderDiscountPct.String(),
		LastActivityAt:   iso(h.LastActivityAt),
		Lines:            make([]dto.QuotationLine, 0, len(q.Lines)),
		Totals: dto.QuotationTotals{
			ListSubtotal:   q.Totals.ListSubtotal.String(),
			DiscountTotal:  q.Totals.DiscountTotal.String(),
			NetSubtotal:    q.Totals.NetSubtotal.String(),
			TaxTotal:       q.Totals.TaxTotal.String(),
			GrandTotal:     q.Totals.GrandTotal.String(),
			MarginAmount:   q.Totals.MarginAmount.String(),
			MarginPct:      q.Totals.MarginPct.String(),
			OneTimeTotal:   q.Totals.OneTimeTotal.String(),
			RecurringTotal: q.Totals.RecurringTotal.String(),
		},
		Risk: dto.RiskVerdict{
			BlendedScore:   q.Risk.BlendedScore.String(),
			MaxLineOverage: q.Risk.MaxLineOverage.String(),
			RequiredLevel:  levelString(string(q.Risk.RequiredLevel)),
			Rationale:      q.Risk.Rationale,
			Breakdown:      make([]dto.RiskLine, 0, len(q.Risk.Breakdown)),
			ConfigVersion:  q.ConfigVersion,
		},
	}

	// Line figures come from the engine's output rather than the stored
	// columns, so the response reflects this run even before it is persisted.
	computed := make(map[int64]int, len(q.Totals.Lines))
	for i, l := range q.Totals.Lines {
		computed[l.LineID] = i
	}

	for _, l := range q.Lines {
		line := dto.QuotationLine{
			ID: l.ID, Position: l.Position,
			ProductID: l.ProductID, ProductName: l.ProductName, SKU: l.Sku,
			CategoryID: l.CategoryID, CategoryName: l.CategoryName,
			Qty:             l.Qty.String(),
			UnitPrice:       l.UnitPrice.String(),
			LineDiscountPct: l.LineDiscountPct.String(),
			TaxRatePct:      l.TaxRatePct.String(),
			LineType:        l.LineType,
			PlanID:          l.PlanID,
			PlanName:        l.PlanName,
			PlanPeriod:      l.PlanPeriod,
		}

		if i, ok := computed[l.ID]; ok {
			cl := q.Totals.Lines[i]
			line.EffectiveDiscountPct = cl.EffectiveDiscountPct.String()
			line.ListValue = cl.ListValue.String()
			line.DiscountAmount = cl.DiscountAmount.String()
			line.NetAmount = cl.NetAmount.String()
			line.TaxAmount = cl.TaxAmount.String()
			line.MarginAmount = cl.MarginAmount.String()
			line.MarginPct = cl.MarginPct.String()
		}
		out.Lines = append(out.Lines, line)
	}

	for _, b := range q.Risk.Breakdown {
		out.Risk.Breakdown = append(out.Risk.Breakdown, dto.RiskLine{
			LineID: b.LineID, ProductName: b.ProductName, CategoryName: b.CategoryName,
			GivenPct:   b.GivenPct.String(),
			AllowedPct: b.AllowedPct.String(),
			OveragePts: b.OveragePts.String(),
			ListValue:  b.ListValue.String(),
			IsOver:     b.IsOver,
		})
	}

	return out
}

func approvalsDTO(rows []sqlcgen.ListApprovalsForQuotationRow) []dto.ApprovalStep {
	out := make([]dto.ApprovalStep, 0, len(rows))
	for _, r := range rows {
		step := dto.ApprovalStep{
			ID: r.ID, Round: r.Round, Step: r.Step,
			RequiredRole: r.RequiredRole, Status: r.Status,
			Reason: r.Reason, CreatedAt: iso(r.CreatedAt),
		}
		if r.ActorName != nil {
			step.ActorName = r.ActorName
		}
		if r.DecidedAt != nil {
			at := iso(*r.DecidedAt)
			step.DecidedAt = &at
		}
		out = append(out, step)
	}
	return out
}

func auditDTO(rows []sqlcgen.AuditLog) []dto.AuditEntry {
	out := make([]dto.AuditEntry, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.AuditEntry{
			ID: r.ID, Action: r.Action, ActorLabel: r.ActorLabel,
			Note: r.Note, CreatedAt: iso(r.CreatedAt),
		})
	}
	return out
}

func actorAndID(c *gin.Context) (auth.Principal, int64, error) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		return auth.Principal{}, 0, apierr.Unauthenticated("")
	}
	id, err := pathInt64(c, "id")
	if err != nil {
		return auth.Principal{}, 0, err
	}
	return actor, id, nil
}

func iso(t time.Time) string { return t.UTC().Format(time.RFC3339) }

// levelString normalises an unset level so the client never has to handle "".
func levelString(l string) string {
	if l == "" {
		return "NONE"
	}
	return l
}
