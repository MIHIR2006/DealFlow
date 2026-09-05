//go:build integration

package db_test

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/platform/db"
)

// These tests need a real Postgres. Run them with:
//
//	TEST_DATABASE_URL=postgres://... go test -tags=integration ./internal/platform/db/
func testPool(t *testing.T) *db.Pool {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}

	pool, err := db.Open(context.Background(), config.Config{
		DatabaseURL:   url,
		DBMaxConns:    4,
		DBMinConns:    1,
		DBMaxConnLife: time.Hour,
		DBMaxConnIdle: 30 * time.Minute,
	})
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// The whole money story rests on this: NUMERIC must reach Go as an exact
// decimal, with no float64 anywhere in the path. If this test ever fails,
// every total in the system is suspect.
func TestNumericRoundTripsExactly(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	for _, want := range []string{
		"0.00",
		"1234.56",
		"99999999999.99", // near the NUMERIC(14,2) ceiling
		"0.01",
		"12.345", // percentage scale
		"0.1",    // has no exact float64 representation
	} {
		t.Run(want, func(t *testing.T) {
			var got decimal.Decimal
			err := pool.QueryRow(ctx, "SELECT $1::numeric", decimal.RequireFromString(want)).Scan(&got)
			if err != nil {
				t.Fatalf("round trip: %v", err)
			}
			if !got.Equal(decimal.RequireFromString(want)) {
				t.Errorf("got %s, want %s — precision was lost", got, want)
			}
		})
	}
}

func TestNumericSumIsExact(t *testing.T) {
	pool := testPool(t)

	// 0.1 + 0.2 is the canonical float64 failure. In NUMERIC it is exact.
	var got decimal.Decimal
	err := pool.QueryRow(context.Background(),
		"SELECT ($1::numeric + $2::numeric)",
		decimal.RequireFromString("0.1"), decimal.RequireFromString("0.2"),
	).Scan(&got)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if !got.Equal(decimal.RequireFromString("0.3")) {
		t.Errorf("0.1 + 0.2 = %s, want exactly 0.3", got)
	}
}

func TestReadyReportsHealth(t *testing.T) {
	pool := testPool(t)

	if err := db.Ready(pool)(context.Background()); err != nil {
		t.Errorf("Ready() = %v, want nil for a live pool", err)
	}
}

func TestWithTxCommits(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	mustExec(t, pool, `CREATE TEMP TABLE IF NOT EXISTS tx_probe (n int)`)

	err := db.WithTx(ctx, pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO tx_probe (n) VALUES (1)`)
		return err
	})
	if err != nil {
		t.Fatalf("WithTx: %v", err)
	}
}

func TestWithTxRollsBackOnError(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	// A dedicated connection so the temp table survives across the calls.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, `CREATE TEMP TABLE rb_probe (n int)`); err != nil {
		t.Fatalf("create temp table: %v", err)
	}

	sentinel := errors.New("business rule violated")
	txErr := db.WithTx(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `CREATE TEMP TABLE rb_inner (n int)`); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO rb_inner (n) VALUES (1)`); err != nil {
			return err
		}
		return sentinel
	})

	if !errors.Is(txErr, sentinel) {
		t.Fatalf("WithTx returned %v, want the caller's error unwrapped", txErr)
	}

	// The inner temp table must not survive the rollback.
	var exists bool
	err = pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'rb_inner')`).Scan(&exists)
	if err != nil {
		t.Fatalf("check rollback: %v", err)
	}
	if exists {
		t.Error("rb_inner survived; the transaction was not rolled back")
	}
}

func TestWithTxRollsBackOnPanicAndRepanics(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()

	defer func() {
		if recover() == nil {
			t.Error("panic was swallowed; the HTTP recovery middleware would never see it")
		}
	}()

	_ = db.WithTx(ctx, pool, func(pgx.Tx) error {
		panic("boom")
	})
}

func mustExec(t *testing.T, pool *db.Pool, sql string) {
	t.Helper()
	if _, err := pool.Exec(context.Background(), sql); err != nil {
		t.Fatalf("exec %q: %v", sql, err)
	}
}
