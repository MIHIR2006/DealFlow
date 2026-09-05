export type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: unknown };
};

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Attach token for authenticated endpoints unless one is already explicitly set.
  // Portal routes are resolved from the token in the URL, never a bearer token.
  const isAuthEndpoint =
    path.startsWith("/v1/auth/login") ||
    path.startsWith("/v1/auth/signup") ||
    path.startsWith("/v1/portal/");
  if (typeof window !== "undefined" && !isAuthEndpoint && !headers.has("Authorization")) {
    const token = readToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as (T & ApiErrorBody) | null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "UNKNOWN",
      data?.error?.message ?? "Something went wrong",
    );
  }

  return data as T;
}

const TOKEN_KEY = "df360.token";

export function saveToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function readToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Typed endpoint client
//
// Every function here is a thin, literal wrapper around one backend route.
// None of them compute a price, a margin, a discount, or a risk score —
// those numbers only ever come back from a server response. Pages call
// these and render exactly what they return.
// ---------------------------------------------------------------------------

import type {
  ApprovalInboxRow,
  ApprovalPolicy,
  ApprovalStep,
  Category,
  Customer,
  DealAlert,
  DealHealth,
  FulfillmentPlan,
  GovernanceSnapshot,
  Invoice,
  InvoiceDetail,
  OrderBilling,
  OrderSummary,
  Page,
  PortalQuotation,
  Product,
  Quotation,
  QuotationSummary,
  SalesOrder,
  SalesReport,
  SendQuotationResponse,
  SessionResponse,
  StockItem,
  SubscriptionChangeResponse,
  SubscriptionPlan,
  Upsell,
  UpsellRule,
  User,
  Warehouse,
} from "@/lib/types";

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** A fresh key for a money-moving POST, so a retried click never double-posts. */
export function idempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- Auth --------------------------------------------------------------

export const AuthApi = {
  login: (email: string, password: string) =>
    api<SessionResponse>("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (input: { email: string; password: string; full_name: string; role: string; sales_team?: string }) =>
    api<SessionResponse>("/v1/auth/signup", { method: "POST", body: JSON.stringify(input) }),
  me: () => api<User>("/v1/auth/me"),
};

// --- Config / catalogue / governance ------------------------------------

export const ConfigApi = {
  listCustomers: (params?: { cursor?: number; limit?: number }) =>
    api<Page<Customer>>(`/v1/customers${qs(params ?? {})}`),
  createCustomer: (input: { name: string; email: string; tier: string }) =>
    api<Customer>("/v1/customers", { method: "POST", body: JSON.stringify(input) }),

  listCategories: () => api<Page<Category>>("/v1/categories"),
  createCategory: (name: string) =>
    api<Category>("/v1/categories", { method: "POST", body: JSON.stringify({ name }) }),

  listProducts: (params?: { category_id?: number; cursor?: number; limit?: number }) =>
    api<Page<Product>>(`/v1/products${qs(params ?? {})}`),
  getProduct: (id: number) => api<Product>(`/v1/products/${id}`),
  createProduct: (input: Omit<Product, "id" | "category_name">) =>
    api<Product>("/v1/products", { method: "POST", body: JSON.stringify(input) }),
  updateProduct: (id: number, input: Omit<Product, "id" | "category_name">) =>
    api<Product>(`/v1/products/${id}`, { method: "PUT", body: JSON.stringify(input) }),

  governance: () => api<GovernanceSnapshot>("/v1/governance"),
  setDiscountTier: (tier: string, maxDiscountPct: string) =>
    api<{ tier: string; max_discount_pct: string }>(`/v1/governance/tiers/${tier}`, {
      method: "PUT",
      body: JSON.stringify({ max_discount_pct: maxDiscountPct }),
    }),
  setCategoryCeiling: (categoryId: number, maxDiscountPct: string) =>
    api<{ category_id: number; max_discount_pct: string }>(
      `/v1/governance/categories/${categoryId}/ceiling`,
      { method: "PUT", body: JSON.stringify({ max_discount_pct: maxDiscountPct }) },
    ),
  createPolicy: (input: Omit<ApprovalPolicy, "id">) =>
    api<ApprovalPolicy>("/v1/governance/policies", { method: "POST", body: JSON.stringify(input) }),
  updatePolicy: (id: number, input: Omit<ApprovalPolicy, "id">) =>
    api<ApprovalPolicy>(`/v1/governance/policies/${id}`, { method: "PUT", body: JSON.stringify(input) }),

  listWarehouses: () => api<Page<Warehouse>>("/v1/warehouses"),
  createWarehouse: (name: string, shippingCostWeight?: string) =>
    api<Warehouse>("/v1/warehouses", {
      method: "POST",
      body: JSON.stringify({ name, shipping_cost_weight: shippingCostWeight }),
    }),
  setStock: (warehouseId: number, productId: number, onHand: number) =>
    api<StockItem>(`/v1/warehouses/${warehouseId}/stock`, {
      method: "PUT",
      body: JSON.stringify({ product_id: productId, on_hand: onHand }),
    }),
  addStock: (warehouseId: number, productId: number, qty: number) =>
    api<StockItem>(`/v1/warehouses/${warehouseId}/stock`, {
      method: "POST",
      body: JSON.stringify({ product_id: productId, qty }),
    }),

  listPlans: () => api<Page<SubscriptionPlan>>("/v1/subscription-plans"),
  createPlan: (name: string, period: string, cycles: number) =>
    api<SubscriptionPlan>("/v1/subscription-plans", {
      method: "POST",
      body: JSON.stringify({ name, period, cycles }),
    }),

  createUpsellRule: (input: { product_id: number; suggested_product_id: number; score?: string; min_margin_pct?: string }) =>
    api<UpsellRule>("/v1/upsell-rules", { method: "POST", body: JSON.stringify(input) }),
};

// --- Quotations ----------------------------------------------------------

export const QuotationApi = {
  list: (params?: { status?: string; customer_id?: number; cursor?: number; limit?: number }) =>
    api<Page<QuotationSummary>>(`/v1/quotations${qs(params ?? {})}`),
  get: (id: number) => api<Quotation>(`/v1/quotations/${id}`),
  create: (customerId: number) =>
    api<Quotation>("/v1/quotations", { method: "POST", body: JSON.stringify({ customer_id: customerId }) }),
  addLine: (id: number, input: { product_id: number; qty: string; discount_pct?: string; plan_id?: number | null }) =>
    api<Quotation>(`/v1/quotations/${id}/lines`, { method: "POST", body: JSON.stringify(input) }),
  updateLine: (id: number, lineId: number, input: { qty: string; discount_pct?: string }) =>
    api<Quotation>(`/v1/quotations/${id}/lines/${lineId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteLine: (id: number, lineId: number) =>
    api<Quotation>(`/v1/quotations/${id}/lines/${lineId}`, { method: "DELETE" }),
  setOrderDiscount: (id: number, pct: string) =>
    api<Quotation>(`/v1/quotations/${id}/order-discount`, {
      method: "PUT",
      body: JSON.stringify({ order_discount_pct: pct }),
    }),
  submit: (id: number) => api<Quotation>(`/v1/quotations/${id}/submit`, { method: "POST" }),
  upsell: (id: number) => api<Page<Upsell>>(`/v1/quotations/${id}/upsell`),
  send: (id: number) => api<SendQuotationResponse>(`/v1/quotations/${id}/send`, { method: "POST" }),
  confirm: (id: number, promisedDate?: string) =>
    api<SalesOrder>(`/v1/quotations/${id}/confirm`, {
      method: "POST",
      body: promisedDate ? JSON.stringify({ promised_date: promisedDate }) : undefined,
    }),
  nudge: (id: number, note?: string) =>
    api<Quotation>(`/v1/quotations/${id}/nudge`, {
      method: "POST",
      body: note ? JSON.stringify({ note }) : undefined,
    }),
};

// --- Approvals -------------------------------------------------------------

export const ApprovalApi = {
  inbox: (params?: { cursor?: number; limit?: number }) =>
    api<Page<ApprovalInboxRow>>(`/v1/approvals${qs(params ?? {})}`),
  approve: (id: number, reason?: string) =>
    api<Quotation>(`/v1/approvals/${id}/approve`, {
      method: "POST",
      body: reason ? JSON.stringify({ reason }) : undefined,
    }),
  returnForRevision: (id: number, reason: string) =>
    api<Quotation>(`/v1/approvals/${id}/return`, { method: "POST", body: JSON.stringify({ reason }) }),
  reject: (id: number, reason: string) =>
    api<Quotation>(`/v1/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
};

// --- Orders / fulfillment ---------------------------------------------------

export const OrderApi = {
  list: (limit?: number) => api<Page<OrderSummary>>(`/v1/orders${qs({ limit })}`),
  get: (id: number) => api<SalesOrder>(`/v1/orders/${id}`),
  suggestFulfillment: (id: number) => api<FulfillmentPlan>(`/v1/orders/${id}/fulfillment/suggest`),
  acceptFulfillment: (id: number) => api<SalesOrder>(`/v1/orders/${id}/fulfillment`, { method: "POST" }),
  consolidateBackorders: (id: number) =>
    api<SalesOrder>(`/v1/orders/${id}/backorders/consolidate`, { method: "POST" }),

  generateInvoice: (id: number) =>
    api<OrderBilling>(`/v1/orders/${id}/invoices`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey() },
    }),
  getBilling: (id: number) => api<OrderBilling>(`/v1/orders/${id}/billing`),
  changeSubscription: (id: number, lineId: number, qty: string) =>
    api<SubscriptionChangeResponse>(`/v1/orders/${id}/subscriptions/${lineId}/change`, {
      method: "POST",
      body: JSON.stringify({ qty }),
      headers: { "Idempotency-Key": idempotencyKey() },
    }),
};

// --- Invoices ----------------------------------------------------------------

export const InvoiceApi = {
  list: (params?: { status?: string; cursor?: number; limit?: number }) =>
    api<Page<Invoice>>(`/v1/invoices${qs(params ?? {})}`),
  get: (id: number) => api<InvoiceDetail>(`/v1/invoices/${id}`),
  recordPayment: (id: number, input: { amount: string; method: string; reference?: string }) =>
    api<InvoiceDetail>(`/v1/invoices/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(input),
      headers: { "Idempotency-Key": idempotencyKey() },
    }),
};

// --- Portal (token-scoped, no bearer auth) ----------------------------------

export const PortalApi = {
  get: (token: string) => api<PortalQuotation>(`/v1/portal/q/${token}`),
  postMessage: (token: string, body: string, lineId?: number | null) =>
    api<PortalQuotation>(`/v1/portal/q/${token}/messages`, {
      method: "POST",
      body: JSON.stringify({ body, line_id: lineId ?? null }),
    }),
  counterOffer: (token: string, proposedDiscountPct: string, lineId?: number | null, note?: string) =>
    api<PortalQuotation>(`/v1/portal/q/${token}/counter-offer`, {
      method: "POST",
      body: JSON.stringify({ proposed_discount_pct: proposedDiscountPct, line_id: lineId ?? null, note }),
    }),
  confirm: (token: string) => api<PortalQuotation>(`/v1/portal/q/${token}/confirm`, { method: "POST" }),
};

// --- Analytics ---------------------------------------------------------------

export const AnalyticsApi = {
  dealHealth: (params?: { stall_days?: number; multiplier?: number; limit?: number }) =>
    api<DealHealth>(`/v1/dashboard/deal-health${qs(params ?? {})}`),
  alerts: (limit?: number) => api<Page<DealAlert>>(`/v1/dashboard/alerts${qs({ limit })}`),
  report: (params?: {
    from?: string;
    to?: string;
    rep_id?: number;
    sales_team?: string;
    status?: string;
    category_id?: number;
  }) => api<SalesReport>(`/v1/reports${qs(params ?? {})}`),
};
