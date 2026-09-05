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

	limit := pageLimit(c)
	rows, err := h.svc.Inbox(c.Request.Context(), actor, cursor, limit+1)
	if err != nil {
		Fail(c, err)
		return
	}

	var next string
	if len(rows) > int(limit) {
		rows = rows[:limit]
		next = strconv.FormatInt(rows[len(rows)-1].ID, 10)
	}

	out := make([]dto.PendingApproval, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.PendingApproval{
			ID: r.ID, QuotationID: r.QuotationID, Reference: r.Reference,
			Round: r.Round, Step: r.Step,
			RequiredRole: r.RequiredRole, Status: r.Status,
			CustomerName: r.CustomerName, CustomerTier: r.CustomerTier,
			RepName:          r.RepName,
			GrandTotal:       r.GrandTotal.String(),
			BlendedRiskScore: r.BlendedRiskScore.String(),
			MaxLineOverage:   r.MaxLineOverage.String(),
			RequiredLevel:    r.RequiredLevel,
			CreatedAt:        iso(r.CreatedAt),
		})
	}
	OK(c, http.StatusOK, Page[dto.PendingApproval]{Data: out, NextCursor: next})
}

// approve advances the chain, or completes it when this was the last step.
func (h approvalHandler) approve(c *gin.Context) {
	h.decide(c, service.DecisionApprove)
}

// returnForRevision sends the quotation back to the rep. The deal stays
// alive; the terms need work. This is a distinct outcome from a rejection,
// and the audit trail keeps both.
func (h approvalHandler) returnForRevision(c *gin.Context) {
	h.decide(c, service.DecisionReturn)
}

// reject closes the deal.
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

	// An empty body is fine for an approval, where a note is optional.
	var req dto.DecisionRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			Fail(c, bindError(err))
			return
		}
	}

	quote, err := h.svc.Decide(c.Request.Context(), actor, service.DecideInput{
		ApprovalID: id, Decision: decision, Reason: req.Reason,
	})
	if err != nil {
		Fail(c, err)
		return
	}

	approvals, err := h.svc.Approvals(c.Request.Context(), quote.Header.ID)
	if err != nil {
		Fail(c, err)
		return
	}
	audit, err := h.svc.AuditTrail(c.Request.Context(), quote.Header.ID, auditPageSize)
	if err != nil {
		Fail(c, err)
		return
	}

	body := quotationDTO(quote)
	body.Approvals = approvalsDTO(approvals)
	body.Audit = auditDTO(audit)
	OK(c, http.StatusOK, body)
}
