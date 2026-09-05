package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/risk"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/db"
)

// PortalService is the customer's side of a negotiation.
//
// Its defining behaviour is that a customer action changes internal workflow
// state on its own. When a counter-offer pushes a quotation past what policy
// allows, the quotation re-enters the approval chain immediately -- no email,
// no rep forwarding it, no one deciding to escalate. The governance engine
// treats the customer's proposed terms exactly as it treats the rep's.
//
// Everything here is scoped by a token that names one quotation. No method
// accepts a quotation id, so a customer cannot reach a deal that is not
// theirs even if they guess an identifier.
type PortalService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	quote *QuoteService
}

// NewPortalService builds the service.
func NewPortalService(pool *pgxpool.Pool, q *sqlcgen.Queries, quote *QuoteService) *PortalService {
	return &PortalService{pool: pool, q: q, quote: quote}
}

// customerPrincipal labels portal actions in the audit trail. It carries no
// user id: a customer is not a staff account, and the trail records who acted
// without pretending otherwise.
func customerPrincipal(name string) auth.Principal {
	return auth.Principal{Email: name + " (customer)"}
}

// View is what a customer sees.
type View struct {
	Quotation Quotation
	Messages  []sqlcgen.NegotiationMessage
	Offers    []sqlcgen.ListCounterOffersRow
	ExpiresAt time.Time
}

// DefaultPortalTTL is how long a link lives when the caller does not say.
const DefaultPortalTTL = 14 * 24 * time.Hour

// Send generates a portal link for an approved quotation.
//
// Any earlier link for this quotation is revoked, so a token that has been
// forwarded on cannot be used to reopen a negotiation after the terms moved.
func (s *PortalService) Send(ctx context.Context, actor auth.Principal, quotationID int64, ttl time.Duration) (string, error) {
	quote, err := s.quote.Get(ctx, actor, quotationID)
	if err != nil {
		return "", err
	}

	switch quote.Header.Status {
	case "APPROVED", "SENT", "UNDER_NEGOTIATION":
	default:
		return "", apierr.Conflict(fmt.Sprintf(
			"a quotation in %s cannot be sent; it must clear approval first",
			quote.Header.Status))
	}

	// A non-positive lifetime would mint a link that is already expired, and
	// the customer would see nothing but "this link is invalid".
	if ttl <= 0 {
		ttl = DefaultPortalTTL
	}

	token, err := auth.NewPortalToken()
	if err != nil {
		return "", apierr.Internal(err)
	}

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if _, err := qtx.RevokePortalTokensForQuotation(ctx, quotationID); err != nil {
			return fmt.Errorf("revoke previous tokens: %w", err)
		}
		if _, err := qtx.CreatePortalToken(ctx, sqlcgen.CreatePortalTokenParams{
			Token:       token,
			QuotationID: quotationID,
			CustomerID:  quote.Header.CustomerID,
			ExpiresAt:   time.Now().Add(ttl),
		}); err != nil {
			return fmt.Errorf("create portal token: %w", err)
		}
		if quote.Header.Status == "APPROVED" {
			if _, err := qtx.UpdateQuotationStatus(ctx, sqlcgen.UpdateQuotationStatusParams{
				ID: quotationID, Status: "SENT",
			}); err != nil {
				return fmt.Errorf("update status: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return "", apierr.Internal(err)
	}

	s.quote.Audit(ctx, quotationID, "SENT", actor,
		"Quotation sent to the customer portal", nil)

	return token, nil
}

// View returns the quotation a token names, with its negotiation history.
func (s *PortalService) View(ctx context.Context, row sqlcgen.GetQuotationByPortalTokenRow) (View, error) {
	header, err := s.quote.Header(ctx, row.ID)
	if err != nil {
		return View{}, err
	}

	lines, err := s.q.ListQuotationLines(ctx, row.ID)
	if err != nil {
		return View{}, apierr.Internal(fmt.Errorf("list lines: %w", err))
	}
	messages, err := s.q.ListNegotiationMessages(ctx, row.ID)
	if err != nil {
		return View{}, apierr.Internal(fmt.Errorf("list messages: %w", err))
	}
	offers, err := s.q.ListCounterOffers(ctx, row.ID)
	if err != nil {
		return View{}, apierr.Internal(fmt.Errorf("list counter offers: %w", err))
	}

	totals, verdict, version := s.quote.evaluate(lines, header.OrderDiscountPct, risk.Tier(header.CustomerTier))

	return View{
		Quotation: Quotation{
			Header: header, Lines: lines,
			Risk: verdict, Totals: totals, ConfigVersion: version,
		},
		Messages:  messages,
		Offers:    offers,
		ExpiresAt: row.ExpiresAt,
	}, nil
}

// PostMessage records a customer comment, optionally against one line.
func (s *PortalService) PostMessage(ctx context.Context, row sqlcgen.GetQuotationByPortalTokenRow, lineID *int64, body string) (View, error) {
	if body == "" {
		return View{}, apierr.Validation("a message cannot be empty")
	}
	if err := s.assertNegotiable(row.Status); err != nil {
		return View{}, err
	}
	if lineID != nil {
		if err := s.assertLineBelongs(ctx, row.ID, *lineID); err != nil {
			return View{}, err
		}
	}

	if _, err := s.q.CreateNegotiationMessage(ctx, sqlcgen.CreateNegotiationMessageParams{
		QuotationID:     row.ID,
		QuotationLineID: lineID,
		AuthorType:      "CUSTOMER",
		AuthorLabel:     row.CustomerName,
		Body:            body,
	}); err != nil {
		return View{}, apierr.Internal(fmt.Errorf("create message: %w", err))
	}

	// A comment counts as activity, so a deal being actively discussed does
	// not show up on the stalled list.
	if err := s.q.TouchQuotation(ctx, row.ID); err != nil {
		return View{}, apierr.Internal(fmt.Errorf("touch quotation: %w", err))
	}

	s.quote.Audit(ctx, row.ID, "CUSTOMER_MESSAGE", customerPrincipal(row.CustomerName),
		truncate(body, 120), map[string]any{"line_id": lineID})

	return s.View(ctx, row)
}

// CounterOfferInput is a customer's proposed discount.
type CounterOfferInput struct {
	// LineID scopes the proposal to one line. Absent, it is read as a
	// discount across the whole order.
	LineID *int64

	ProposedDiscountPct decimal.Decimal
	Note                string
}

// CounterOfferResult is what the system decided about a proposal.
type CounterOfferResult struct {
	View View

	// Outcome is AUTO_ACCEPTED when the proposed terms stay inside policy,
	// or ROUTED_FOR_APPROVAL when they do not.
	Outcome string

	// RequiredLevel is the chain the proposal triggered, if any.
	RequiredLevel risk.Level
}

// CounterOffer applies a customer's proposed discount and lets governance
// decide what happens next.
//
// This is the loop the whole product is built around. The proposal is applied
// to the quotation, both engines run, and the result routes itself: within
// policy the quotation simply updates, beyond it the approval chain is rebuilt
// from step one and the quotation goes back to PENDING_APPROVAL. No rep is
// involved in that decision, and none can be, which is the point.
func (s *PortalService) CounterOffer(ctx context.Context, row sqlcgen.GetQuotationByPortalTokenRow, in CounterOfferInput) (CounterOfferResult, error) {
	if in.ProposedDiscountPct.IsNegative() || in.ProposedDiscountPct.GreaterThan(decimal.NewFromInt(100)) {
		return CounterOfferResult{}, apierr.Validation("the proposed discount must be between 0 and 100")
	}
	if err := s.assertNegotiable(row.Status); err != nil {
		return CounterOfferResult{}, err
	}

	header, err := s.quote.Header(ctx, row.ID)
	if err != nil {
		return CounterOfferResult{}, err
	}

	var previous decimal.Decimal
	var targetLine *sqlcgen.GetQuotationLineRow

	if in.LineID != nil {
		line, err := s.q.GetQuotationLine(ctx, sqlcgen.GetQuotationLineParams{
			ID: *in.LineID, QuotationID: row.ID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return CounterOfferResult{}, apierr.NotFound("that line is not on this quotation")
			}
			return CounterOfferResult{}, apierr.Internal(fmt.Errorf("get line: %w", err))
		}
		previous = line.LineDiscountPct
		targetLine = &line
	} else {
		previous = header.OrderDiscountPct
	}

	// Apply the proposal optimistically, then let the engines judge it. The
	// customer's terms are scored by exactly the same rules as the rep's.
	if targetLine != nil {
		if _, err := s.q.UpdateQuotationLineInput(ctx, sqlcgen.UpdateQuotationLineInputParams{
			ID:              targetLine.ID,
			Qty:             targetLine.Qty,
			LineDiscountPct: in.ProposedDiscountPct,
		}); err != nil {
			return CounterOfferResult{}, apierr.Internal(fmt.Errorf("apply line discount: %w", err))
		}
	} else {
		header.OrderDiscountPct = in.ProposedDiscountPct
	}

	actor := customerPrincipal(row.CustomerName)
	quote, err := s.quote.Recalculate(ctx, actor, header)
	if err != nil {
		return CounterOfferResult{}, err
	}

	level := levelOrNone(quote.Risk.RequiredLevel)
	outcome := "AUTO_ACCEPTED"
	status := "UNDER_NEGOTIATION"
	if level != risk.LevelNone {
		outcome = "ROUTED_FOR_APPROVAL"
		status = "PENDING_APPROVAL"
	}

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		offer, err := qtx.CreateCounterOffer(ctx, sqlcgen.CreateCounterOfferParams{
			QuotationID:         row.ID,
			QuotationLineID:     in.LineID,
			PreviousDiscountPct: previous,
			ProposedDiscountPct: in.ProposedDiscountPct,
			Note:                in.Note,
		})
		if err != nil {
			return fmt.Errorf("record counter offer: %w", err)
		}
		if _, err := qtx.SetCounterOfferOutcome(ctx, sqlcgen.SetCounterOfferOutcomeParams{
			ID: offer.ID, Outcome: outcome,
		}); err != nil {
			return fmt.Errorf("set counter offer outcome: %w", err)
		}

		// Beyond policy, the chain is rebuilt from step one. Any approval
		// already given was for different terms and no longer stands.
		if level != risk.LevelNone {
			if err := RebuildApprovalChain(ctx, qtx, row.ID, level); err != nil {
				return err
			}
		}

		if _, err := qtx.UpdateQuotationStatus(ctx, sqlcgen.UpdateQuotationStatusParams{
			ID: row.ID, Status: status,
		}); err != nil {
			return fmt.Errorf("update status: %w", err)
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return CounterOfferResult{}, apiErr
		}
		return CounterOfferResult{}, apierr.Internal(err)
	}

	scope := "the order"
	if targetLine != nil {
		scope = targetLine.ProductName
	}
	note := fmt.Sprintf("Customer counter-offer on %s: %s%% to %s%%",
		scope, previous, in.ProposedDiscountPct)
	if level != risk.LevelNone {
		note += fmt.Sprintf(" — re-routed to %s", level)
	} else {
		note += " — within policy, accepted"
	}

	s.quote.Audit(ctx, row.ID, "COUNTER_OFFER", actor, note, map[string]any{
		"line_id":               in.LineID,
		"previous_discount_pct": previous.String(),
		"proposed_discount_pct": in.ProposedDiscountPct.String(),
		"blended_risk_score":    quote.Risk.BlendedScore.String(),
		"required_level":        string(level),
		"outcome":               outcome,
	})

	view, err := s.View(ctx, row)
	if err != nil {
		return CounterOfferResult{}, err
	}
	return CounterOfferResult{View: view, Outcome: outcome, RequiredLevel: level}, nil
}

// Confirm accepts the quotation on the customer's behalf.
func (s *PortalService) Confirm(ctx context.Context, row sqlcgen.GetQuotationByPortalTokenRow) (View, error) {
	switch row.Status {
	case "SENT", "UNDER_NEGOTIATION":
	case "PENDING_APPROVAL":
		// The customer's own counter-offer put it here. Confirming now would
		// let them accept terms nobody internally has agreed to.
		return View{}, apierr.Conflict(
			"these terms are being reviewed; you will be able to confirm once that is complete")
	case "CONFIRMED":
		return View{}, apierr.Conflict("this quotation is already confirmed")
	default:
		return View{}, apierr.Conflict("this quotation is no longer open for confirmation")
	}

	err := db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if _, err := qtx.UpdateQuotationStatus(ctx, sqlcgen.UpdateQuotationStatusParams{
			ID: row.ID, Status: "CONFIRMED",
		}); err != nil {
			return fmt.Errorf("update status: %w", err)
		}
		if err := qtx.MarkPortalTokenUsed(ctx, row.TokenID); err != nil {
			return fmt.Errorf("mark token used: %w", err)
		}
		return nil
	})
	if err != nil {
		return View{}, apierr.Internal(err)
	}

	s.quote.Audit(ctx, row.ID, "CUSTOMER_CONFIRMED", customerPrincipal(row.CustomerName),
		"Customer confirmed the quotation from the portal", nil)

	return s.View(ctx, row)
}

// assertNegotiable refuses portal writes on a quotation that is not open to
// them.
func (s *PortalService) assertNegotiable(status string) error {
	switch status {
	case "SENT", "UNDER_NEGOTIATION":
		return nil
	case "PENDING_APPROVAL":
		return apierr.Conflict(
			"these terms are being reviewed; please wait for that to complete")
	case "CONFIRMED":
		return apierr.Conflict("this quotation is already confirmed")
	case "REJECTED":
		return apierr.Conflict("this quotation is no longer available")
	default:
		return apierr.Conflict("this quotation is not open for negotiation")
	}
}

func (s *PortalService) assertLineBelongs(ctx context.Context, quotationID, lineID int64) error {
	if _, err := s.q.GetQuotationLine(ctx, sqlcgen.GetQuotationLineParams{
		ID: lineID, QuotationID: quotationID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.NotFound("that line is not on this quotation")
		}
		return apierr.Internal(fmt.Errorf("get line: %w", err))
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
