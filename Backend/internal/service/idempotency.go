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

// Idempotency makes money-moving endpoints safe to retry.
//
// A client that times out cannot tell whether its payment landed. Without a
// key it either retries and risks charging twice, or does not retry and risks
// losing the payment. With one, retrying is always the right move.
//
// The key is reserved before the work runs rather than recorded after it.
// Recording afterwards leaves a window in which two concurrent replays both
// execute and only the second discovers the first.
type Idempotency struct {
	q *sqlcgen.Queries
}

// NewIdempotency builds the helper.
func NewIdempotency(q *sqlcgen.Queries) *Idempotency {
	return &Idempotency{q: q}
}

// Replay is a stored response being served again.
type Replay struct {
	Status int
	Body   []byte
}

// statusInProgress marks a reserved but unfinished key.
const statusInProgress = 0

// Begin claims a key for this request.
//
// It returns a Replay when the same request already completed, in which case
// the caller returns that response and does no work. It returns a conflict
// when the key is reserved but unfinished, and a validation error when the
// key was reused with a different body -- that is a client bug, and silently
// replaying someone else's response would hide it.
func (i *Idempotency) Begin(ctx context.Context, key, endpoint string, payload any) (*Replay, error) {
	if key == "" {
		return nil, nil // not an idempotent request
	}

	hash, err := hashPayload(payload)
	if err != nil {
		return nil, apierr.Internal(err)
	}

	_, err = i.q.ReserveIdempotencyKey(ctx, sqlcgen.ReserveIdempotencyKeyParams{
		Key: key, Endpoint: endpoint, RequestHash: hash,
	})
	if err == nil {
		return nil, nil // reserved; the caller owns this key and should proceed
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, apierr.Internal(fmt.Errorf("reserve idempotency key: %w", err))
	}

	existing, err := i.q.GetIdempotentResponse(ctx, sqlcgen.GetIdempotentResponseParams{
		Key: key, Endpoint: endpoint,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Released between the failed insert and this read; the caller
			// may simply try again.
			return nil, apierr.Conflict("a request with this Idempotency-Key is in flight; retry shortly")
		}
		return nil, apierr.Internal(fmt.Errorf("read idempotency key: %w", err))
	}

	if existing.RequestHash != hash {
		return nil, apierr.Validation(
			"this Idempotency-Key was already used with a different request body")
	}
	if existing.ResponseStatus == statusInProgress {
		return nil, apierr.Conflict("a request with this Idempotency-Key is in flight; retry shortly")
	}

	return &Replay{Status: int(existing.ResponseStatus), Body: []byte(existing.ResponseBody)}, nil
}

// Complete stores the response so a later retry replays it.
func (i *Idempotency) Complete(ctx context.Context, key, endpoint string, status int, body any) {
	if key == "" {
		return
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		encoded = []byte("{}")
	}

	// Recording the outcome is best effort: a failure here would at worst
	// let a retry do the work again, whereas failing the request would
	// discard work that already succeeded.
	_ = i.q.CompleteIdempotencyKey(ctx, sqlcgen.CompleteIdempotencyKeyParams{
		Key: key, Endpoint: endpoint,
		ResponseStatus: int32(status), //nolint:gosec // HTTP status codes are small
		ResponseBody:   string(encoded),
	})
}

// Abort releases a reservation whose work failed, so the client can retry
// rather than being told forever that a request is in flight.
func (i *Idempotency) Abort(ctx context.Context, key, endpoint string) {
	if key == "" {
		return
	}
	_ = i.q.ReleaseIdempotencyKey(ctx, sqlcgen.ReleaseIdempotencyKeyParams{
		Key: key, Endpoint: endpoint,
	})
}

// hashPayload fingerprints a request body so a reused key with different
// contents can be spotted.
func hashPayload(payload any) (string, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("hash request payload: %w", err)
	}
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:]), nil
}
