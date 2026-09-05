package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
)

const ctxPrincipal = "principal"

// Authenticate verifies the request's bearer token and records the principal
// on the context. It does NOT advance the handler chain.
//
// Middleware in Gin advances the chain by calling c.Next(), so one middleware
// cannot be composed by invoking another as a plain function: the inner
// c.Next() would run the route handler before the outer guard had decided
// anything. Any guard that needs to authenticate as part of a larger decision
// calls this instead.
func Authenticate(signer *auth.Signer, c *gin.Context) (auth.Principal, error) {
	raw, ok := bearerToken(c.GetHeader("Authorization"))
	if !ok {
		return auth.Principal{}, apierr.Unauthenticated("a bearer token is required")
	}

	principal, err := signer.Verify(raw)
	if err != nil {
		return auth.Principal{}, apierr.Unauthenticated("invalid or expired token")
	}

	c.Set(ctxPrincipal, principal)
	return principal, nil
}

// RequireAuth rejects requests without a valid staff token and attaches the
// principal for downstream handlers and services.
func RequireAuth(signer *auth.Signer, fail func(*gin.Context, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, err := Authenticate(signer, c); err != nil {
			fail(c, err)
			return
		}
		c.Next()
	}
}

// RequireRole allows the request only for the listed roles.
//
// This is a coarse gate on the route. Whether the caller may act on a
// particular record is decided in the service layer, so a route added without
// the right guard is still not a data leak.
func RequireRole(fail func(*gin.Context, error), roles ...auth.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		p, ok := PrincipalOf(c)
		if !ok {
			fail(c, apierr.Unauthenticated("a bearer token is required"))
			return
		}
		if !p.Role.Is(roles...) {
			fail(c, apierr.Forbidden("your role does not permit this action"))
			return
		}
		c.Next()
	}
}

// PrincipalOf returns the authenticated staff actor for this request.
func PrincipalOf(c *gin.Context) (auth.Principal, bool) {
	v, ok := c.Get(ctxPrincipal)
	if !ok {
		return auth.Principal{}, false
	}
	p, ok := v.(auth.Principal)
	return p, ok
}

func bearerToken(header string) (string, bool) {
	const prefix = "Bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", false
	}
	tok := strings.TrimSpace(header[len(prefix):])
	return tok, tok != ""
}
