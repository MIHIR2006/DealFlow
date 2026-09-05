-- +goose Up
-- +goose StatementBegin

-- A credit note records money owed back to the customer, computed when a
-- subscription shrinks part way through a period.
--
-- The amount is calculated and recorded; paying it out is a payment-gateway
-- concern this system deliberately does not own. Finance sees the note and
-- settles it through whatever channel the customer was charged on.
CREATE TABLE credit_notes (
    id             BIGSERIAL PRIMARY KEY,
    reference      TEXT   NOT NULL UNIQUE,
    sales_order_id BIGINT NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,

    -- The schedule row the credit came from, when it came from one.
    billing_schedule_id BIGINT REFERENCES billing_schedules (id) ON DELETE SET NULL,
    quotation_line_id   BIGINT REFERENCES quotation_lines (id) ON DELETE SET NULL,

    amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    proration_factor NUMERIC(10,4) NOT NULL DEFAULT 1,
    reason           TEXT          NOT NULL DEFAULT '',

    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','SETTLED','CANCELLED')),

    created_by BIGINT REFERENCES users (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_notes_order ON credit_notes (sales_order_id);
CREATE INDEX idx_credit_notes_open  ON credit_notes (status) WHERE status = 'ISSUED';

-- Idempotent money endpoints need to reserve a key before doing the work,
-- not after: two concurrent replays must not both execute. A reserved row
-- carries response_status 0 until the handler finishes.
ALTER TABLE idempotency_keys
    ALTER COLUMN response_status SET DEFAULT 0;

-- The stored response is replayed to the client verbatim, so it has to come
-- back exactly as it went in. jsonb normalises key order and whitespace,
-- which would make a replay differ byte for byte from the original answer.
ALTER TABLE idempotency_keys
    ALTER COLUMN response_body TYPE TEXT USING response_body::text;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE idempotency_keys ALTER COLUMN response_body TYPE JSONB USING response_body::jsonb;
ALTER TABLE idempotency_keys ALTER COLUMN response_status DROP DEFAULT;
DROP TABLE IF EXISTS credit_notes;
-- +goose StatementEnd
