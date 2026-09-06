-- +goose Up
-- +goose StatementBegin

-- Where a warehouse ships from, and where a customer takes delivery.
--
-- This is presentation and planning context, not an input to the split engine.
-- The greedy set-cover chooses warehouses by coverage and shipping_cost_weight,
-- exactly as the problem statement specifies; adding coordinates does not
-- change that decision, it makes the decision legible on a map.
--
-- Nullable throughout: a warehouse or customer without coordinates is a normal
-- record, and every read path treats missing geography as "not plottable"
-- rather than as an error. The engine never reads these columns.
ALTER TABLE warehouses
    ADD COLUMN IF NOT EXISTS city      TEXT,
    ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS city      TEXT,
    ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);

-- Coordinates are only meaningful in pairs and only within real ranges.
ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_geo_valid;
ALTER TABLE warehouses ADD CONSTRAINT warehouses_geo_valid CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_geo_valid;
ALTER TABLE customers ADD CONSTRAINT customers_geo_valid CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_geo_valid;
ALTER TABLE customers  DROP CONSTRAINT IF EXISTS customers_geo_valid;
ALTER TABLE warehouses DROP COLUMN IF EXISTS city, DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude;
ALTER TABLE customers  DROP COLUMN IF EXISTS city, DROP COLUMN IF EXISTS latitude, DROP COLUMN IF EXISTS longitude;
-- +goose StatementEnd
