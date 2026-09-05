package http

import (
	"net/http"
	"time"

<<<<<<< HEAD
=======
	"github.com/gin-gonic/gin"

>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	"dealflow360/backend/internal/domain/fulfillment"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
<<<<<<< HEAD
	"github.com/gin-gonic/gin"
=======
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
)

type fulfillmentHandler struct {
	svc *service.FulfillmentService
}

<<<<<<< HEAD
// confirm turns an approved quotation into a sales order.
func (h fulfillmentHandler) confirm(c *gin.Context) {
	actor, quotationID, err := actorAndID(c)
=======
// confirm turns a confirmed quotation into a sales order. It hangs off the
// quotations tree (POST /quotations/:id/confirm) because its input is a
// quotation id; everything after this point is addressed by order id.
func (h fulfillmentHandler) confirm(c *gin.Context) {
	actor, id, err := actorAndID(c)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}

<<<<<<< HEAD
	var req dto.ConfirmQuotationRequest
	if c.Request.ContentLength > 0 {
=======
	var promised *time.Time
	if c.Request.ContentLength > 0 {
		var req dto.ConfirmOrderRequest
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
		if err := c.ShouldBindJSON(&req); err != nil {
			Fail(c, bindError(err))
			return
		}
<<<<<<< HEAD
	}

	var promised *time.Time
	if req.PromisedDate != "" {
		at, err := time.Parse("2006-01-02", req.PromisedDate)
		if err != nil {
			Fail(c, apierr.Validation("promised_date must be a date in YYYY-MM-DD form"))
			return
		}
		promised = &at
	}

	order, err := h.svc.Confirm(c.Request.Context(), actor, quotationID, promised)
=======
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
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD
	OK(c, http.StatusCreated, orderDTO(order, false))
=======
	OK(c, http.StatusCreated, orderDTO(order))
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
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
<<<<<<< HEAD
	OK(c, http.StatusOK, orderDTO(order, false))
}

// suggest runs the engine without persisting anything, so the rep can see
// where the order would ship from before committing.
=======
	OK(c, http.StatusOK, orderDTO(order))
}

>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
func (h fulfillmentHandler) suggest(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

<<<<<<< HEAD
	order, err := h.svc.Suggest(c.Request.Context(), actor, id)
=======
	plan, err := h.svc.Suggest(c.Request.Context(), actor, id)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD
	OK(c, http.StatusOK, orderDTO(order, true))
=======
	OK(c, http.StatusOK, planDTO(plan))
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
}

func (h fulfillmentHandler) accept(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

<<<<<<< HEAD
	var req dto.AcceptFulfillmentRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			Fail(c, bindError(err))
			return
		}
	}

	overrides := make([]service.Override, 0, len(req.Overrides))
	for _, o := range req.Overrides {
		overrides = append(overrides, service.Override{
			WarehouseID: o.WarehouseID, ProductID: o.ProductID, Qty: o.Qty,
		})
	}

	order, err := h.svc.Accept(c.Request.Context(), actor, service.AcceptInput{
		OrderID: id, Overrides: overrides,
	})
=======
	order, err := h.svc.Accept(c.Request.Context(), actor, id)
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	if err != nil {
		Fail(c, err)
		return
	}
<<<<<<< HEAD
	OK(c, http.StatusOK, orderDTO(order, false))
}

// consolidate ships backordered lines whose stock has since arrived.
=======
	OK(c, http.StatusOK, orderDTO(order))
}

>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
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
<<<<<<< HEAD
	OK(c, http.StatusOK, orderDTO(order, false))
=======
	OK(c, http.StatusOK, orderDTO(order))
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

<<<<<<< HEAD
func orderDTO(o service.Order, suggested bool) dto.SalesOrder {
	h := o.Header

	out := dto.SalesOrder{
		ID: h.ID, Reference: h.Reference, Status: h.Status,
		QuotationID: h.QuotationID, QuotationReference: h.QuotationReference,
		CustomerName: h.CustomerName,
		ConfirmedAt:  iso(h.ConfirmedAt),
		Suggested:    suggested,
=======
func orderDTO(o service.Order) dto.SalesOrder {
	h := o.Header

	out := dto.SalesOrder{
		ID: h.ID, Reference: h.Reference, QuotationID: h.QuotationID,
		QuotationReference: h.QuotationReference,
		CustomerID:         h.CustomerID, CustomerName: h.CustomerName,
		Status: h.Status, CreatedAt: iso(h.CreatedAt),
		Backorders: make([]dto.Backorder, 0, len(o.Backorders)),
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	}
	if h.PromisedDate != nil {
		out.PromisedDate = iso(*h.PromisedDate)
	}

<<<<<<< HEAD
	// A suggestion carries the engine's proposal; anything else carries what
	// was actually reserved.
	if suggested && o.Plan != nil {
		out.Plan = planDTO(*o.Plan, false)
		return out
	}

	if o.Fulfillment != nil {
		plan := dto.FulfillmentPlan{
			Strategy:         o.Fulfillment.Strategy,
			ShipmentCount:    int(o.Fulfillment.ShipmentCount),
			EstimatedCost:    o.Fulfillment.EstimatedCost.String(),
			IsManualOverride: o.Fulfillment.IsManualOverride,
			Allocations:      make([]dto.Allocation, 0, len(o.Lines)),
			Backorders:       make([]dto.Backorder, 0, len(o.Backorders)),
		}
		for _, l := range o.Lines {
			plan.Allocations = append(plan.Allocations, dto.Allocation{
				WarehouseID: l.WarehouseID, WarehouseName: l.WarehouseName,
				ProductID: l.ProductID, ProductName: l.ProductName,
				Qty: l.Qty, ShipmentGroup: int(l.ShipmentGroup),
			})
		}
		for _, b := range o.Backorders {
			plan.Backorders = append(plan.Backorders, dto.Backorder{
				ID: b.ID, ProductID: b.ProductID, ProductName: b.ProductName, Qty: b.Qty,
			})
		}
		out.Plan = &plan
=======
	if o.Fulfillment != nil {
		f := &dto.Fulfillment{
			ID: o.Fulfillment.ID, Strategy: o.Fulfillment.Strategy,
			ShipmentCount: o.Fulfillment.ShipmentCount,
			EstimatedCost: o.Fulfillment.EstimatedCost.String(),
			Lines:         make([]dto.FulfillmentLine, 0, len(o.Lines)),
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
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
	}

	return out
}

<<<<<<< HEAD
func planDTO(p fulfillment.Plan, manual bool) *dto.FulfillmentPlan {
	out := &dto.FulfillmentPlan{
		Strategy:         string(p.Strategy),
		ShipmentCount:    p.ShipmentCount,
		EstimatedCost:    p.EstimatedCost.String(),
		IsManualOverride: manual,
		Allocations:      make([]dto.Allocation, 0, len(p.Allocations)),
		Backorders:       make([]dto.Backorder, 0, len(p.Backorders)),
	}
	for _, a := range p.Allocations {
		out.Allocations = append(out.Allocations, dto.Allocation{
			WarehouseID: a.WarehouseID, WarehouseName: a.WarehouseName,
			ProductID: a.ProductID, ProductName: a.ProductName,
			Qty: a.Qty, ShipmentGroup: a.ShipmentGroup,
=======
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
			Qty: a.Qty, ShipmentGroup: int32(a.ShipmentGroup),
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
		})
	}
	for _, b := range p.Backorders {
		out.Backorders = append(out.Backorders, dto.Backorder{
<<<<<<< HEAD
			ProductID: b.ProductID, ProductName: b.ProductName, Qty: b.Qty,
=======
			ProductID: b.ProductID, ProductName: b.ProductName, Qty: b.Qty, Status: "OPEN",
>>>>>>> 1fbf643eb06c8836adcea4f3d54d1c5ee8c8b248
		})
	}
	return out
}
