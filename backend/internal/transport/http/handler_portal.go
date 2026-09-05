package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
)

type portalHandler struct{}

// show returns the quotation the token names.
//
// The response is built from a portal-specific DTO that has no cost, margin,
// or risk fields at all. A customer must never see what the deal costs us or
// how close the discount is to an internal ceiling, and leaving those fields
// off the type is a stronger guarantee than remembering to omit them.
func (portalHandler) show(c *gin.Context) {
	row, ok := middleware.PortalQuotationOf(c)
	if !ok {
		Fail(c, apierr.NotFound("this link is invalid or has expired"))
		return
	}

	OK(c, http.StatusOK, dto.PortalQuotation{
		Reference:     row.Reference,
		Status:        row.Status,
		CustomerName:  row.CustomerName,
		ListSubtotal:  row.ListSubtotal.String(),
		DiscountTotal: row.DiscountTotal.String(),
		NetSubtotal:   row.NetSubtotal.String(),
		TaxTotal:      row.TaxTotal.String(),
		GrandTotal:    row.GrandTotal.String(),
		ExpiresAt:     row.ExpiresAt,
	})
}
