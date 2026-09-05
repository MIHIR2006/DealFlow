// Types mirror `Backend/internal/transport/http/dto/*.go` field-for-field
// (snake_case JSON tags preserved). Money and percentages are decimal
// strings on the wire — never parse them into a JS number for anything
// that flows into a calculation; only for display formatting.

export type QuotationStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "SENT"
  | "UNDER_NEGOTIATION"
  | "CONFIRMED"
  | "REJECTED";

export type InvoiceStatus = "DRAFT" | "SENT" | "PARTIAL" | "PAID" | "OVERDUE" | string;

export type UserRole = "ADMIN" | "MANAGER" | "FINANCE" | "REP";

export type RequiredLevel = "NONE" | "MANAGER" | "FINANCE" | string;

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface Page<T> {
  data: T[];
  next_cursor?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  sales_team: string;
  is_active: boolean;
}

export interface SessionResponse {
  token: string;
  expires_at: number;
  user: User;
}

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------

export interface QuotationSummary {
  id: number;
  reference: string;
  status: QuotationStatus;
  customer_id: number;
  customer_name: string;
  customer_tier: "BRONZE" | "SILVER" | "GOLD" | string;
  rep_name: string;
  line_count: number;
  net_subtotal: string;
  grand_total: string;
  margin_pct: string;
  blended_risk_score: string;
  required_level: RequiredLevel;
  last_activity_at: string;
}

export interface QuotationLine {
  id: number;
  position: number;
  product_id: number;
  product_name: string;
  sku: string;
  category_id: number;
  category_name: string;
  qty: string;
  unit_price: string;
  line_discount_pct: string;
  tax_rate_pct: string;
  effective_discount_pct: string;
  list_value: string;
  discount_amount: string;
  net_amount: string;
  tax_amount: string;
  margin_amount: string;
  margin_pct: string;
  line_type: "ONETIME" | "RECURRING" | string;
  plan_id?: number | null;
  plan_name?: string | null;
  plan_period?: string | null;
}

export interface QuotationTotals {
  list_subtotal: string;
  discount_total: string;
  net_subtotal: string;
  tax_total: string;
  grand_total: string;
  margin_amount: string;
  margin_pct: string;
  one_time_total: string;
  recurring_total: string;
}

export interface RiskLine {
  line_id: number;
  product_name: string;
  category_name: string;
  given_pct: string;
  allowed_pct: string;
  overage_pts: string;
  list_value: string;
  is_over: boolean;
}

export interface RiskVerdict {
  blended_score: string;
  max_line_overage: string;
  required_level: RequiredLevel;
  rationale: string;
  breakdown: RiskLine[];
  config_version: number;
}

export interface ApprovalStep {
  id: number;
  round: number;
  step: number;
  required_role: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "RETURNED" | "SUPERSEDED";
  actor_name?: string | null;
  reason?: string;
  decided_at?: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  action: string;
  actor_label: string;
  note: string;
  created_at: string;
}

export interface ApprovalInboxRow {
  id: number;
  quotation_id: number;
  round: number;
  step: number;
  required_role: string;
  status: string;
  created_at: string;
  reference: string;
  customer_name: string;
  customer_tier: string;
  rep_name: string;
  grand_total: string;
  blended_risk_score: string;
  max_line_overage: string;
  required_level: RequiredLevel;
}

export interface Quotation {
  id: number;
  reference: string;
  status: QuotationStatus;
  version: number;
  customer_id: number;
  customer_name: string;
  customer_tier: "BRONZE" | "SILVER" | "GOLD" | string;
  rep_name: string;
  order_discount_pct: string;
  lines: QuotationLine[];
  totals: QuotationTotals;
  risk: RiskVerdict;
  approvals?: ApprovalStep[];
  audit?: AuditEntry[];
  last_activity_at: string;
}

export interface Upsell {
  product_id: number;
  name: string;
  sku: string;
  unit_price: string;
  is_promoted: boolean;
  score: string;
  margin_delta: string;
  margin_pct_delta: string;
}

// ---------------------------------------------------------------------------
// Portal
// ---------------------------------------------------------------------------

export interface PortalLine {
  id: number;
  position: number;
  product_name: string;
  description?: string;
  qty: string;
  unit_price: string;
  discount_pct: string;
  list_value: string;
  discount_amount: string;
  net_amount: string;
  tax_amount: string;
  line_type: string;
  plan_name?: string | null;
  plan_period?: string | null;
}

export interface PortalTotals {
  list_subtotal: string;
  discount_total: string;
  net_subtotal: string;
  tax_total: string;
  grand_total: string;
  one_time_total: string;
  recurring_total_per_period: string;
}

export interface PortalMessage {
  id: number;
  line_id?: number | null;
  author_type: "CUSTOMER" | "REP" | "SYSTEM";
  author_label: string;
  body: string;
  created_at: string;
}

export interface PortalCounterOffer {
  id: number;
  line_id?: number | null;
  previous_discount_pct: string;
  proposed_discount_pct: string;
  outcome: "AUTO_ACCEPTED" | "ROUTED_FOR_APPROVAL";
  note?: string;
  created_at: string;
}

export interface PortalQuotation {
  reference: string;
  status: QuotationStatus;
  customer_name: string;
  customer_email: string;
  expires_at: string;
  order_discount_pct: string;
  awaiting_review: boolean;
  can_confirm: boolean;
  lines: PortalLine[];
  totals: PortalTotals;
  messages: PortalMessage[];
  counter_offers: PortalCounterOffer[];
}

export interface SendQuotationResponse {
  token: string;
  portal_url: string;
  expires_at: string;
}

// --- Portal assistant ------------------------------------------------------

/** Whether the AI negotiation assistant is configured and reachable. */
export interface AssistantAvailability {
  available: boolean;
}

/** One turn from the assistant. It answers; it never returns quotation data. */
export interface AssistantReply {
  reply: string;
}

// ---------------------------------------------------------------------------
// Config / catalogue / governance
// ---------------------------------------------------------------------------

export interface Category {
  id: number;
  name: string;
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  tier: "BRONZE" | "SILVER" | "GOLD" | string;
  is_active: boolean;
}

export interface Product {
  id: number;
  category_id: number;
  category_name?: string;
  sku: string;
  name: string;
  description: string;
  unit: string;
  unit_price: string;
  unit_cost: string;
  tax_rate_pct: string;
  is_promoted: boolean;
  is_subscription: boolean;
  is_active: boolean;
}

export type ProductInput = Omit<Product, "id" | "category_name">;

export interface DiscountTier {
  tier: string;
  max_discount_pct: string;
}

export interface CategoryCeiling {
  category_id: number;
  category_name: string;
  max_discount_pct: string;
}

export interface ApprovalPolicy {
  id: number;
  name: string;
  min_blended: string;
  min_line_overage: string;
  requires_manager: boolean;
  requires_finance: boolean;
  is_active: boolean;
}

export type ApprovalPolicyInput = Omit<ApprovalPolicy, "id">;

export interface GovernanceSnapshot {
  version: number;
  loaded_at: string;
  tiers: DiscountTier[];
  category_ceilings: CategoryCeiling[];
  policies: ApprovalPolicy[];
}

export interface Warehouse {
  id: number;
  name: string;
  shipping_cost_weight: string;
  is_active: boolean;
}

export interface StockItem {
  warehouse_id: number;
  product_id: number;
  on_hand: number;
  reserved: number;
  available: number;
}

export interface SubscriptionPlan {
  id: number;
  name: string;
  period: "MONTHLY" | "QUARTERLY" | "YEARLY" | string;
  cycles: number;
  is_active: boolean;
}

export interface UpsellRule {
  id: number;
  product_id: number;
  suggested_product_id: number;
  score: string;
  min_margin_pct: string;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Orders & fulfillment
// ---------------------------------------------------------------------------

export interface FulfillmentLine {
  warehouse_id: number;
  warehouse_name: string;
  product_id: number;
  product_name: string;
  qty: number;
  shipment_group: number;
}

export interface Backorder {
  id: number;
  product_id: number;
  product_name: string;
  qty: number;
  status: string;
}

export interface Fulfillment {
  id: number;
  strategy: string;
  shipment_count: number;
  estimated_cost: string;
  lines: FulfillmentLine[];
}

export interface SalesOrder {
  id: number;
  reference: string;
  quotation_id: number;
  quotation_reference: string;
  customer_id: number;
  customer_name: string;
  status: string;
  promised_date?: string;
  created_at: string;
  fulfillment?: Fulfillment | null;
  backorders: Backorder[];
}

export interface OrderSummary {
  id: number;
  reference: string;
  quotation_id: number;
  quotation_reference: string;
  customer_id: number;
  customer_name: string;
  status: string;
  promised_date?: string | null;
  confirmed_at?: string | null;
  created_at: string;
  shipment_count: number;
  backorder_count: number;
}

export interface FulfillmentPlan {
  strategy: string;
  shipment_count: number;
  estimated_cost: string;
  allocations: FulfillmentLine[];
  backorders: Backorder[];
  fully_fulfilled: boolean;
}

// ---------------------------------------------------------------------------
// Billing & invoicing
// ---------------------------------------------------------------------------

export interface Invoice {
  id: number;
  reference: string;
  sales_order_id: number;
  order_reference?: string;
  customer_name?: string;
  kind: "ONETIME" | "RECURRING" | string;
  status: InvoiceStatus;
  issue_date: string;
  due_date?: string;
  subtotal: string;
  tax_total: string;
  total: string;
  amount_paid: string;
  outstanding: string;
  created_at: string;
}

export interface InvoiceLine {
  id: number;
  product_id?: number | null;
  description: string;
  qty: string;
  unit_price: string;
  net_amount: string;
  tax_amount: string;
}

export interface Payment {
  id: number;
  amount: string;
  method: string;
  reference: string;
  received_at: string;
}

export interface InvoiceDetail extends Invoice {
  lines: InvoiceLine[];
  payments: Payment[];
}

export interface BillingSchedule {
  id: number;
  quotation_line_id: number;
  plan_name: string;
  product_name: string;
  seq: number;
  period_start: string;
  period_end: string;
  amount: string;
  proration_factor: string;
  status: "SCHEDULED" | "INVOICED" | "PAID" | string;
}

export interface CreditNote {
  id: number;
  reference: string;
  amount: string;
  reason: string;
  status: string;
  created_at: string;
}

export interface OrderBilling {
  invoices: Invoice[];
  schedules: BillingSchedule[];
  credit_notes: CreditNote[];
  recurring_total_per_period: string;
}

export interface Proration {
  days_in_period: number;
  days_remaining: number;
  factor: string;
  amount: string;
  kind: "CHARGE" | "CREDIT" | "NONE" | string;
}

export interface SubscriptionChangeResponse {
  proration: Proration;
  credit_note: CreditNote | null;
  billing: OrderBilling;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface PipelineSummary {
  total_quotations: number;
  pipeline_value: string;
  won_value: string;
  avg_margin_pct: string;
  awaiting_approval: number;
  avg_risk_score: string;
}

export interface StatusCount {
  status: string;
  count: number;
  value: string;
}

export interface StalledDeal {
  quotation_id: number;
  reference: string;
  status: string;
  customer_name: string;
  rep_name: string;
  grand_total: string;
  days_inactive: number;
  last_activity_at: string;
}

export interface DiscountAnomaly {
  quotation_id: number;
  reference: string;
  customer_name: string;
  rep_name: string;
  grand_total: string;
  discount_pct: string;
  baseline_pct: string;
  ratio: string;
}

export interface DeliverySlippage {
  order_id: number;
  reference: string;
  status: string;
  customer_name: string;
  promised_date: string;
  days_late: number;
}

export interface DealHealthThresholds {
  stall_days: number;
  anomaly_multiplier: string;
  anomaly_min_sample: number;
}

export interface DealHealth {
  summary: PipelineSummary;
  statuses: StatusCount[];
  stalled: StalledDeal[];
  discount_anomalies: DiscountAnomaly[];
  delivery_slippage: DeliverySlippage[];
  thresholds: DealHealthThresholds;
}

export interface DealAlert {
  id: number;
  quotation_id: number;
  reference: string;
  customer_name: string;
  alert_type: "STALLED" | "DISCOUNT_ANOMALY" | "DELIVERY_SLIPPAGE" | string;
  severity: "CRITICAL" | "WARNING" | "INFO" | string;
  detail: string;
  metric: string;
  created_at: string;
}

export interface ReportRow {
  rep_name: string;
  sales_team: string;
  category_name: string;
  quotation_count: number;
  net_revenue: string;
  margin: string;
  discount_given: string;
}

export interface ReportFilterEcho {
  from?: string;
  to?: string;
  rep_id?: number | null;
  sales_team?: string;
  status?: string;
  category_id?: number | null;
}

export interface SalesReport {
  rows: ReportRow[];
  summary: PipelineSummary;
  applied_filter: ReportFilterEcho;
}

// Back-compat alias used by a couple of older components.
export type UpsellSuggestion = Upsell;
