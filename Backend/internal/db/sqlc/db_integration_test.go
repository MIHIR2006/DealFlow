//go:build integration

package sqlcgen_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/platform/db"
)

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

func TestQueries_CreateAndGetUser(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	queries := sqlcgen.New(pool)

	// In tests, we can clean up our own data or rely on a transaction
	err := db.WithTx(ctx, pool, func(tx pgx.Tx) error {
		qtx := queries.WithTx(tx)

		email := "test_db_user@example.com"
		user, err := qtx.CreateUser(ctx, sqlcgen.CreateUserParams{
			Email:        email,
			PasswordHash: "fakehash",
			FullName:     "Test DB User",
			Role:         "REP",
			SalesTeam:    "alpha",
		})
		if err != nil {
			return err
		}
		if user.ID == 0 {
			t.Errorf("CreateUser failed to assign an ID")
		}
		if user.Email != email {
			t.Errorf("got email %q, want %q", user.Email, email)
		}

		fetched, err := qtx.GetUserByEmail(ctx, email)
		if err != nil {
			return err
		}
		if fetched.ID != user.ID {
			t.Errorf("GetUserByEmail got ID %d, want %d", fetched.ID, user.ID)
		}

		// Rollback to avoid polluting the test database
		return context.Canceled
	})
	if err != nil && err != context.Canceled {
		t.Fatalf("transaction failed: %v", err)
	}
}

func TestQueries_CreateCategory(t *testing.T) {
	pool := testPool(t)
	ctx := context.Background()
	queries := sqlcgen.New(pool)

	err := db.WithTx(ctx, pool, func(tx pgx.Tx) error {
		qtx := queries.WithTx(tx)

		catName := "Test Category"
		cat, err := qtx.CreateCategory(ctx, catName)
		if err != nil {
			return err
		}
		if cat.ID == 0 {
			t.Errorf("CreateCategory failed to assign an ID")
		}
		if cat.Name != catName {
			t.Errorf("got name %q, want %q", cat.Name, catName)
		}

		return context.Canceled
	})
	if err != nil && err != context.Canceled {
		t.Fatalf("transaction failed: %v", err)
	}
}
