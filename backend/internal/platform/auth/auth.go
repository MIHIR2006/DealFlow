// Package auth issues and verifies credentials for both audiences the system
// serves: internal staff, who get a JWT, and portal customers, who get an
// opaque single-quotation token.
//
// The two are deliberately different mechanisms. A staff JWT carries identity
// and role and is presented on every internal route. A portal token carries
// no claims at all — it is a random string that names one quotation in the
// database. That asymmetry is what makes it impossible for a customer token
// to be mistaken for a staff credential, or to reach a second quotation.
package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Role is a staff member's permission level.
type Role string

const (
	RoleAdmin   Role = "ADMIN"
	RoleManager Role = "MANAGER"
	RoleFinance Role = "FINANCE"
	RoleRep     Role = "REP"
)

// Valid reports whether r is a role this system recognises.
func (r Role) Valid() bool {
	switch r {
	case RoleAdmin, RoleManager, RoleFinance, RoleRep:
		return true
	default:
		return false
	}
}

// Is reports whether r matches any of the given roles.
func (r Role) Is(roles ...Role) bool {
	for _, want := range roles {
		if r == want {
			return true
		}
	}
	return false
}

// CanApproveAs reports whether this role may act on an approval step that
// requires the given role.
//
// Admin can act at any step so a demo, or a real escalation, is never blocked
// by an absent approver. Nothing else crosses: a manager cannot sign off the
// finance step, which is the whole point of a two-level chain.
func (r Role) CanApproveAs(required Role) bool {
	if r == RoleAdmin {
		return true
	}
	return r == required
}

// Principal is the authenticated staff actor for the current request.
type Principal struct {
	UserID    int64
	Role      Role
	SalesTeam string
	Email     string
}

// Errors returned by this package. Callers map these to API errors; the
// package itself has no HTTP dependency.
var (
	ErrInvalidToken   = errors.New("auth: invalid or expired token")
	ErrWeakPassword   = errors.New("auth: password must be at least 8 characters")
	ErrInvalidRole    = errors.New("auth: unknown role")
	ErrBadCredentials = errors.New("auth: invalid credentials")
)

// MinPasswordLength is the shortest password accepted at signup.
const MinPasswordLength = 8

// HashPassword returns a bcrypt hash suitable for storage.
func HashPassword(plain string) (string, error) {
	if len(plain) < MinPasswordLength {
		return "", ErrWeakPassword
	}
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(h), nil
}

// CheckPassword verifies a plaintext password against a stored hash.
func CheckPassword(hash, plain string) error {
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)); err != nil {
		return ErrBadCredentials
	}
	return nil
}

// DummyHash is a valid bcrypt hash of an unguessable value.
//
// Login compares against it when no user matches, so a request for an unknown
// address costs the same time as one for a known address. Without this, the
// response time alone tells an attacker which emails are registered.
var DummyHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

// BurnPasswordTime performs a throwaway comparison to keep login timing flat.
func BurnPasswordTime(plain string) {
	_ = bcrypt.CompareHashAndPassword([]byte(DummyHash), []byte(plain))
}

// Claims is the JWT payload for a staff session.
type Claims struct {
	Role      Role   `json:"role"`
	SalesTeam string `json:"team"`
	Email     string `json:"email"`
	jwt.RegisteredClaims
}

// Signer issues and verifies staff session tokens.
type Signer struct {
	secret []byte
	ttl    time.Duration
}

// NewSigner builds a signer. The secret is validated at config load, so an
// empty or short secret never reaches here.
func NewSigner(secret string, ttl time.Duration) *Signer {
	return &Signer{secret: []byte(secret), ttl: ttl}
}

// Issue mints a token for a staff principal.
func (s *Signer) Issue(p Principal) (string, time.Time, error) {
	if !p.Role.Valid() {
		return "", time.Time{}, ErrInvalidRole
	}

	now := time.Now()
	expiry := now.Add(s.ttl)

	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		Role:      p.Role,
		SalesTeam: p.SalesTeam,
		Email:     p.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(p.UserID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiry),
			Issuer:    "dealflow360",
		},
	})

	signed, err := tok.SignedString(s.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, expiry, nil
}

// Verify parses and validates a token, returning the principal it names.
//
// The signing method is pinned to HS256. Without that check a token with
// "alg": "none" would be accepted as valid, which is the classic JWT forgery.
func (s *Signer) Verify(raw string) (Principal, error) {
	claims := &Claims{}

	tok, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}
		return s.secret, nil
	}, jwt.WithIssuer("dealflow360"), jwt.WithValidMethods([]string{"HS256"}))

	if err != nil || !tok.Valid {
		return Principal{}, ErrInvalidToken
	}

	userID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil {
		return Principal{}, ErrInvalidToken
	}
	if !claims.Role.Valid() {
		return Principal{}, ErrInvalidToken
	}

	return Principal{
		UserID:    userID,
		Role:      claims.Role,
		SalesTeam: claims.SalesTeam,
		Email:     claims.Email,
	}, nil
}

// PortalTokenBytes is the entropy of a customer portal token. 32 bytes is far
// beyond guessing, which matters because the token is the only credential
// protecting a quotation.
const PortalTokenBytes = 32

// NewPortalToken returns a URL-safe random token for a single quotation.
func NewPortalToken() (string, error) {
	b := make([]byte, PortalTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate portal token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
