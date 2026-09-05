package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/domain/fulfillment"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
)

type fulfillmentHandler struct {
	svc *service.FulfillmentService
}

// confirm turns a confirmed quotation into a sales order. It hangs off the
// quotations tree (POST /quotations/:id/confirm) because its input is a
// quotation id; everything after this point is addressed by order id.
func (h fulfillmentHandler) confirm(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	var promised *time.Time
	if c.Request.ContentLength > 0 {
		var req dto.ConfirmOrderRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			Fail(c, bindError(err))
			return
		}
		if req.PromisedDate != "" {
			t, err := time.Parse("2006-01-02", req.PromisedDate)
			if err != nil {
				Fail(c, apierr.Validation("promised_date must be YYYY-MM-DD"))
				return
			}
			promised = &t
		}
	}

	order, err := h.svc.Confirm(c.Request.Context(), actor, id, promised)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusCreated, orderDTO(order))
}

func (h fulfillmentHandler) list(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}
	limit := pageLimit(c)
	orders, err := h.svc.List(c.Request.Context(), actor, limit)
	if err != nil {
		Fail(c, err)
		return
	}

	out := make([]dto.OrderSummary, 0, len(orders))
	for _, o := range orders {
		row := dto.OrderSummary{
			ID: o.ID, Reference: o.Reference, QuotationID: o.QuotationID,
			QuotationReference: o.QuotationReference,
			CustomerID:         o.CustomerID, CustomerName: o.CustomerName,
			Status: o.Status, CreatedAt: iso(o.CreatedAt),
			ShipmentCount: o.ShipmentCount, BackorderCount: o.BackorderCount,
		}
		if o.PromisedDate != nil {
			d := iso(*o.PromisedDate)
			row.PromisedDate = &d
		}
		if o.ConfirmedAt != nil {
			d := iso(*o.ConfirmedAt)
			row.ConfirmedAt = &d
		}
		out = append(out, row)
	}

	OK(c, http.StatusOK, Page[dto.OrderSummary]{Data: out})
}

func (h fulfillmentHandler) get(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	order, err := h.svc.Get(c.Request.Context(), actor, id)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, orderDTO(order))
}

func (h fulfillmentHandler) suggest(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	plan, err := h.svc.Suggest(c.Request.Context(), actor, id)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, planDTO(plan))
}

func (h fulfillmentHandler) accept(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	var overrides []fulfillment.OverrideLine
	if c.Request.ContentLength > 0 {
		var req dto.AcceptFulfillmentRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			Fail(c, bindError(err))
			return
		}
		for _, o := range req.Overrides {
			overrides = append(overrides, fulfillment.OverrideLine{
				WarehouseID: o.WarehouseID, ProductID: o.ProductID, Qty: o.Qty,
			})
		}
	}

	order, err := h.svc.Accept(c.Request.Context(), actor, id, overrides)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, orderDTO(order))
}

func (h fulfillmentHandler) consolidate(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	order, err := h.svc.Consolidate(c.Request.Context(), actor, id)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, orderDTO(order))
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

func orderDTO(o service.Order) dto.SalesOrder {
	h := o.Header

	out := dto.SalesOrder{
		ID: h.ID, Reference: h.Reference, QuotationID: h.QuotationID,
		QuotationReference: h.QuotationReference,
		CustomerID:         h.CustomerID, CustomerName: h.CustomerName,
		Status: h.Status, CreatedAt: iso(h.CreatedAt),
		Backorders: make([]dto.Backorder, 0, len(o.Backorders)),
	}
	if h.PromisedDate != nil {
		out.PromisedDate = iso(*h.PromisedDate)
	}

	if o.Fulfillment != nil {
		f := &dto.Fulfillment{
			ID: o.Fulfillment.ID, Strategy: o.Fulfillment.Strategy,
			ShipmentCount:    o.Fulfillment.ShipmentCount,
			EstimatedCost:    o.Fulfillment.EstimatedCost.String(),
			IsManualOverride: o.Fulfillment.IsManualOverride,
			Lines:            make([]dto.FulfillmentLine, 0, len(o.Lines)),
		}
		for _, l := range o.Lines {
			f.Lines = append(f.Lines, dto.FulfillmentLine{
				WarehouseID: l.WarehouseID, WarehouseName: l.WarehouseName,
				ProductID: l.ProductID, ProductName: l.ProductName,
				Qty: l.Qty, ShipmentGroup: l.ShipmentGroup,
			})
		}
		out.Fulfillment = f
	}

	for _, b := range o.Backorders {
		out.Backorders = append(out.Backorders, dto.Backorder{
			ID: b.ID, ProductID: b.ProductID, ProductName: b.ProductName,
			Qty: b.Qty, Status: b.Status,
		})
	}

	return out
}

func planDTO(p fulfillment.Plan) dto.FulfillmentPlan {
	out := dto.FulfillmentPlan{
		Strategy: string(p.Strategy), ShipmentCount: p.ShipmentCount,
		EstimatedCost:  p.EstimatedCost.String(),
		Allocations:    make([]dto.FulfillmentLine, 0, len(p.Allocations)),
		Backorders:     make([]dto.Backorder, 0, len(p.Backorders)),
		FullyFulfilled: p.FullyFulfilled(),
	}
	for _, a := range p.Allocations {
		out.Allocations = append(out.Allocations, dto.FulfillmentLine{
			WarehouseID: a.WarehouseID, WarehouseName: a.WarehouseName,
			ProductID: a.ProductID, ProductName: a.ProductName,
			Qty: a.Qty, ShipmentGroup: int32(a.ShipmentGroup), //nolint:gosec // a shipment group index never approaches int32 range
		})
	}
	for _, b := range p.Backorders {
		out.Backorders = append(out.Backorders, dto.Backorder{
			ProductID: b.ProductID, ProductName: b.ProductName, Qty: b.Qty, Status: "OPEN",
		})
	}
	return out
}
