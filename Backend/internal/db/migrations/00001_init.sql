-- +goose Up
-- +goose StatementBegin

-- DealFlow360 initial schema.
--
-- Conventions used throughout:
--   * money            NUMERIC(14,2)  -- never float; see internal/domain/money
--   * percentages      NUMERIC(6,3)   -- e.g. 12.345%
--   * enumerations     TEXT + CHECK   -- alterable without a migration lock,
--                                        and simpler for sqlc than PG enums
--   * every FK used in a WHERE or JOIN gets an explicit index, because
--     Postgres does not create them automatically.

-- ---------------------------------------------------------------------------
-- Identity and configuration
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    full_name     TEXT        NOT NULL,
    role          TEXT        NOT NULL CHECK (role IN ('ADMIN','MANAGER','FINANCE','REP')),
    sales_team    TEXT        NOT NULL DEFAULT 'default',
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users (role) WHERE is_active;
CREATE INDEX idx_users_sales_team ON users (sales_team);

CREATE TABLE customers (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL,
    email      TEXT        NOT NULL UNIQUE,
    tier       TEXT        NOT NULL CHECK (tier IN ('BRONZE','SILVER','GOLD')),
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_tier ON customers (tier);

CREATE TABLE categories (
    id         BIGSERIAL PRIMARY KEY,
    name       TEXT        NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id              BIGSERIAL PRIMARY KEY,
    category_id     BIGINT        NOT NULL REFERENCES categories (id),
    sku             TEXT          NOT NULL UNIQUE,
    name            TEXT          NOT NULL,
    description     TEXT          NOT NULL DEFAULT '',
    unit            TEXT          NOT NULL DEFAULT 'unit',
    unit_price      NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    unit_cost       NUMERIC(14,2) NOT NULL CHECK (unit_cost  >= 0),
    tax_rate_pct    NUMERIC(6,3)  NOT NULL DEFAULT 0 CHECK (tax_rate_pct BETWEEN 0 AND 100),
    is_promoted     BOOLEAN       NOT NULL DEFAULT FALSE,
    is_subscription BOOLEAN       NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON products (category_id);
CREATE INDEX idx_products_promoted ON products (is_promoted) WHERE is_promoted;

-- Base discount ceiling per customer tier.
CREATE TABLE discount_tiers (
    id               BIGSERIAL PRIMARY KEY,
    tier             TEXT         NOT NULL UNIQUE CHECK (tier IN ('BRONZE','SILVER','GOLD')),
    max_discount_pct NUMERIC(6,3) NOT NULL CHECK (max_discount_pct BETWEEN 0 AND 100),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Optional tighter ceiling for a category. The effective ceiling for a line is
-- min(tier, category) -- a thin-margin service may allow less than the
-- customer's tier otherwise would.
CREATE TABLE category_ceilings (
    id               BIGSERIAL PRIMARY KEY,
    category_id      BIGINT       NOT NULL UNIQUE REFERENCES categories (id) ON DELETE CASCADE,
    max_discount_pct NUMERIC(6,3) NOT NULL CHECK (max_discount_pct BETWEEN 0 AND 100),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Approval routing rules. A policy matches when EITHER threshold is met, so
-- the blended score and the worst single line act as independent triggers.
CREATE TABLE approval_policies (
    id               BIGSERIAL PRIMARY KEY,
    name             TEXT         NOT NULL,
    min_blended      NUMERIC(6,3) NOT NULL DEFAULT 0,
    min_line_overage NUMERIC(6,3) NOT NULL DEFAULT 0,
    requires_manager BOOLEAN      NOT NULL DEFAULT FALSE,
    requires_finance BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_approval_policies_active ON approval_policies (is_active) WHERE is_active;

CREATE TABLE subscription_plans (
    id           BIGSERIAL PRIMARY KEY,
    name         TEXT        NOT NULL UNIQUE,
    period       TEXT        NOT NULL CHECK (period IN ('MONTHLY','QUARTERLY','YEARLY')),
    cycles       INTEGER     NOT NULL DEFAULT 12 CHECK (cycles > 0),
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE upsell_rules (
    id                   BIGSERIAL PRIMARY KEY,
    product_id           BIGINT       NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    suggested_product_id BIGINT       NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    score                NUMERIC(6,3) NOT NULL DEFAULT 0,
    min_margin_pct       NUMERIC(6,3) NOT NULL DEFAULT 0,
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT upsell_rules_distinct CHECK (product_id <> suggested_product_id),
    CONSTRAINT upsell_rules_pair UNIQUE (product_id, suggested_product_id)
);
CREATE INDEX idx_upsell_rules_product ON upsell_rules (product_id) WHERE is_active;

-- Replayed money mutations (payments, invoicing, order confirmation) must not
-- double-charge. The client sends Idempotency-Key; the first response is
-- stored and replayed verbatim for any repeat with the same key.
CREATE TABLE idempotency_keys (
    id             BIGSERIAL PRIMARY KEY,
    key            TEXT        NOT NULL,
    endpoint       TEXT        NOT NULL,
    request_hash   TEXT        NOT NULL,
    response_status INTEGER    NOT NULL,
    response_body  JSONB       NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT idempotency_keys_scope UNIQUE (key, endpoint)
);
CREATE INDEX idx_idempotency_created ON idempotency_keys (created_at);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

CREATE TABLE warehouses (
    id                   BIGSERIAL PRIMARY KEY,
    name                 TEXT          NOT NULL UNIQUE,
    shipping_cost_weight NUMERIC(14,2) NOT NULL DEFAULT 1 CHECK (shipping_cost_weight >= 0),
    is_active            BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE stock_items (
    id           BIGSERIAL PRIMARY KEY,
    warehouse_id BIGINT      NOT NULL REFERENCES warehouses (id) ON DELETE CASCADE,
    product_id   BIGINT      NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    on_hand      BIGINT      NOT NULL DEFAULT 0 CHECK (on_hand  >= 0),
    reserved     BIGINT      NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_items_unique UNIQUE (warehouse_id, product_id),
    CONSTRAINT stock_items_not_oversold CHECK (reserved <= on_hand)
);
-- The split engine loads stock for a set of products across all warehouses.
CREATE INDEX idx_stock_items_product ON stock_items (product_id);

-- ---------------------------------------------------------------------------
-- Quotations
-- ---------------------------------------------------------------------------

CREATE TABLE quotations (
    id          BIGSERIAL PRIMARY KEY,
    reference   TEXT   NOT NULL UNIQUE,
    customer_id BIGINT NOT NULL REFERENCES customers (id),
    rep_id      BIGINT NOT NULL REFERENCES users (id),

    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT','PENDING_APPROVAL','APPROVED','REJECTED',
        'SENT','UNDER_NEGOTIATION','CONFIRMED'
    )),

    order_discount_pct NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (order_discount_pct BETWEEN 0 AND 100),

    -- Totals are stored, not recomputed on read: list views and dashboards
    -- read columns instead of re-running the pricing engine per row.
    list_subtotal  NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_subtotal   NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
    grand_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost_total     NUMERIC(14,2) NOT NULL DEFAULT 0,
    margin_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    margin_pct     NUMERIC(6,3)  NOT NULL DEFAULT 0,

    -- Governance verdict, stored so the approvals inbox never re-scores.
    blended_risk_score NUMERIC(6,3) NOT NULL DEFAULT 0,
    max_line_overage   NUMERIC(6,3) NOT NULL DEFAULT 0,
    required_level     TEXT NOT NULL DEFAULT 'NONE'
                       CHECK (required_level IN ('NONE','MANAGER','MANAGER_FINANCE')),
    matched_policy_id  BIGINT REFERENCES approval_policies (id),
    risk_rationale     TEXT NOT NULL DEFAULT '',

    -- Optimistic locking: two reps editing one quotation must not silently
    -- clobber each other.
    version INTEGER NOT NULL DEFAULT 1,

    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotations_rep_status  ON quotations (rep_id, status);
CREATE INDEX idx_quotations_customer    ON quotations (customer_id);
-- Drives the stalled-deal scan on the deal health dashboard.
CREATE INDEX idx_quotations_stalled     ON quotations (status, last_activity_at);

CREATE TABLE quotation_lines (
    id           BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
    product_id   BIGINT NOT NULL REFERENCES products (id),
    category_id  BIGINT NOT NULL REFERENCES categories (id),

    position   INTEGER       NOT NULL DEFAULT 0,
    qty        NUMERIC(14,2) NOT NULL CHECK (qty > 0),
    unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
    unit_cost  NUMERIC(14,2) NOT NULL CHECK (unit_cost  >= 0),

    line_discount_pct NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (line_discount_pct BETWEEN 0 AND 100),
    tax_rate_pct      NUMERIC(6,3) NOT NULL DEFAULT 0,

    -- The line discount composed with the order discount. Governance scores
    -- this, so a 20% order-level discount cannot hide behind 0% lines.
    effective_discount_pct NUMERIC(6,3)  NOT NULL DEFAULT 0,
    list_value             NUMERIC(14,2) NOT NULL DEFAULT 0,
    discount_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
    cost_amount            NUMERIC(14,2) NOT NULL DEFAULT 0,
    margin_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
    margin_pct             NUMERIC(6,3)  NOT NULL DEFAULT 0,

    -- Governance breakdown, stored so the "Why This Quote Was Flagged" table
    -- always agrees with the score it is displayed beside.
    ceiling_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
    overage_pts NUMERIC(6,3) NOT NULL DEFAULT 0,

    line_type TEXT   NOT NULL DEFAULT 'ONETIME' CHECK (line_type IN ('ONETIME','RECURRING')),
    plan_id   BIGINT REFERENCES subscription_plans (id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT quotation_lines_plan_required
        CHECK (line_type <> 'RECURRING' OR plan_id IS NOT NULL)
);
-- The highest-value index in the schema: every quotation read joins on it.
CREATE INDEX idx_quotation_lines_quotation ON quotation_lines (quotation_id);
CREATE INDEX idx_quotation_lines_product   ON quotation_lines (product_id);

-- One row per step of the approval chain.
CREATE TABLE approval_requests (
    id           BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT  NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
    step         INTEGER NOT NULL CHECK (step > 0),

    required_role TEXT NOT NULL CHECK (required_role IN ('MANAGER','FINANCE')),
    status        TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','APPROVED','REJECTED','RETURNED','SUPERSEDED')),

    actor_id   BIGINT REFERENCES users (id),
    reason     TEXT   NOT NULL DEFAULT '',
    decided_at TIMESTAMPTZ,

    -- Bumped when a chain is rebuilt (an edit after approval, or a customer
    -- counter-offer). Prior rounds are kept, never deleted: the audit trail
    -- must show submitted -> returned -> resubmitted.
    round INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT approval_requests_step_unique UNIQUE (quotation_id, round, step)
);
CREATE INDEX idx_approval_requests_quotation ON approval_requests (quotation_id, round, step);
-- Drives the approvals inbox, filtered by the caller's role.
CREATE INDEX idx_approval_requests_inbox     ON approval_requests (status, required_role)
    WHERE status = 'PENDING';

-- Append-only trail. The problem statement requires every approval,
-- rejection, and edit to be logged with user, timestamp, and reason.
CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    entity_type TEXT   NOT NULL,
    entity_id   BIGINT NOT NULL,
    action      TEXT   NOT NULL,
    actor_id    BIGINT REFERENCES users (id),
    actor_label TEXT   NOT NULL DEFAULT '',
    note        TEXT   NOT NULL DEFAULT '',
    payload     JSONB  NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE TABLE deal_alerts (
    id           BIGSERIAL PRIMARY KEY,
    quotation_id BIGINT NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
    alert_type   TEXT   NOT NULL CHECK (alert_type IN
                 ('STALLED','DISCOUNT_ANOMALY','DELIVERY_SLIP')),
    severity     TEXT   NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH')),
    detail       TEXT   NOT NULL DEFAULT '',
    metric       NUMERIC(14,3) NOT NULL DEFAULT 0,
    resolved_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_alerts_open ON deal_alerts (alert_type, created_at DESC)
    WHERE resolved_at IS NULL;
CREATE INDEX idx_deal_alerts_quotation ON deal_alerts (quotation_id);

-- ---------------------------------------------------------------------------
-- Customer portal
-- ---------------------------------------------------------------------------

-- A token grants access to exactly ONE quotation. Portal handlers resolve the
-- quotation from the token and never accept an id from the request, which
-- makes cross-customer access structurally impossible rather than merely
-- checked.
CREATE TABLE portal_tokens (
    id           BIGSERIAL PRIMARY KEY,
    token        TEXT   NOT NULL UNIQUE,
    quotation_id BIGINT NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
    customer_id  BIGINT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    expires_at   TIMESTAMPTZ NOT NULL,
    used_at      TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_tokens_quotation ON portal_tokens (quotation_id);

CREATE TABLE negotiation_messages (
    id                BIGSERIAL PRIMARY KEY,
    quotation_id      BIGINT NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
    quotation_line_id BIGINT REFERENCES quotation_lines (id) ON DELETE SET NULL,
    author_type       TEXT   NOT NULL CHECK (author_type IN ('CUSTOMER','STAFF')),
    author_id         BIGINT,
    author_label      TEXT   NOT NULL DEFAULT '',
    body              TEXT   NOT NULL CHECK (length(body) > 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_negotiation_messages_quotation
    ON negotiation_messages (quotation_id, created_at);

CREATE TABLE counter_offers (
    id                BIGSERIAL PRIMARY KEY,
    quotation_id      BIGINT NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
    quotation_line_id BIGINT REFERENCES quotation_lines (id) ON DELETE SET NULL,

    previous_discount_pct NUMERIC(6,3) NOT NULL DEFAULT 0,
    proposed_discount_pct NUMERIC(6,3) NOT NULL CHECK (proposed_discount_pct BETWEEN 0 AND 100),

    outcome TEXT NOT NULL DEFAULT 'PENDING'
            CHECK (outcome IN ('PENDING','AUTO_ACCEPTED','ROUTED_FOR_APPROVAL','REJECTED')),
    note       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_counter_offers_quotation ON counter_offers (quotation_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Orders and fulfilment
-- ---------------------------------------------------------------------------

CREATE TABLE sales_orders (
    id           BIGSERIAL PRIMARY KEY,
    reference    TEXT   NOT NULL UNIQUE,
    quotation_id BIGINT NOT NULL UNIQUE REFERENCES quotations (id),
    customer_id  BIGINT NOT NULL REFERENCES customers (id),

    status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN
           ('CONFIRMED','PARTIALLY_FULFILLED','FULFILLED','INVOICED','PAID','CANCELLED')),

    promised_date TIMESTAMPTZ,
    confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_orders_customer ON sales_orders (customer_id);
-- Drives the delivery-slippage alert.
CREATE INDEX idx_sales_orders_promised ON sales_orders (status, promised_date)
    WHERE promised_date IS NOT NULL;

CREATE TABLE fulfillments (
    id             BIGSERIAL PRIMARY KEY,
    sales_order_id BIGINT  NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,
    strategy       TEXT    NOT NULL CHECK (strategy IN
                   ('SINGLE_WAREHOUSE','GREEDY_SPLIT','NOTHING_TO_SHIP')),
    shipment_count INTEGER NOT NULL DEFAULT 0,
    estimated_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fulfillments_order ON fulfillments (sales_order_id);

CREATE TABLE fulfillment_lines (
    id             BIGSERIAL PRIMARY KEY,
    fulfillment_id BIGINT  NOT NULL REFERENCES fulfillments (id) ON DELETE CASCADE,
    warehouse_id   BIGINT  NOT NULL REFERENCES warehouses (id),
    product_id     BIGINT  NOT NULL REFERENCES products (id),
    qty            BIGINT  NOT NULL CHECK (qty > 0),
    shipment_group INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fulfillment_lines_fulfillment ON fulfillment_lines (fulfillment_id);
CREATE INDEX idx_fulfillment_lines_warehouse   ON fulfillment_lines (warehouse_id);

-- Demand no warehouse could satisfy. A normal outcome, not an error: the
-- order still confirms and the shortfall is consolidated when stock arrives.
CREATE TABLE backorders (
    id             BIGSERIAL PRIMARY KEY,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,
    product_id     BIGINT NOT NULL REFERENCES products (id),
    qty            BIGINT NOT NULL CHECK (qty > 0),
    status         TEXT   NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONSOLIDATED','CANCELLED')),
    resolved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_backorders_open ON backorders (sales_order_id) WHERE status = 'OPEN';
CREATE INDEX idx_backorders_product ON backorders (product_id) WHERE status = 'OPEN';

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

CREATE TABLE invoices (
    id             BIGSERIAL PRIMARY KEY,
    reference      TEXT   NOT NULL UNIQUE,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,

    -- ONETIME and RECURRING invoices sit side by side on one order; that
    -- separation is the hybrid billing requirement.
    kind TEXT NOT NULL CHECK (kind IN ('ONETIME','RECURRING')),

    status TEXT NOT NULL DEFAULT 'DRAFT'
           CHECK (status IN ('DRAFT','POSTED','PARTIAL','PAID','CANCELLED')),

    issue_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date    DATE,

    subtotal    NUMERIC(14,2) NOT NULL DEFAULT 0,
    tax_total   NUMERIC(14,2) NOT NULL DEFAULT 0,
    total       NUMERIC(14,2) NOT NULL DEFAULT 0,
    amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_order  ON invoices (sales_order_id);
CREATE INDEX idx_invoices_status ON invoices (status);

CREATE TABLE invoice_lines (
    id          BIGSERIAL PRIMARY KEY,
    invoice_id  BIGINT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    product_id  BIGINT REFERENCES products (id),
    description TEXT   NOT NULL,
    qty         NUMERIC(14,2) NOT NULL,
    unit_price  NUMERIC(14,2) NOT NULL,
    net_amount  NUMERIC(14,2) NOT NULL,
    tax_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines (invoice_id);

CREATE TABLE payments (
    id           BIGSERIAL PRIMARY KEY,
    invoice_id   BIGINT        NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    method       TEXT          NOT NULL CHECK (method IN ('CASH','BANK')),
    reference    TEXT          NOT NULL DEFAULT '',
    recorded_by  BIGINT REFERENCES users (id),
    received_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_invoice ON payments (invoice_id);

-- One row per future recurring invoice, laid out when the order confirms.
CREATE TABLE billing_schedules (
    id                BIGSERIAL PRIMARY KEY,
    sales_order_id    BIGINT NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,
    quotation_line_id BIGINT NOT NULL REFERENCES quotation_lines (id) ON DELETE CASCADE,
    plan_id           BIGINT NOT NULL REFERENCES subscription_plans (id),

    seq          INTEGER     NOT NULL CHECK (seq > 0),
    period_start TIMESTAMPTZ NOT NULL,
    period_end   TIMESTAMPTZ NOT NULL,

    amount           NUMERIC(14,2) NOT NULL,
    proration_factor NUMERIC(10,4) NOT NULL DEFAULT 1,

    status     TEXT NOT NULL DEFAULT 'SCHEDULED'
               CHECK (status IN ('SCHEDULED','INVOICED','CANCELLED')),
    invoice_id BIGINT REFERENCES invoices (id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT billing_schedules_period CHECK (period_end > period_start),
    CONSTRAINT billing_schedules_seq UNIQUE (quotation_line_id, seq)
);
CREATE INDEX idx_billing_schedules_order ON billing_schedules (sales_order_id);
-- Drives the recurring-billing background job.
CREATE INDEX idx_billing_schedules_due   ON billing_schedules (status, period_start)
    WHERE status = 'SCHEDULED';

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS billing_schedules;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS invoice_lines;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS backorders;
DROP TABLE IF EXISTS fulfillment_lines;
DROP TABLE IF EXISTS fulfillments;
DROP TABLE IF EXISTS sales_orders;
DROP TABLE IF EXISTS counter_offers;
DROP TABLE IF EXISTS negotiation_messages;
DROP TABLE IF EXISTS portal_tokens;
DROP TABLE IF EXISTS deal_alerts;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS approval_requests;
DROP TABLE IF EXISTS quotation_lines;
DROP TABLE IF EXISTS quotations;
DROP TABLE IF EXISTS stock_items;
DROP TABLE IF EXISTS warehouses;
DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS upsell_rules;
DROP TABLE IF EXISTS subscription_plans;
DROP TABLE IF EXISTS approval_policies;
DROP TABLE IF EXISTS category_ceilings;
DROP TABLE IF EXISTS discount_tiers;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;
-- +goose StatementEnd
