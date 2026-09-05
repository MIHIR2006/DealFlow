export type QuotationStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "SENT"
  | "UNDER_NEGOTIATION"
  | "CONFIRMED"
  | "REJECTED";

export type FulfillmentStatus =
  | "UNSPLIT"
  | "SUGGESTED"
  | "ALLOCATED"
  | "PARTIALLY_FULFILLED"
  | "BACKORDERED"
  | "FULFILLED";

export type InvoiceStatus = "POSTED" | "PARTIAL" | "PAID" | "OVERDUE";

export type UserRole = "ADMIN" | "MANAGER" | "FINANCE" | "REP" | "CUSTOMER";

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
  required_level: "NONE" | "MANAGER" | "FINANCE" | string;
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
  line_type: "ONE_TIME" | "RECURRING" | string;
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
  required_level: "NONE" | "MANAGER" | "FINANCE" | string;
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
  required_level: string;
}

export interface Quotation {
  id: number;
  reference: string;
  status: QuotationStatus;
  version?: number;
  customer_id: number;
  customer_name: string;
  customer_tier: "BRONZE" | "SILVER" | "GOLD" | string;
  rep_id: number;
  rep_name: string;
  order_discount_pct: string;
  totals: QuotationTotals;
  lines: QuotationLine[];
  risk: RiskVerdict;
  approvals: ApprovalStep[];
  audit: AuditEntry[];
  last_activity_at: string;
  portal_token?: string;
}

export interface UpsellSuggestion {
  product_id: number;
  product_name: string;
  category_name: string;
  sku: string;
  unit_price: string;
  reason: string;
  margin_delta_pct: string;
  is_promoted: boolean;
  tag?: string;
}

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
  expires_at: string;
  awaiting_review: boolean;
  can_confirm: boolean;
  lines: PortalLine[];
  totals: PortalTotals;
  messages: PortalMessage[];
  counter_offers: PortalCounterOffer[];
}

export interface Warehouse {
  id: number;
  name: string;
  code: string;
  location: string;
  shipping_weight: number;
  is_active: boolean;
}

export interface WarehouseStock {
  warehouse_id: number;
  warehouse_name: string;
  available_qty: number;
  reserved_qty: number;
}

export interface SplitShipment {
  warehouse_id: number;
  warehouse_name: string;
  items: {
    product_id: number;
    product_name: string;
    sku: string;
    qty: number;
  }[];
  est_shipping_cost: string;
  status: string;
}

export interface BackorderItem {
  product_id: number;
  product_name: string;
  sku: string;
  qty_needed: number;
  est_restock_date: string;
}

export interface FulfillmentPlan {
  order_id: number;
  order_number: string;
  status: FulfillmentStatus;
  shipments: SplitShipment[];
  backorders: BackorderItem[];
  total_shipments: number;
  is_manual_override: boolean;
}

export interface Invoice {
  id: number;
  number: string;
  order_id: number;
  order_reference: string;
  customer_name: string;
  invoice_type: "ONE_TIME" | "RECURRING_PERIOD" | string;
  period_start?: string | null;
  period_end?: string | null;
  due_date: string;
  subtotal: string;
  tax_total: string;
  grand_total: string;
  amount_paid: string;
  amount_due: string;
  status: InvoiceStatus;
  created_at: string;
}

export interface BillingScheduleItem {
  id: number;
  period_number: number;
  due_date: string;
  amount: string;
  status: "SCHEDULED" | "INVOICED" | "PAID";
  invoice_number?: string | null;
}

export interface DealAlert {
  id: string;
  quotation_id: number;
  reference: string;
  customer_name: string;
  alert_type: "STALLED" | "DISCOUNT_ANOMALY" | "DELIVERY_SLIPPAGE";
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  metric_value: string;
  baseline_value?: string;
  last_activity_at: string;
}
