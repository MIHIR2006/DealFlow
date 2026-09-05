package http

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
)

type approvalHandler struct {
	svc *service.ApprovalService
}

func (h approvalHandler) inbox(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

	cursor, err := optionalInt64Query(c, "cursor")
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD

	limit := pageLimit(c)
	rows, err := h.svc.Inbox(c.Request.Context(), actor, cursor, limit+1)
=======
	limit := pageLimit(c)

	rows, err := h.svc.Inbox(c.Request.Context(), actor, service.InboxFilter{Cursor: cursor, Limit: limit + 1})
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}

	var next string
	if len(rows) > int(limit) {
		rows = rows[:limit]
		next = strconv.FormatInt(rows[len(rows)-1].ID, 10)
	}

<<<<<<< HEAD
	out := make([]dto.PendingApproval, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.PendingApproval{
			ID: r.ID, QuotationID: r.QuotationID, Reference: r.Reference,
			Round: r.Round, Step: r.Step,
			RequiredRole: r.RequiredRole, Status: r.Status,
			CustomerName: r.CustomerName, CustomerTier: r.CustomerTier,
=======
	out := make([]dto.ApprovalInboxRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.ApprovalInboxRow{
			ID: r.ID, QuotationID: r.QuotationID, Round: r.Round, Step: r.Step,
			RequiredRole: r.RequiredRole, Status: r.Status, CreatedAt: iso(r.CreatedAt),
			Reference: r.Reference, CustomerName: r.CustomerName, CustomerTier: r.CustomerTier,
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
			RepName:          r.RepName,
			GrandTotal:       r.GrandTotal.String(),
			BlendedRiskScore: r.BlendedRiskScore.String(),
			MaxLineOverage:   r.MaxLineOverage.String(),
<<<<<<< HEAD
			RequiredLevel:    r.RequiredLevel,
			CreatedAt:        iso(r.CreatedAt),
		})
	}
	OK(c, http.StatusOK, Page[dto.PendingApproval]{Data: out, NextCursor: next})
}

// approve advances the chain, or completes it when this was the last step.
=======
			RequiredLevel:    levelString(r.RequiredLevel),
		})
	}
	OK(c, http.StatusOK, Page[dto.ApprovalInboxRow]{Data: out, NextCursor: next})
}

>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
func (h approvalHandler) approve(c *gin.Context) {
	h.decide(c, service.DecisionApprove)
}

<<<<<<< HEAD
// returnForRevision sends the quotation back to the rep. The deal stays
// alive; the terms need work. This is a distinct outcome from a rejection,
// and the audit trail keeps both.
=======
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
func (h approvalHandler) returnForRevision(c *gin.Context) {
	h.decide(c, service.DecisionReturn)
}

<<<<<<< HEAD
// reject closes the deal.
=======
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
func (h approvalHandler) reject(c *gin.Context) {
	h.decide(c, service.DecisionReject)
}

func (h approvalHandler) decide(c *gin.Context, decision service.Decision) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}
	id, err := pathInt64(c, "id")
	if err != nil {
		Fail(c, err)
		return
	}

<<<<<<< HEAD
	// An empty body is fine for an approval, where a note is optional.
	var req dto.DecisionRequest
=======
	var req dto.ApprovalActionRequest
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			Fail(c, bindError(err))
			return
		}
	}

<<<<<<< HEAD
	quote, err := h.svc.Decide(c.Request.Context(), actor, service.DecideInput{
		ApprovalID: id, Decision: decision, Reason: req.Reason,
	})
=======
	quote, err := h.svc.Decide(c.Request.Context(), actor, id, decision, req.Reason)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}

	approvals, err := h.svc.Approvals(c.Request.Context(), quote.Header.ID)
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD
	audit, err := h.svc.AuditTrail(c.Request.Context(), quote.Header.ID, auditPageSize)
	if err != nil {
		Fail(c, err)
		return
	}

	body := quotationDTO(quote)
	body.Approvals = approvalsDTO(approvals)
	body.Audit = auditDTO(audit)
=======

	body := quotationDTO(quote)
	body.Approvals = approvalsDTO(approvals)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	OK(c, http.StatusOK, body)
}
