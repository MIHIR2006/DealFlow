package dto

// ConfirmOrderRequest is the optional body of a quotation-to-order confirm.
type ConfirmOrderRequest struct {
	PromisedDate string `json:"promised_date"`
}

// SalesOrder is a sales order with its current fulfilment and any open
// backorders.
type SalesOrder struct {
	ID                 int64  `json:"id"`
	Reference          string `json:"reference"`
	QuotationID        int64  `json:"quotation_id"`
	QuotationReference string `json:"quotation_reference"`
	CustomerID         int64  `json:"customer_id"`
	CustomerName       string `json:"customer_name"`
	Status             string `json:"status"`
	PromisedDate       string `json:"promised_date,omitempty"`
	CreatedAt          string `json:"created_at"`

	Fulfillment *Fulfillment `json:"fulfillment,omitempty"`
	Backorders  []Backorder  `json:"backorders"`
}

// Fulfillment is the persisted split decision for an order.
type Fulfillment struct {
	ID            int64             `json:"id"`
	Strategy      string            `json:"strategy"`
	ShipmentCount int32             `json:"shipment_count"`
	EstimatedCost string            `json:"estimated_cost"`
	Lines         []FulfillmentLine `json:"lines"`
}

// FulfillmentLine is one warehouse's contribution to a shipment.
type FulfillmentLine struct {
	WarehouseID   int64  `json:"warehouse_id"`
	WarehouseName string `json:"warehouse_name"`
	ProductID     int64  `json:"product_id"`
	ProductName   string `json:"product_name"`
	Qty           int64  `json:"qty"`
	ShipmentGroup int32  `json:"shipment_group"`
}

// Backorder is demand no warehouse could currently satisfy.
type Backorder struct {
	ID          int64  `json:"id"`
	ProductID   int64  `json:"product_id"`
	ProductName string `json:"product_name"`
	Qty         int64  `json:"qty"`
	Status      string `json:"status"`
}

// FulfillmentPlan is a preview of how an order would be split, shown before
// it is accepted.
type FulfillmentPlan struct {
	Strategy       string            `json:"strategy"`
	ShipmentCount  int               `json:"shipment_count"`
	EstimatedCost  string            `json:"estimated_cost"`
	Allocations    []FulfillmentLine `json:"allocations"`
	Backorders     []Backorder       `json:"backorders"`
	FullyFulfilled bool              `json:"fully_fulfilled"`
}
