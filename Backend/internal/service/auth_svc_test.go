//go:build integration

package service_test

import (
	"context"
	"os"
	"testing"
	"time"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/platform/db"
	"dealflow360/backend/internal/seed"
	"dealflow360/backend/internal/service"
)

const testSecret = "0123456789abcdef0123456789abcdef"

type harness struct {
	pool    *db.Pool
	queries *sqlcgen.Queries
	authSvc *service.AuthService
}

func newHarness(t *testing.T) *harness {
	t.Helper()

	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}

	pool, err := db.Open(context.Background(), config.Config{
		DatabaseURL:   url,
		DBMaxConns:    2,
		DBMinConns:    1,
		DBMaxConnLife: time.Hour,
		DBMaxConnIdle: 30 * time.Minute,
	})
	if err != nil {
		t.Fatalf("db.Open: %v", err)
	}
	t.Cleanup(pool.Close)

	// Ensure clear DB state
	if err := seed.Run(context.Background(), pool); err != nil {
		t.Fatalf("seed.Run: %v", err)
	}

	queries := sqlcgen.New(pool)
	signer := auth.NewSigner(testSecret, time.Hour)

	return &harness{
		pool:    pool,
		queries: queries,
		authSvc: service.NewAuthService(queries, signer),
	}
}

func TestAuthService_Signup(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	// In tests using seed, there's already some data. We use a fresh email.
	in := service.SignupInput{
		Email:     "new_rep@example.com",
		Password:  "password123",
		FullName:  "New Rep",
		Role:      auth.RoleRep,
		SalesTeam: "West",
	}

	session, err := h.authSvc.Signup(ctx, in)
	if err != nil {
		t.Fatalf("Signup failed: %v", err)
	}

	if session.Token == "" {
		t.Error("expected non-empty token")
	}
	if session.User.Email != "new_rep@example.com" {
		t.Errorf("got email %q, want new_rep@example.com", session.User.Email)
	}

	// Attempting to sign up with the same email should yield a conflict
	_, err = h.authSvc.Signup(ctx, in)
	if err == nil {
		t.Error("expected error on duplicate signup, got nil")
	}
}

func TestAuthService_Login(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	// The seed dataset inserts 'rep@dealflow360.test' with password 'password'
	session, err := h.authSvc.Login(ctx, "rep@dealflow360.test", seed.DemoPassword)
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if session.Token == "" {
		t.Error("expected non-empty token")
	}

	// Invalid password
	_, err = h.authSvc.Login(ctx, "rep@dealflow360.test", "wrongpassword")
	if err == nil {
		t.Error("expected error for invalid password")
	}
}

func TestAuthService_Me(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	session, err := h.authSvc.Login(ctx, "rep@dealflow360.test", seed.DemoPassword)
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}

	user, err := h.authSvc.Me(ctx, session.User.ID)
	if err != nil {
		t.Fatalf("Me failed: %v", err)
	}

	if user.Email != "rep@dealflow360.test" {
		t.Errorf("got email %q, want rep@dealflow360.test", user.Email)
	}

	_, err = h.authSvc.Me(ctx, 999999)
	if err == nil {
		t.Error("expected error for non-existent user")
	}
}
