package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
)

// Idempotency guards money-moving endpoints against a retried request
// executing the underlying work twice.
//
// A key is reserved before the work runs, so a second request arriving while
// the first is still in flight is rejected rather than racing it. Once the
// work finishes, the response is stored against the key: a later replay with
// the same key and body returns that stored response without re-running
// anything. A replay with the same key but a different body is refused,
// since silently answering it would honour a request that was never made.
type Idempotency struct {
	q *sqlcgen.Queries
}

// NewIdempotency builds the guard.
func NewIdempotency(q *sqlcgen.Queries) *Idempotency {
	return &Idempotency{q: q}
}

// Do runs fn under the protection of key, scoped to endpoint. fn returns the
// HTTP status and response body to record on success.
//
// On a fresh run, body carries the result for the caller to encode itself
// and raw is nil. On a replay, body is nil and raw carries the exact bytes
// stored from the original response — replayed verbatim rather than decoded
// and re-encoded, so a byte-for-byte retry gets a byte-for-byte identical
// response (map re-encoding would otherwise reorder fields alphabetically).
// replayed reports which case applies.
func (i *Idempotency) Do(ctx context.Context, key, endpoint string, requestBody []byte, fn func() (int, any, error)) (status int, body any, raw []byte, replayed bool, err error) {
	hash := hashRequest(requestBody)

	reserved, err := i.q.ReserveIdempotencyKey(ctx, sqlcgen.ReserveIdempotencyKeyParams{
		Key: key, Endpoint: endpoint, RequestHash: hash,
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return 0, nil, nil, false, apierr.Internal(fmt.Errorf("reserve idempotency key: %w", err))
		}
		// Someone already holds this key: either the same request replayed
		// after it finished, still running, or the key was reused for a
		// different request body.
		existing, err := i.q.GetIdempotentResponse(ctx, sqlcgen.GetIdempotentResponseParams{
			Key: key, Endpoint: endpoint,
		})
		if err != nil {
			return 0, nil, nil, false, apierr.Internal(fmt.Errorf("get idempotent response: %w", err))
		}
		if existing.RequestHash != hash {
			return 0, nil, nil, false, apierr.Validation("this idempotency key was already used for a different request")
		}
		if existing.ResponseStatus == 0 {
			return 0, nil, nil, false, apierr.Conflict("a request with this idempotency key is already in progress")
		}

		return int(existing.ResponseStatus), nil, []byte(existing.ResponseBody), true, nil
	}
	_ = reserved

	respStatus, respBody, err := fn()
	if err != nil {
		// The attempt failed: release the key so a genuine retry can go
		// through, rather than being told forever that it is "in progress".
		_ = i.q.ReleaseIdempotencyKey(ctx, sqlcgen.ReleaseIdempotencyKeyParams{Key: key, Endpoint: endpoint})
		return 0, nil, nil, false, err
	}

	encoded, err := json.Marshal(respBody)
	if err != nil {
		_ = i.q.ReleaseIdempotencyKey(ctx, sqlcgen.ReleaseIdempotencyKeyParams{Key: key, Endpoint: endpoint})
		return 0, nil, nil, false, apierr.Internal(fmt.Errorf("encode idempotent response: %w", err))
	}
	if err := i.q.CompleteIdempotencyKey(ctx, sqlcgen.CompleteIdempotencyKeyParams{
		Key: key, Endpoint: endpoint, ResponseStatus: int32(respStatus), ResponseBody: string(encoded), //nolint:gosec // an HTTP status code is always in [100,599]
	}); err != nil {
		return 0, nil, nil, false, apierr.Internal(fmt.Errorf("complete idempotency key: %w", err))
	}

	return respStatus, respBody, nil, false, nil
}

func hashRequest(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}
