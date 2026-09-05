package dto

// Allocation is a decision to ship some quantity from a warehouse.
type Allocation struct {
	WarehouseID   int64  `json:"warehouse_id"`
	WarehouseName string `json:"warehouse_name"`
	ProductID     int64  `json:"product_id"`
	ProductName   string `json:"product_name"`
	Qty           int64  `json:"qty"`
	ShipmentGroup int    `json:"shipment_group"`
}

// Backorder is demand no warehouse could satisfy. It is a normal outcome:
// the order still stands and the shortfall is consolidated when stock
// arrives.
type Backorder struct {
	ID          int64  `json:"id,omitempty"`
	ProductID   int64  `json:"product_id"`
	ProductName string `json:"product_name"`
	Qty         int64  `json:"qty"`
}

// FulfillmentPlan is where an order ships from.
type FulfillmentPlan struct {
	// Strategy says how the plan was reached: one warehouse covered
	// everything, or the order was spread across several.
	Strategy      string `json:"strategy"`
	ShipmentCount int    `json:"shipment_count"`
	EstimatedCost string `json:"estimated_cost"`

	// IsManualOverride records that a human overruled the engine.
	IsManualOverride bool `json:"is_manual_override"`

	Allocations []Allocation `json:"allocations"`
	Backorders  []Backorder  `json:"backorders"`
}

// SalesOrder is a confirmed order and its fulfilment.
type SalesOrder struct {
	ID                 int64  `json:"id"`
	Reference          string `json:"reference"`
	Status             string `json:"status"`
	QuotationID        int64  `json:"quotation_id"`
	QuotationReference string `json:"quotation_reference"`
	CustomerName       string `json:"customer_name"`
	PromisedDate       string `json:"promised_date,omitempty"`
	ConfirmedAt        string `json:"confirmed_at"`

	// Plan is the recorded fulfilment, or the engine's suggestion when
	// nothing has been committed yet.
	Plan *FulfillmentPlan `json:"plan,omitempty"`

	// Suggested distinguishes a proposal from what was actually reserved.
	Suggested bool `json:"suggested"`
}

// ConfirmQuotationRequest turns an approved quotation into an order.
type ConfirmQuotationRequest struct {
	// PromisedDate is optional; a default window applies when it is absent.
	// It drives the delivery-slippage alert on the dashboard.
	PromisedDate string `json:"promised_date"`
}

// OverrideAllocation is one line of a manual fulfilment override.
type OverrideAllocation struct {
	WarehouseID int64 `json:"warehouse_id" binding:"required,gt=0"`
	ProductID   int64 `json:"product_id"   binding:"required,gt=0"`
	Qty         int64 `json:"qty"          binding:"required,gt=0"`
}

// AcceptFulfillmentRequest records a plan.
//
// With no overrides the engine's suggestion is used. With overrides the
// caller's allocation is used instead, still checked against real stock:
// overruling the engine is not a licence to promise units that are not there.
type AcceptFulfillmentRequest struct {
	Overrides []OverrideAllocation `json:"overrides"`
}
