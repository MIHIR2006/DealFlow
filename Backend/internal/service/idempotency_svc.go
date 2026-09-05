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
func (i *Idempotency) Do(ctx context.Context, key, endpoint string, requestBody []byte, fn func() (int, any, error)) (int, any, error) {
	hash := hashRequest(requestBody)

	reserved, err := i.q.ReserveIdempotencyKey(ctx, sqlcgen.ReserveIdempotencyKeyParams{
		Key: key, Endpoint: endpoint, RequestHash: hash,
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return 0, nil, apierr.Internal(fmt.Errorf("reserve idempotency key: %w", err))
		}
		// Someone already holds this key: either the same request replayed
		// after it finished, still running, or the key was reused for a
		// different request body.
		existing, err := i.q.GetIdempotentResponse(ctx, sqlcgen.GetIdempotentResponseParams{
			Key: key, Endpoint: endpoint,
		})
		if err != nil {
			return 0, nil, apierr.Internal(fmt.Errorf("get idempotent response: %w", err))
		}
		if existing.RequestHash != hash {
			return 0, nil, apierr.Conflict("this idempotency key was already used for a different request")
		}
		if existing.ResponseStatus == 0 {
			return 0, nil, apierr.Conflict("a request with this idempotency key is already in progress")
		}

		var body any
		if err := json.Unmarshal([]byte(existing.ResponseBody), &body); err != nil {
			return 0, nil, apierr.Internal(fmt.Errorf("decode stored idempotent response: %w", err))
		}
		return int(existing.ResponseStatus), body, nil
	}
	_ = reserved

	status, body, err := fn()
	if err != nil {
		// The attempt failed: release the key so a genuine retry can go
		// through, rather than being told forever that it is "in progress".
		_ = i.q.ReleaseIdempotencyKey(ctx, sqlcgen.ReleaseIdempotencyKeyParams{Key: key, Endpoint: endpoint})
		return 0, nil, err
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		_ = i.q.ReleaseIdempotencyKey(ctx, sqlcgen.ReleaseIdempotencyKeyParams{Key: key, Endpoint: endpoint})
		return 0, nil, apierr.Internal(fmt.Errorf("encode idempotent response: %w", err))
	}
	if err := i.q.CompleteIdempotencyKey(ctx, sqlcgen.CompleteIdempotencyKeyParams{
		Key: key, Endpoint: endpoint, ResponseStatus: int32(status), ResponseBody: string(encoded),
	}); err != nil {
		return 0, nil, apierr.Internal(fmt.Errorf("complete idempotency key: %w", err))
	}

	return status, body, nil
}

func hashRequest(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}
