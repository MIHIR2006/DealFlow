-- +goose Up
-- +goose StatementBegin

-- Precomputed co-purchase matrix for the recommendation engine.
--
-- The engine (recommendation/, a separate Python service) rebuilds this table
-- in one batch pass over confirmed quotations, and reads it on the request
-- path so a suggestion costs an indexed lookup rather than a self-join over
-- every line ever quoted.
--
-- The schema lives here rather than in the engine because this database has
-- exactly one owner of DDL. The engine keeps an idempotent CREATE IF NOT
-- EXISTS as a safety net for unmigrated environments; the two definitions
-- must stay identical.
--
-- No foreign keys to products: the table is derived data, rebuilt by TRUNCATE
-- and reinsert, and a delisted product must not block that rebuild. Rows for
-- products that no longer exist are filtered out by the JOIN on read.
CREATE TABLE IF NOT EXISTS product_recommendations (
    product_id        BIGINT           NOT NULL,
    recommended_id    BIGINT           NOT NULL,
    co_purchase_count BIGINT           NOT NULL,
    confidence        DOUBLE PRECISION NOT NULL,
    updated_at        TIMESTAMPTZ      NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, recommended_id)
);

-- The read path: anchor products from the cart, strongest pairings first.
CREATE INDEX IF NOT EXISTS idx_product_recommendations_lookup
    ON product_recommendations (product_id, co_purchase_count DESC);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS product_recommendations;
-- +goose StatementEnd
