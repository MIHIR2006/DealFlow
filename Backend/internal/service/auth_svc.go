// Package service holds orchestration: it composes the pure domain engines
// with the database inside transactions, and enforces authorization.
//
// Authorization lives here rather than only in HTTP middleware so that a
// route added carelessly under time pressure is still safe. Middleware
// answers "is this caller authenticated and broadly allowed on this route";
// the service answers "may this caller act on this specific record".
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
)

// AuthService handles staff signup, login, and identity lookup.
type AuthService struct {
	q      *sqlcgen.Queries
	signer *auth.Signer
}

// NewAuthService builds the service.
func NewAuthService(q *sqlcgen.Queries, signer *auth.Signer) *AuthService {
	return &AuthService{q: q, signer: signer}
}

// SignupInput is a new staff account.
type SignupInput struct {
	Email     string
	Password  string
	FullName  string
	Role      auth.Role
	SalesTeam string
}

// Session is a successful authentication.
type Session struct {
	Token     string
	ExpiresAt int64
	User      sqlcgen.User
}

// Signup creates a staff account and returns a session for it.
func (s *AuthService) Signup(ctx context.Context, in SignupInput) (Session, error) {
	email := normaliseEmail(in.Email)
	if email == "" {
		return Session{}, apierr.Validation("email is required")
	}
	if in.FullName == "" {
		return Session{}, apierr.Validation("full name is required")
	}
	if !in.Role.Valid() {
		return Session{}, apierr.Validation("role must be one of ADMIN, MANAGER, FINANCE, REP")
	}

	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		if errors.Is(err, auth.ErrWeakPassword) {
			return Session{}, apierr.Validation(
				fmt.Sprintf("password must be at least %d characters", auth.MinPasswordLength))
		}
		return Session{}, apierr.Internal(err)
	}

	team := in.SalesTeam
	if team == "" {
		team = "default"
	}

	user, err := s.q.CreateUser(ctx, sqlcgen.CreateUserParams{
		Email:        email,
		PasswordHash: hash,
		FullName:     in.FullName,
		Role:         string(in.Role),
		SalesTeam:    team,
	})
	if err != nil {
		if isUniqueViolation(err) {
			return Session{}, apierr.Conflict("an account with that email already exists")
		}
		return Session{}, apierr.Internal(fmt.Errorf("create user: %w", err))
	}

	return s.issue(user)
}

// Login authenticates a staff member.
//
// Every failure returns the same message and takes the same time, whether the
// address is unknown or the password is wrong. Distinguishing them would turn
// the login form into a list of who works here.
func (s *AuthService) Login(ctx context.Context, email, password string) (Session, error) {
	user, err := s.q.GetUserByEmail(ctx, normaliseEmail(email))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			auth.BurnPasswordTime(password)
			return Session{}, apierr.Unauthenticated("invalid email or password")
		}
		return Session{}, apierr.Internal(fmt.Errorf("lookup user: %w", err))
	}

	if err := auth.CheckPassword(user.PasswordHash, password); err != nil {
		return Session{}, apierr.Unauthenticated("invalid email or password")
	}

	return s.issue(user)
}

// Me returns the current user record.
func (s *AuthService) Me(ctx context.Context, userID int64) (sqlcgen.User, error) {
	user, err := s.q.GetUserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlcgen.User{}, apierr.NotFound("user not found")
		}
		return sqlcgen.User{}, apierr.Internal(fmt.Errorf("get user: %w", err))
	}
	if !user.IsActive {
		return sqlcgen.User{}, apierr.Forbidden("this account is disabled")
	}
	return user, nil
}

func (s *AuthService) issue(user sqlcgen.User) (Session, error) {
	principal := auth.Principal{
		UserID:    user.ID,
		Role:      auth.Role(user.Role),
		SalesTeam: user.SalesTeam,
		Email:     user.Email,
	}

	token, expiry, err := s.signer.Issue(principal)
	if err != nil {
		return Session{}, apierr.Internal(fmt.Errorf("issue token: %w", err))
	}
	return Session{Token: token, ExpiresAt: expiry.Unix(), User: user}, nil
}

func normaliseEmail(e string) string {
	return strings.ToLower(strings.TrimSpace(e))
}

// Postgres SQLSTATE codes worth distinguishing, so a caller's mistake is
// reported as a 409 or 422 rather than collapsing into a 500.
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}

func isForeignKeyViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23503")
}

func isCheckViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23514")
}
