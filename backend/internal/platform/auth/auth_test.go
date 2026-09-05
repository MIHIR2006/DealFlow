package auth_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"dealflow360/backend/internal/platform/auth"
)

const secret = "0123456789abcdef0123456789abcdef"

func principal() auth.Principal {
	return auth.Principal{
		UserID: 42, Role: auth.RoleManager,
		SalesTeam: "west", Email: "m.shah@dealflow360.test",
	}
}

func TestIssueAndVerifyRoundTrip(t *testing.T) {
	s := auth.NewSigner(secret, time.Hour)

	token, expiry, err := s.Issue(principal())
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if !expiry.After(time.Now()) {
		t.Errorf("expiry %v is not in the future", expiry)
	}

	got, err := s.Verify(token)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if got != principal() {
		t.Errorf("Verify = %+v, want %+v", got, principal())
	}
}

func TestVerifyRejectsAForeignSecret(t *testing.T) {
	token, _, err := auth.NewSigner(secret, time.Hour).Issue(principal())
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	other := auth.NewSigner("ffffffffffffffffffffffffffffffff", time.Hour)
	if _, err := other.Verify(token); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("Verify with a different secret = %v, want ErrInvalidToken", err)
	}
}

// A token signed with "alg": "none" must be rejected. Accepting it is the
// classic JWT forgery: anyone could mint themselves an ADMIN session.
func TestVerifyRejectsAlgNone(t *testing.T) {
	forged := jwt.NewWithClaims(jwt.SigningMethodNone, auth.Claims{
		Role: auth.RoleAdmin,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "1",
			Issuer:    "dealflow360",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	raw, err := forged.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("build forged token: %v", err)
	}

	if _, err := auth.NewSigner(secret, time.Hour).Verify(raw); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("Verify of an alg=none token = %v, want ErrInvalidToken", err)
	}
}

func TestVerifyRejectsExpiredToken(t *testing.T) {
	s := auth.NewSigner(secret, -time.Minute) // already expired when issued

	token, _, err := s.Issue(principal())
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := s.Verify(token); !errors.Is(err, auth.ErrInvalidToken) {
		t.Errorf("Verify of an expired token = %v, want ErrInvalidToken", err)
	}
}

func TestVerifyRejectsGarbage(t *testing.T) {
	s := auth.NewSigner(secret, time.Hour)

	for _, raw := range []string{"", "not-a-token", "a.b.c", strings.Repeat("x", 500)} {
		if _, err := s.Verify(raw); !errors.Is(err, auth.ErrInvalidToken) {
			t.Errorf("Verify(%q) = %v, want ErrInvalidToken", raw, err)
		}
	}
}

func TestIssueRejectsUnknownRole(t *testing.T) {
	p := principal()
	p.Role = auth.Role("SUPERUSER")

	if _, _, err := auth.NewSigner(secret, time.Hour).Issue(p); !errors.Is(err, auth.ErrInvalidRole) {
		t.Errorf("Issue with an unknown role = %v, want ErrInvalidRole", err)
	}
}

func TestPasswordHashAndCheck(t *testing.T) {
	hash, err := auth.HashPassword("correct horse battery")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if strings.Contains(hash, "correct horse") {
		t.Fatal("the hash contains the plaintext")
	}
	if err := auth.CheckPassword(hash, "correct horse battery"); err != nil {
		t.Errorf("CheckPassword with the right password = %v, want nil", err)
	}
	if err := auth.CheckPassword(hash, "wrong password"); !errors.Is(err, auth.ErrBadCredentials) {
		t.Errorf("CheckPassword with the wrong password = %v, want ErrBadCredentials", err)
	}
}

func TestShortPasswordRejected(t *testing.T) {
	if _, err := auth.HashPassword("short"); !errors.Is(err, auth.ErrWeakPassword) {
		t.Errorf("HashPassword(short) = %v, want ErrWeakPassword", err)
	}
}

func TestDummyHashIsUsableForTimingDefence(t *testing.T) {
	// If the constant were malformed, bcrypt would return early and the
	// timing defence in login would be a no-op.
	if err := auth.CheckPassword(auth.DummyHash, "anything"); !errors.Is(err, auth.ErrBadCredentials) {
		t.Errorf("DummyHash comparison = %v, want a normal mismatch", err)
	}
}

func TestRoleValidity(t *testing.T) {
	for _, r := range []auth.Role{auth.RoleAdmin, auth.RoleManager, auth.RoleFinance, auth.RoleRep} {
		if !r.Valid() {
			t.Errorf("%s.Valid() = false", r)
		}
	}
	for _, r := range []auth.Role{"", "SUPERUSER", "admin"} {
		if r.Valid() {
			t.Errorf("%q.Valid() = true, want false", r)
		}
	}
}

// A manager must not be able to sign the finance step. If they could, the
// two-level chain would be one level wearing a hat.
func TestApprovalRolesDoNotCross(t *testing.T) {
	cases := []struct {
		actor, required auth.Role
		want            bool
	}{
		{auth.RoleManager, auth.RoleManager, true},
		{auth.RoleFinance, auth.RoleFinance, true},
		{auth.RoleManager, auth.RoleFinance, false},
		{auth.RoleFinance, auth.RoleManager, false},
		{auth.RoleRep, auth.RoleManager, false},
		{auth.RoleRep, auth.RoleFinance, false},
		// Admin can act at any step so an absent approver never blocks a deal.
		{auth.RoleAdmin, auth.RoleManager, true},
		{auth.RoleAdmin, auth.RoleFinance, true},
	}

	for _, tc := range cases {
		if got := tc.actor.CanApproveAs(tc.required); got != tc.want {
			t.Errorf("%s.CanApproveAs(%s) = %v, want %v", tc.actor, tc.required, got, tc.want)
		}
	}
}

func TestRoleIs(t *testing.T) {
	if !auth.RoleFinance.Is(auth.RoleManager, auth.RoleFinance) {
		t.Error("Finance.Is(Manager, Finance) = false")
	}
	if auth.RoleRep.Is(auth.RoleManager, auth.RoleFinance) {
		t.Error("Rep.Is(Manager, Finance) = true, want false")
	}
}

func TestPortalTokensAreLongAndUnique(t *testing.T) {
	seen := make(map[string]bool, 1000)

	for i := 0; i < 1000; i++ {
		tok, err := auth.NewPortalToken()
		if err != nil {
			t.Fatalf("NewPortalToken: %v", err)
		}
		// 32 bytes base64url with no padding is 43 characters.
		if len(tok) < 40 {
			t.Fatalf("token %q is only %d characters; it is the only credential on a quotation", tok, len(tok))
		}
		if seen[tok] {
			t.Fatalf("duplicate token generated: %q", tok)
		}
		seen[tok] = true
	}
}
