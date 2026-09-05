-- +goose Up
-- +goose StatementBegin

-- A counter-offer that was routed for approval had no way to end.
--
-- The customer proposes, governance routes it, a manager decides -- and the
-- offer row stayed ROUTED_FOR_APPROVAL forever, so the customer's negotiation
-- history said "sent for approval" long after the answer had been given.
-- APPROVED closes that loop: it is what a routed offer becomes when every
-- required approval has been granted, as distinct from AUTO_ACCEPTED, which
-- means it never needed one.
ALTER TABLE counter_offers DROP CONSTRAINT IF EXISTS counter_offers_outcome_check;
ALTER TABLE counter_offers ADD CONSTRAINT counter_offers_outcome_check
    CHECK (outcome IN ('PENDING','AUTO_ACCEPTED','ROUTED_FOR_APPROVAL','APPROVED','REJECTED'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
UPDATE counter_offers SET outcome = 'AUTO_ACCEPTED' WHERE outcome = 'APPROVED';
ALTER TABLE counter_offers DROP CONSTRAINT IF EXISTS counter_offers_outcome_check;
ALTER TABLE counter_offers ADD CONSTRAINT counter_offers_outcome_check
    CHECK (outcome IN ('PENDING','AUTO_ACCEPTED','ROUTED_FOR_APPROVAL','REJECTED'));
-- +goose StatementEnd
