package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WithTx runs fn inside a single transaction.
//
// Every state transition in this system is atomic by design: approving a
// quotation, reserving stock, creating the order and posting the invoice
// either all commit or all roll back. That guarantee is why this service is a
// transactional monolith rather than a set of services exchanging events.
//
// The transaction is rolled back on any error and on panic, and the panic is
// re-raised so the HTTP recovery middleware still sees it.
func WithTx(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			// Best effort: the connection may already be unusable.
			_ = tx.Rollback(context.WithoutCancel(ctx))
			panic(p)
		}
	}()

	if err := fn(tx); err != nil {
		// Use a detached context so the rollback still runs when the request
		// context was cancelled (client hung up, deadline exceeded).
		if rbErr := tx.Rollback(context.WithoutCancel(ctx)); rbErr != nil && !isTxClosed(rbErr) {
			return fmt.Errorf("%w (rollback also failed: %w)", err, rbErr)
		}
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

func isTxClosed(err error) bool {
	return err != nil && err.Error() == pgx.ErrTxClosed.Error()
}
