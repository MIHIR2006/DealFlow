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

	// Destination is the delivery end of every shipment on this order.
	Destination Destination `json:"destination"`
}

// OrderSummary is a lightweight sales order view for order ledgers.
type OrderSummary struct {
	ID                 int64   `json:"id"`
	Reference          string  `json:"reference"`
	QuotationID        int64   `json:"quotation_id"`
	QuotationReference string  `json:"quotation_reference"`
	CustomerID         int64   `json:"customer_id"`
	CustomerName       string  `json:"customer_name"`
	Status             string  `json:"status"`
	PromisedDate       *string `json:"promised_date,omitempty"`
	ConfirmedAt        *string `json:"confirmed_at,omitempty"`
	CreatedAt          string  `json:"created_at"`
	ShipmentCount      int64   `json:"shipment_count"`
	BackorderCount     int64   `json:"backorder_count"`
}

// Fulfillment is the persisted split decision for an order.
type Fulfillment struct {
	ID               int64             `json:"id"`
	Strategy         string            `json:"strategy"`
	ShipmentCount    int32             `json:"shipment_count"`
	EstimatedCost    string            `json:"estimated_cost"`
	IsManualOverride bool              `json:"is_manual_override"`
	Lines            []FulfillmentLine `json:"lines"`
}

// AcceptFulfillmentRequest is the optional body of a fulfillment accept.
// Omitting it (or sending an empty body) accepts the engine's own suggested
// split; supplying overrides replaces the engine's choice of warehouse with
// the caller's own, still validated against real demand and real stock.
type AcceptFulfillmentRequest struct {
	Overrides []FulfillmentOverride `json:"overrides"`
}

// FulfillmentOverride is one caller-specified allocation.
type FulfillmentOverride struct {
	WarehouseID int64 `json:"warehouse_id" binding:"required,gt=0"`
	ProductID   int64 `json:"product_id"   binding:"required,gt=0"`
	Qty         int64 `json:"qty"          binding:"required,gt=0"`
}

// FulfillmentLine is one warehouse's contribution to a shipment.
type FulfillmentLine struct {
	WarehouseID   int64  `json:"warehouse_id"`
	WarehouseName string `json:"warehouse_name"`
	ProductID     int64  `json:"product_id"`
	ProductName   string `json:"product_name"`
	Qty           int64  `json:"qty"`
	ShipmentGroup int32  `json:"shipment_group"`

	// Where this leg starts. Absent when the warehouse has no location on
	// file, in which case the shipment is listed but not plotted.
	WarehouseCity      *string `json:"warehouse_city,omitempty"`
	WarehouseLatitude  *string `json:"warehouse_latitude,omitempty"`
	WarehouseLongitude *string `json:"warehouse_longitude,omitempty"`
}

// Destination is where every shipment on an order is going: the customer.
type Destination struct {
	CustomerName string  `json:"customer_name"`
	City         *string `json:"city,omitempty"`
	Latitude     *string `json:"latitude,omitempty"`
	Longitude    *string `json:"longitude,omitempty"`
}

// Backorder is demand no warehouse could currently satisfy.
type Backorder struct {
	ID          int64  `json:"id"`
	ProductID   int64  `json:"product_id"`
	ProductName string `json:"product_name"`
	Qty         int64  `json:"qty"`
	Status      string `json:"status"`
}

// ProductDemand is one product this order needs, and how much of it.
type ProductDemand struct {
	ProductID   int64  `json:"product_id"`
	ProductName string `json:"product_name"`
	Qty         int64  `json:"qty"`
}

// StockAvailability is what one warehouse can contribute towards one product,
// already net of other orders' reservations.
type StockAvailability struct {
	WarehouseID   int64  `json:"warehouse_id"`
	WarehouseName string `json:"warehouse_name"`
	ProductID     int64  `json:"product_id"`
	Available     int64  `json:"available"`

	City      *string `json:"city,omitempty"`
	Latitude  *string `json:"latitude,omitempty"`
	Longitude *string `json:"longitude,omitempty"`
}

// FulfillmentPlan is a preview of how an order would be split, shown before
// it is accepted.
//
// Demands and Availability are what make the Manual Override control usable:
// choosing a different warehouse means seeing what the order needs and what
// each warehouse holds. They are a snapshot, not a reservation -- the accept
// path re-reads under lock and refuses anything stock no longer supports.
type FulfillmentPlan struct {
	Strategy       string            `json:"strategy"`
	ShipmentCount  int               `json:"shipment_count"`
	EstimatedCost  string            `json:"estimated_cost"`
	Allocations    []FulfillmentLine `json:"allocations"`
	Backorders     []Backorder       `json:"backorders"`
	FullyFulfilled bool              `json:"fully_fulfilled"`

	Demands      []ProductDemand     `json:"demands"`
	Availability []StockAvailability `json:"availability"`

	// Destination lets a preview be plotted before it is accepted.
	Destination Destination `json:"destination"`
}
