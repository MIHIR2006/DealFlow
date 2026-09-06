package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/db"
)

// ApprovalService is the reviewer's side of the governance chain: the inbox,
// and the three decisions a reviewer can take on a step.
//
// A step is only ever actionable when it is the lowest-numbered pending step
// of the current round. That, plus the role match and the self-approval
// check, are enforced here rather than in the handler, because the router
// only knows that the caller holds SOME reviewing role — it has no way to
// know whose quotation this is or whose turn it is.
type ApprovalService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	quote *QuoteService

	// notify tells a customer when terms they proposed are settled. Optional.
	notify *Notifier
}

// WithNotifier attaches outbound mail. Optional; nil disables it.
func (s *ApprovalService) WithNotifier(n *Notifier) *ApprovalService {
	s.notify = n
	return s
}

// NewApprovalService builds the service.
func NewApprovalService(pool *pgxpool.Pool, q *sqlcgen.Queries, quote *QuoteService) *ApprovalService {
	return &ApprovalService{pool: pool, q: q, quote: quote}
}

// InboxFilter narrows the pending-approvals listing.
type InboxFilter struct {
	Cursor *int64
	Limit  int32
}

// Inbox returns the pending steps the caller's role may act on. An
// administrator sees every pending step; a manager or finance reviewer sees
// only the steps that require their own role.
func (s *ApprovalService) Inbox(ctx context.Context, actor auth.Principal, f InboxFilter) ([]sqlcgen.ListPendingApprovalsRow, error) {
	var role *string
	if actor.Role != auth.RoleAdmin {
		r := string(actor.Role)
		role = &r
	}

	rows, err := s.q.ListPendingApprovals(ctx, sqlcgen.ListPendingApprovalsParams{
		RequiredRole: role, Cursor: f.Cursor, PageSize: f.Limit,
	})
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list pending approvals: %w", err))
	}
	return rows, nil
}

// Decision is one of the three actions a reviewer can take on a step.
type Decision string

const (
	DecisionApprove Decision = "APPROVED"
	DecisionReturn  Decision = "RETURNED"
	DecisionReject  Decision = "REJECTED"
)

// Decide applies a reviewer's decision to one approval step.
func (s *ApprovalService) Decide(ctx context.Context, actor auth.Principal, approvalID int64, decision Decision, reason string) (Quotation, error) {
	if decision == DecisionReturn || decision == DecisionReject {
		if reason == "" {
			return Quotation{}, apierr.Validation("a reason is required to return or reject a step")
		}
	}

	req, err := s.q.GetApprovalRequest(ctx, approvalID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Quotation{}, apierr.NotFound("approval step not found")
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("get approval request: %w", err))
	}

	if !actor.Role.CanApproveAs(auth.Role(req.RequiredRole)) {
		return Quotation{}, apierr.Forbidden("your role cannot act on this step")
	}
	if actor.UserID != 0 && actor.UserID == req.RepID {
		return Quotation{}, apierr.Forbidden("you cannot act on your own quotation")
	}

	// Only the step currently at the head of the queue is actionable. This
	// catches finance going before management, a stale id from a superseded
	// round, and a step that was already decided by someone else.
	pending, err := s.q.GetNextPendingApproval(ctx, req.QuotationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Quotation{}, apierr.Conflict("no step on this quotation is currently awaiting a decision")
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("get next pending approval: %w", err))
	}
	if pending.ID != req.ID {
		return Quotation{}, apierr.Conflict("this step is not next in line for a decision")
	}

	actorID := actor.UserID

	var quotationStatus string
	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		if _, err := qtx.DecideApprovalRequest(ctx, sqlcgen.DecideApprovalRequestParams{
			ID: req.ID, Status: string(decision), ActorID: &actorID, Reason: reason,
		}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return apierr.Conflict("this step was already decided")
			}
			return fmt.Errorf("decide approval request: %w", err)
		}

		switch decision {
		case DecisionApprove:
			remaining, err := qtx.CountOpenApprovals(ctx, sqlcgen.CountOpenApprovalsParams{
				QuotationID: req.QuotationID, Round: req.Round,
			})
			if err != nil {
				return fmt.Errorf("count open approvals: %w", err)
			}
			if remaining == 0 {
				quotationStatus = "APPROVED"
			} else {
				quotationStatus = "PENDING_APPROVAL"
			}
		case DecisionReturn:
			quotationStatus = "DRAFT"
		case DecisionReject:
			quotationStatus = "REJECTED"
		}

		// A return or a rejection closes every other open step in the round.
		// An approval never needs this: it either leaves the next step
		// pending or clears the round with nothing left open.
		if decision != DecisionApprove {
			if _, err := qtx.SupersedeOpenApprovals(ctx, req.QuotationID); err != nil {
				return fmt.Errorf("supersede open approvals: %w", err)
			}
		}

		if _, err := qtx.UpdateQuotationStatus(ctx, sqlcgen.UpdateQuotationStatusParams{
			ID: req.QuotationID, Status: quotationStatus,
		}); err != nil {
			return fmt.Errorf("update quotation status: %w", err)
		}

		// A customer counter-offer that was routed here is still open on the
		// customer's own screen. Once the round has an answer, give it one:
		// otherwise their negotiation history reads "sent for approval"
		// indefinitely, including after the decision they were waiting for.
		//
		// Only a settled round resolves it. A step approved with others still
		// pending has not decided anything yet, and a return sends the deal
		// back to the rep to revise, which leaves the proposal genuinely open.
		if offerOutcome := counterOfferOutcomeFor(quotationStatus); offerOutcome != "" {
			if _, err := qtx.ResolveRoutedCounterOffers(ctx, sqlcgen.ResolveRoutedCounterOffersParams{
				QuotationID: req.QuotationID, Outcome: offerOutcome,
			}); err != nil {
				return fmt.Errorf("resolve routed counter offers: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		var apiErr *apierr.Error
		if errors.As(err, &apiErr) {
			return Quotation{}, apiErr
		}
		return Quotation{}, apierr.Internal(err)
	}

	s.quote.audit(ctx, req.QuotationID, "APPROVAL_STEP_"+string(decision), actor,
		reason, map[string]any{"approval_id": req.ID, "step": req.Step, "round": req.Round})
	if quotationStatus == "APPROVED" {
		s.quote.audit(ctx, req.QuotationID, "APPROVED", actor,
			"Every required approval has been given", nil)
	} else if decision == DecisionReturn {
		s.quote.audit(ctx, req.QuotationID, "RETURNED", actor, reason, nil)
	} else if decision == DecisionReject {
		s.quote.audit(ctx, req.QuotationID, "REJECTED", actor, reason, nil)
	}

	header, err := s.quote.Header(ctx, req.QuotationID)
	if err != nil {
		return Quotation{}, err
	}

	// A customer whose counter-offer put this round in motion is waiting on an
	// answer. Only a settled round has one: a step approved with others still
	// pending has decided nothing yet.
	if outcome := counterOfferOutcomeFor(quotationStatus); outcome != "" {
		s.notify.CounterOfferDecided(ctx, header, outcome)
	}

	return s.quote.Recalculate(ctx, actor, header)
}

// Approvals returns every approval step recorded for a quotation, including
// superseded rounds. Exposed so the handler can attach the chain to a
// decision response without reaching into QuoteService directly.
func (s *ApprovalService) Approvals(ctx context.Context, quotationID int64) ([]sqlcgen.ListApprovalsForQuotationRow, error) {
	return s.quote.Approvals(ctx, quotationID)
}

// counterOfferOutcomeFor maps a settled quotation status onto what it means for
// a counter-offer that was awaiting that decision. An empty string means the
// round has not settled anything and open offers stay open.
func counterOfferOutcomeFor(quotationStatus string) string {
	switch quotationStatus {
	case "APPROVED":
		return "APPROVED"
	case "REJECTED":
		return "REJECTED"
	default:
		return ""
	}
}
