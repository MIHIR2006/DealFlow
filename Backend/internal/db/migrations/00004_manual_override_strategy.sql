-- +goose Up
-- +goose StatementBegin

-- The fulfillment domain gained a MANUAL_OVERRIDE strategy (recorded whenever
-- a rep or finance reviewer replaces the engine's own warehouse split with
-- their own), but this table's check constraint was never widened to accept
-- it -- every manual override with at least one allocation failed the insert
-- with a check-constraint violation instead of persisting.
ALTER TABLE fulfillments DROP CONSTRAINT fulfillments_strategy_check;
ALTER TABLE fulfillments ADD CONSTRAINT fulfillments_strategy_check CHECK (strategy IN
               ('SINGLE_WAREHOUSE','GREEDY_SPLIT','NOTHING_TO_SHIP','MANUAL_OVERRIDE'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

ALTER TABLE fulfillments DROP CONSTRAINT fulfillments_strategy_check;
ALTER TABLE fulfillments ADD CONSTRAINT fulfillments_strategy_check CHECK (strategy IN
               ('SINGLE_WAREHOUSE','GREEDY_SPLIT','NOTHING_TO_SHIP'));

-- +goose StatementEnd
