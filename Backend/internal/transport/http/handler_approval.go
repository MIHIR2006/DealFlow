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

	rows, err := h.svc.Inbox(c.Request.Context(), actor, service.InboxFilter{Cursor: cursor, Limit: limit + 1})
	if err != nil {
		Fail(c, err)
		return
	}

	var next string
	if len(rows) > int(limit) {
		rows = rows[:limit]
		next = strconv.FormatInt(rows[len(rows)-1].ID, 10)
	}

	out := make([]dto.ApprovalInboxRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.ApprovalInboxRow{
			ID: r.ID, QuotationID: r.QuotationID, Round: r.Round, Step: r.Step,
			RequiredRole: r.RequiredRole, Status: r.Status, CreatedAt: iso(r.CreatedAt),
			Reference: r.Reference, CustomerName: r.CustomerName, CustomerTier: r.CustomerTier,
			RepName:          r.RepName,
			GrandTotal:       r.GrandTotal.String(),
			BlendedRiskScore: r.BlendedRiskScore.String(),
			MaxLineOverage:   r.MaxLineOverage.String(),
			RequiredLevel:    levelString(r.RequiredLevel),
		})
	}
	OK(c, http.StatusOK, Page[dto.ApprovalInboxRow]{Data: out, NextCursor: next})
}

func (h approvalHandler) approve(c *gin.Context) {
	h.decide(c, service.DecisionApprove)
}

func (h approvalHandler) returnForRevision(c *gin.Context) {
	h.decide(c, service.DecisionReturn)
}

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

	var req dto.ApprovalActionRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			Fail(c, bindError(err))
			return
		}
	}

	quote, err := h.svc.Decide(c.Request.Context(), actor, id, decision, req.Reason)
	if err != nil {
		Fail(c, err)
		return
	}

	approvals, err := h.svc.Approvals(c.Request.Context(), quote.Header.ID)
	if err != nil {
		Fail(c, err)
		return
	}

	body := quotationDTO(quote)
	body.Approvals = approvalsDTO(approvals)
	OK(c, http.StatusOK, body)
}
