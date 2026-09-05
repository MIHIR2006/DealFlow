-- +goose Up
-- +goose StatementBegin

-- The stalled-deal scan filters on a fixed set of open statuses and orders by
-- last activity. The composite index on (status, last_activity_at) can satisfy
-- the filter but not the ordering, because a status IN (...) predicate leaves
-- the second column unordered across the matched groups -- so Postgres was
-- reading every open quotation and sorting them to find the twenty oldest.
--
-- A partial index on last_activity_at, restricted to exactly those statuses,
-- is already in the order the query wants. The LIMIT then stops after twenty
-- rows instead of after a full sort.
CREATE INDEX idx_quotations_stalled_scan
    ON quotations (last_activity_at)
    WHERE status IN ('DRAFT', 'PENDING_APPROVAL', 'SENT', 'UNDER_NEGOTIATION');

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS idx_quotations_stalled_scan;
-- +goose StatementEnd
