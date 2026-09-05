-- The portal resolves everything from the token. No portal query accepts a
-- quotation id, so a token for one quotation cannot reach another: the
-- isolation is structural, not a check that could be forgotten.

-- name: GetQuotationByPortalToken :one
SELECT
    q.*,
    c.name  AS customer_name,
    c.email AS customer_email,
    c.tier  AS customer_tier,
    pt.id   AS token_id,
    pt.expires_at,
    pt.used_at
FROM portal_tokens pt
JOIN quotations q ON q.id = pt.quotation_id
JOIN customers  c ON c.id = pt.customer_id
WHERE pt.token = $1
  AND pt.revoked_at IS NULL
  AND pt.expires_at > now();

-- name: CreatePortalToken :one
INSERT INTO portal_tokens (token, quotation_id, customer_id, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: MarkPortalTokenUsed :exec
UPDATE portal_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL;

-- name: RevokePortalTokensForQuotation :execrows
UPDATE portal_tokens SET revoked_at = now()
WHERE quotation_id = $1 AND revoked_at IS NULL;

-- name: ListNegotiationMessages :many
SELECT * FROM negotiation_messages
WHERE quotation_id = $1
ORDER BY created_at, id;

-- name: CreateNegotiationMessage :one
INSERT INTO negotiation_messages
    (quotation_id, quotation_line_id, author_type, author_id, author_label, body)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateCounterOffer :one
INSERT INTO counter_offers
    (quotation_id, quotation_line_id, previous_discount_pct, proposed_discount_pct, note)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: SetCounterOfferOutcome :one
UPDATE counter_offers SET outcome = $2 WHERE id = $1 RETURNING *;

-- name: ListCounterOffers :many
SELECT co.*, ql.product_id
FROM counter_offers co
LEFT JOIN quotation_lines ql ON ql.id = co.quotation_line_id
WHERE co.quotation_id = $1
ORDER BY co.created_at DESC, co.id DESC;

-- Close out every counter-offer still awaiting a decision on this quotation.
-- Called when an approval round ends, so the customer's negotiation history
-- shows the answer rather than sitting on "sent for approval" forever.
-- name: ResolveRoutedCounterOffers :many
UPDATE counter_offers
SET outcome = $2
WHERE quotation_id = $1 AND outcome = 'ROUTED_FOR_APPROVAL'
RETURNING *;

-- The negotiation thread as staff see it. Same rows the customer's portal
-- reads; the staff side needs them to answer, and to see what was proposed.
-- name: ListNegotiationMessagesForStaff :many
SELECT m.*, l.product_id, p.name AS product_name
FROM negotiation_messages m
LEFT JOIN quotation_lines l ON l.id = m.quotation_line_id
LEFT JOIN products p ON p.id = l.product_id
WHERE m.quotation_id = $1
ORDER BY m.created_at;
