package service

import (
	"context"
<<<<<<< HEAD
	"encoding/json"
=======
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/db"
)

<<<<<<< HEAD
// ApprovalService moves quotations through the chain the risk engine built.
//
// The rules it enforces are the ones that make an approval mean something:
// steps are taken in order, only by someone holding the required role, never
// by the rep who stands to gain, and always with a recorded reason when the
// answer is no. Every decision lands in the audit trail beside the ones
// before it, including from rounds that were superseded.
=======
// ApprovalService is the reviewer's side of the governance chain: the inbox,
// and the three decisions a reviewer can take on a step.
//
// A step is only ever actionable when it is the lowest-numbered pending step
// of the current round. That, plus the role match and the self-approval
// check, are enforced here rather than in the handler, because the router
// only knows that the caller holds SOME reviewing role — it has no way to
// know whose quotation this is or whose turn it is.
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
type ApprovalService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	quote *QuoteService
}

// NewApprovalService builds the service.
func NewApprovalService(pool *pgxpool.Pool, q *sqlcgen.Queries, quote *QuoteService) *ApprovalService {
	return &ApprovalService{pool: pool, q: q, quote: quote}
}

<<<<<<< HEAD
// Decision is what a reviewer did.
type Decision string

const (
	// DecisionApprove advances the chain, or completes it.
	DecisionApprove Decision = "APPROVED"

	// DecisionReturn sends the quotation back to the rep for revision. The
	// deal stays alive; the terms need work.
	DecisionReturn Decision = "RETURNED"

	// DecisionReject closes the deal.
	DecisionReject Decision = "REJECTED"
)

// Inbox returns the approval steps the caller is able to act on.
//
// A manager sees steps awaiting a manager and a finance reviewer sees theirs;
// an administrator sees everything, because they can act at any step when an
// approver is unavailable.
func (s *ApprovalService) Inbox(ctx context.Context, actor auth.Principal, cursor *int64, limit int32) ([]sqlcgen.ListPendingApprovalsRow, error) {
	params := sqlcgen.ListPendingApprovalsParams{Cursor: cursor, PageSize: limit}

	switch actor.Role {
	case auth.RoleManager, auth.RoleFinance:
		role := string(actor.Role)
		params.RequiredRole = &role
	case auth.RoleAdmin:
		// Unfiltered.
	default:
		return nil, apierr.Forbidden("your role does not review approvals")
	}

	rows, err := s.q.ListPendingApprovals(ctx, params)
=======
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
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list pending approvals: %w", err))
	}
	return rows, nil
}

<<<<<<< HEAD
// DecideInput is a reviewer's verdict on one step.
type DecideInput struct {
	ApprovalID int64
	Decision   Decision
	Reason     string
}

// Decide records a reviewer's answer and moves the quotation accordingly.
func (s *ApprovalService) Decide(ctx context.Context, actor auth.Principal, in DecideInput) (Quotation, error) {
	// Turning something down has to come with a reason. An approval trail of
	// bare rejections tells a rep nothing and tells an auditor less.
	if in.Decision != DecisionApprove && in.Reason == "" {
		return Quotation{}, apierr.Validation("a reason is required when returning or rejecting a quotation")
	}

	request, err := s.q.GetApprovalRequest(ctx, in.ApprovalID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Quotation{}, apierr.NotFound("approval request not found")
=======
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
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("get approval request: %w", err))
	}

<<<<<<< HEAD
	if err := s.checkCanDecide(ctx, actor, request); err != nil {
		return Quotation{}, err
	}

	quotationID := request.QuotationID
	var newStatus string

	err = db.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		qtx := s.q.WithTx(tx)

		actorID := actor.UserID
		decided, err := qtx.DecideApprovalRequest(ctx, sqlcgen.DecideApprovalRequestParams{
			ID:      in.ApprovalID,
			Status:  string(in.Decision),
			ActorID: &actorID,
			Reason:  in.Reason,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// Someone else decided it between the read and the write.
				return apierr.Conflict("this approval step has already been decided")
			}
			return fmt.Errorf("record decision: %w", err)
		}

		switch in.Decision {
		case DecisionApprove:
			// The chain is complete only when no step of this round is still
			// waiting. Until then the quotation stays where it is.
			open, err := qtx.CountOpenApprovals(ctx, sqlcgen.CountOpenApprovalsParams{
				QuotationID: quotationID, Round: decided.Round,
=======
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
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
			})
			if err != nil {
				return fmt.Errorf("count open approvals: %w", err)
			}
<<<<<<< HEAD
			if open > 0 {
				newStatus = "PENDING_APPROVAL"
				return nil
			}
			newStatus = "APPROVED"

		case DecisionReturn:
			// Later steps in this round never get to run: the terms they
			// would have reviewed are about to change.
			if _, err := qtx.SupersedeOpenApprovals(ctx, quotationID); err != nil {
				return fmt.Errorf("supersede remaining steps: %w", err)
			}
			newStatus = "DRAFT"

		case DecisionReject:
			if _, err := qtx.SupersedeOpenApprovals(ctx, quotationID); err != nil {
				return fmt.Errorf("supersede remaining steps: %w", err)
			}
			newStatus = "REJECTED"

		default:
			return apierr.Validation("decision must be one of APPROVED, RETURNED, REJECTED")
		}

		if _, err := qtx.UpdateQuotationStatus(ctx, sqlcgen.UpdateQuotationStatusParams{
			ID: quotationID, Status: newStatus,
=======
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
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
		}); err != nil {
			return fmt.Errorf("update quotation status: %w", err)
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

<<<<<<< HEAD
	s.auditDecision(ctx, quotationID, actor, request, in, newStatus)

	return s.quote.Get(ctx, actor, quotationID)
}

// checkCanDecide holds the four rules that make an approval trustworthy.
func (s *ApprovalService) checkCanDecide(ctx context.Context, actor auth.Principal, request sqlcgen.GetApprovalRequestRow) error {
	// 1. The step must still be open. Re-deciding a closed step would let a
	//    reviewer overwrite a colleague's answer.
	if request.Status != "PENDING" {
		return apierr.Conflict(
			fmt.Sprintf("this step was already %s", lower(request.Status)))
	}

	// 2. The quotation has to be in the chain. A returned or rejected
	//    quotation can have stale steps pointing at it.
	if request.QuotationStatus != "PENDING_APPROVAL" {
		return apierr.Conflict(
			fmt.Sprintf("this quotation is %s and is not awaiting approval",
				lower(request.QuotationStatus)))
	}

	// 3. The reviewer must hold the role the step calls for. A manager
	//    signing the finance step would make a two-level chain one level
	//    wearing a hat.
	if !actor.Role.CanApproveAs(auth.Role(request.RequiredRole)) {
		return apierr.Forbidden(
			fmt.Sprintf("this step requires %s", request.RequiredRole))
	}

	// 4. Nobody approves their own deal, whatever role they hold. This is the
	//    rule the whole governance model rests on.
	if request.RepID == actor.UserID {
		return apierr.Forbidden("you cannot approve a quotation you raised")
	}

	// Steps run in order, and the id in the URL is not trusted to be the one
	// that is next. Deciding step 2 before step 1 would let finance sign off
	// terms a manager never saw.
	next, err := s.q.GetNextPendingApproval(ctx, request.QuotationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return apierr.Conflict("this quotation has no step awaiting a decision")
		}
		return apierr.Internal(fmt.Errorf("get next pending approval: %w", err))
	}
	if next.ID != request.ID {
		return apierr.Conflict(
			fmt.Sprintf("step %d must be decided before step %d", next.Step, request.Step))
	}

	return nil
}

func (s *ApprovalService) auditDecision(
	ctx context.Context, quotationID int64, actor auth.Principal,
	request sqlcgen.GetApprovalRequestRow, in DecideInput, newStatus string,
) {
	action := map[Decision]string{
		DecisionApprove: "APPROVED",
		DecisionReturn:  "RETURNED",
		DecisionReject:  "REJECTED",
	}[in.Decision]

	note := in.Reason
	if note == "" {
		note = fmt.Sprintf("Approved at step %d as %s", request.Step, request.RequiredRole)
	}

	payload, _ := json.Marshal(map[string]any{
		"approval_id":      request.ID,
		"round":            request.Round,
		"step":             request.Step,
		"required_role":    request.RequiredRole,
		"decision":         string(in.Decision),
		"quotation_status": newStatus,
	})

	actorID := actor.UserID
	_, _ = s.q.AppendAuditLog(ctx, sqlcgen.AppendAuditLogParams{
		EntityType: "quotation",
		EntityID:   quotationID,
		Action:     action,
		ActorID:    &actorID,
		ActorLabel: actor.Email,
		Note:       note,
		Payload:    payload,
	})
}

// Approvals returns every step recorded for a quotation, superseded rounds
// included.
func (s *ApprovalService) Approvals(ctx context.Context, quotationID int64) ([]sqlcgen.ListApprovalsForQuotationRow, error) {
	return s.quote.Approvals(ctx, quotationID)
}

// AuditTrail returns the recorded history for a quotation.
func (s *ApprovalService) AuditTrail(ctx context.Context, quotationID int64, limit int32) ([]sqlcgen.AuditLog, error) {
	return s.quote.AuditTrail(ctx, quotationID, limit)
}

func lower(s string) string {
	out := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '_' {
			out[i] = ' '
			continue
		}
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		out[i] = c
	}
	return string(out)
}
=======
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
	return s.quote.Recalculate(ctx, actor, header)
}

// Approvals returns every approval step recorded for a quotation, including
// superseded rounds. Exposed so the handler can attach the chain to a
// decision response without reaching into QuoteService directly.
func (s *ApprovalService) Approvals(ctx context.Context, quotationID int64) ([]sqlcgen.ListApprovalsForQuotationRow, error) {
	return s.quote.Approvals(ctx, quotationID)
}
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
