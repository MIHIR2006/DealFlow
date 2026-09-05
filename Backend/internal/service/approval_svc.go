package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/db"
)

// ApprovalService moves quotations through the chain the risk engine built.
//
// The rules it enforces are the ones that make an approval mean something:
// steps are taken in order, only by someone holding the required role, never
// by the rep who stands to gain, and always with a recorded reason when the
// answer is no. Every decision lands in the audit trail beside the ones
// before it, including from rounds that were superseded.
type ApprovalService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	quote *QuoteService
}

// NewApprovalService builds the service.
func NewApprovalService(pool *pgxpool.Pool, q *sqlcgen.Queries, quote *QuoteService) *ApprovalService {
	return &ApprovalService{pool: pool, q: q, quote: quote}
}

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
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list pending approvals: %w", err))
	}
	return rows, nil
}

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
		}
		return Quotation{}, apierr.Internal(fmt.Errorf("get approval request: %w", err))
	}

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
			})
			if err != nil {
				return fmt.Errorf("count open approvals: %w", err)
			}
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
