package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
)

type portalHandler struct {
	svc *service.PortalService
	ttl time.Duration
}

// send generates a portal link for an approved quotation. Staff-side.
func (h portalHandler) send(c *gin.Context) {
	actor, quotationID, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	token, err := h.svc.Send(c.Request.Context(), actor, quotationID, h.ttl)
	if err != nil {
		Fail(c, err)
		return
	}

	OK(c, http.StatusCreated, dto.SendQuotationResponse{
		Token:     token,
		PortalURL: "/api/v1/portal/q/" + token,
		ExpiresAt: iso(time.Now().Add(h.ttl)),
	})
}

// The handlers below are customer-facing. None of them takes a quotation id:
// the middleware has already resolved exactly one quotation from the token,
// so there is nothing for a customer to point somewhere else.

func (h portalHandler) show(c *gin.Context) {
	row, ok := middleware.PortalQuotationOf(c)
	if !ok {
		Fail(c, apierr.NotFound("this link is invalid or has expired"))
		return
	}

	view, err := h.svc.View(c.Request.Context(), row)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, portalDTO(view))
}

func (h portalHandler) postMessage(c *gin.Context) {
	row, ok := middleware.PortalQuotationOf(c)
	if !ok {
		Fail(c, apierr.NotFound("this link is invalid or has expired"))
		return
	}

	var req dto.PortalMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	view, err := h.svc.PostMessage(c.Request.Context(), row, req.LineID, req.Body)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, portalDTO(view))
}

// counterOffer applies the customer's proposal and lets governance decide.
//
// Beyond policy, the quotation re-enters the approval chain here and now,
// with no rep involvement. That is the behaviour the product exists for.
func (h portalHandler) counterOffer(c *gin.Context) {
	row, ok := middleware.PortalQuotationOf(c)
	if !ok {
		Fail(c, apierr.NotFound("this link is invalid or has expired"))
		return
	}

	var req dto.PortalCounterOfferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}
	pct, err := parseDecimal(req.ProposedDiscountPct, "proposed_discount_pct")
	if err != nil {
		Fail(c, err)
		return
	}

	result, err := h.svc.CounterOffer(c.Request.Context(), row, service.CounterOfferInput{
		LineID:              req.LineID,
		ProposedDiscountPct: pct,
		Note:                req.Note,
	})
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, portalDTO(result.View))
}

func (h portalHandler) confirm(c *gin.Context) {
	row, ok := middleware.PortalQuotationOf(c)
	if !ok {
		Fail(c, apierr.NotFound("this link is invalid or has expired"))
		return
	}

	view, err := h.svc.Confirm(c.Request.Context(), row)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, portalDTO(view))
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

// portalDTO builds the customer-facing document.
//
// It reads only from fields a customer may see. Cost, margin, risk score,
// ceilings, overages, the rep and the approval chain are all available on the
// service result and are all deliberately left behind here.
func portalDTO(v service.View) dto.PortalQuotation {
	q := v.Quotation
	h := q.Header

	out := dto.PortalQuotation{
		Reference:        h.Reference,
		Status:           h.Status,
		CustomerName:     h.CustomerName,
		CustomerEmail:    v.CustomerEmail,
		ExpiresAt:        iso(v.ExpiresAt),
		OrderDiscountPct: h.OrderDiscountPct.String(),
		AwaitingReview:   h.Status == "PENDING_APPROVAL",
		CanConfirm:       service.CanConfirm(h.Status),
		Lines:            make([]dto.PortalLine, 0, len(q.Lines)),
		Messages:         make([]dto.PortalMessage, 0, len(v.Messages)),
		CounterOffers:    make([]dto.PortalCounterOffer, 0, len(v.Offers)),
		Totals: dto.PortalTotals{
			ListSubtotal:   q.Totals.ListSubtotal.String(),
			DiscountTotal:  q.Totals.DiscountTotal.String(),
			NetSubtotal:    q.Totals.NetSubtotal.String(),
			TaxTotal:       q.Totals.TaxTotal.String(),
			GrandTotal:     q.Totals.GrandTotal.String(),
			OneTimeTotal:   q.Totals.OneTimeTotal.String(),
			RecurringTotal: q.Totals.RecurringTotal.String(),
		},
	}

	computed := make(map[int64]int, len(q.Totals.Lines))
	for i, l := range q.Totals.Lines {
		computed[l.LineID] = i
	}

	for _, l := range q.Lines {
		line := dto.PortalLine{
			ID: l.ID, Position: l.Position,
			ProductName: l.ProductName,
			Qty:         l.Qty.String(),
			UnitPrice:   l.UnitPrice.String(),
			LineType:    l.LineType,
			PlanName:    l.PlanName,
			PlanPeriod:  l.PlanPeriod,
		}
		if i, ok := computed[l.ID]; ok {
			cl := q.Totals.Lines[i]
			line.DiscountPct = cl.EffectiveDiscountPct.String()
			line.ListValue = cl.ListValue.String()
			line.DiscountAmount = cl.DiscountAmount.String()
			line.NetAmount = cl.NetAmount.String()
			line.TaxAmount = cl.TaxAmount.String()
		}
		out.Lines = append(out.Lines, line)
	}

	for _, m := range v.Messages {
		out.Messages = append(out.Messages, dto.PortalMessage{
			ID: m.ID, LineID: m.QuotationLineID,
			AuthorType: m.AuthorType, AuthorLabel: m.AuthorLabel,
			Body: m.Body, CreatedAt: iso(m.CreatedAt),
		})
	}

	for _, o := range v.Offers {
		out.CounterOffers = append(out.CounterOffers, dto.PortalCounterOffer{
			ID: o.ID, LineID: o.QuotationLineID,
			PreviousDiscountPct: o.PreviousDiscountPct.String(),
			ProposedDiscountPct: o.ProposedDiscountPct.String(),
			Outcome:             o.Outcome,
			Note:                o.Note,
			CreatedAt:           iso(o.CreatedAt),
		})
	}

	return out
}

// ---------------------------------------------------------------------------
// The staff side of the negotiation
// ---------------------------------------------------------------------------

// thread returns the negotiation for a quotation: what the customer said, what
// they proposed, and how each proposal was answered.
func (h portalHandler) thread(c *gin.Context) {
	actor, quotationID, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	t, err := h.svc.Thread(c.Request.Context(), actor, quotationID)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, threadDTO(t))
}

// reply posts a staff message into the negotiation thread, which the customer
// sees on their own side of the portal conversation.
func (h portalHandler) reply(c *gin.Context) {
	actor, quotationID, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.StaffMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	t, err := h.svc.ReplyToCustomer(c.Request.Context(), actor, quotationID, req.LineID, req.Body)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, threadDTO(t))
}

func threadDTO(t service.Thread) dto.NegotiationThread {
	out := dto.NegotiationThread{
		QuotationID:   t.QuotationID,
		Reference:     t.Reference,
		Status:        t.Status,
		Negotiable:    t.Negotiable,
		Messages:      make([]dto.ThreadMessage, 0, len(t.Messages)),
		CounterOffers: make([]dto.PortalCounterOffer, 0, len(t.Offers)),
	}

	for _, m := range t.Messages {
		out.Messages = append(out.Messages, dto.ThreadMessage{
			ID: m.ID, LineID: m.QuotationLineID,
			ProductName: m.ProductName,
			AuthorType:  m.AuthorType, AuthorLabel: m.AuthorLabel,
			Body: m.Body, CreatedAt: iso(m.CreatedAt),
		})
	}

	for _, o := range t.Offers {
		out.CounterOffers = append(out.CounterOffers, dto.PortalCounterOffer{
			ID: o.ID, LineID: o.QuotationLineID,
			PreviousDiscountPct: o.PreviousDiscountPct.String(),
			ProposedDiscountPct: o.ProposedDiscountPct.String(),
			Outcome:             o.Outcome,
			Note:                o.Note,
			CreatedAt:           iso(o.CreatedAt),
		})
	}

	return out
}
