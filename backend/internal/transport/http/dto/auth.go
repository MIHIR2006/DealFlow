// Package dto holds the request and response shapes that make up the API
// contract with the frontend.
//
// These types are the seam between two languages, so they are kept explicit:
// no database rows are serialised directly, and nothing here exposes a field
// the caller has no business seeing.
package dto

// SignupRequest creates a staff account.
type SignupRequest struct {
	Email     string `json:"email"     binding:"required,email"`
	Password  string `json:"password"  binding:"required,min=8"`
	FullName  string `json:"full_name" binding:"required"`
	Role      string `json:"role"      binding:"required,oneof=ADMIN MANAGER FINANCE REP"`
	SalesTeam string `json:"sales_team"`
}

// LoginRequest authenticates a staff member.
type LoginRequest struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// User is a staff member as the API exposes them.
//
// The password hash is absent by construction rather than by remembering to
// strip it, which is why this type exists instead of returning the row.
type User struct {
	ID        int64  `json:"id"`
	Email     string `json:"email"`
	FullName  string `json:"full_name"`
	Role      string `json:"role"`
	SalesTeam string `json:"sales_team"`
	IsActive  bool   `json:"is_active"`
}

// SessionResponse is returned by signup and login.
type SessionResponse struct {
	Token     string `json:"token"`
	ExpiresAt int64  `json:"expires_at"`
	User      User   `json:"user"`
}

// PortalQuotation is what a customer sees.
//
// Note what is absent: unit cost, margin, blended risk score, ceilings,
// overages, the rep's identity, and the approval chain. Those are internal
// facts. The omission is enforced by this type rather than by a filter
// someone could forget to apply.
type PortalQuotation struct {
	Reference     string `json:"reference"`
	Status        string `json:"status"`
	CustomerName  string `json:"customer_name"`
	ListSubtotal  string `json:"list_subtotal"`
	DiscountTotal string `json:"discount_total"`
	NetSubtotal   string `json:"net_subtotal"`
	TaxTotal      string `json:"tax_total"`
	GrandTotal    string `json:"grand_total"`
	ExpiresAt     any    `json:"expires_at"`
}
