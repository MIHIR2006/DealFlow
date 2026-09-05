package middleware_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/transport/http/middleware"
)

const secret = "0123456789abcdef0123456789abcdef"

// fail mirrors the production Fail helper without importing the http package,
// which would create an import cycle.
func fail(c *gin.Context, err error) {
	status, env := apierr.Wire(err)
	c.AbortWithStatusJSON(status, env)
}

func tokenFor(t *testing.T, role auth.Role) string {
	t.Helper()

	tok, _, err := auth.NewSigner(secret, time.Hour).Issue(auth.Principal{
		UserID: 1, Role: role, SalesTeam: "west", Email: "x@dealflow360.test",
	})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	return tok
}

func codeOf(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()

	var env struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("not an error envelope: %v (%s)", err, w.Body)
	}
	return env.Error.Code
}

// roleRouter builds a route guarded by RequireAuth then RequireRole.
func roleRouter(allowed ...auth.Role) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	signer := auth.NewSigner(secret, time.Hour)
	r.GET("/guarded",
		middleware.RequireAuth(signer, fail),
		middleware.RequireRole(fail, allowed...),
		func(c *gin.Context) {
			p, _ := middleware.PrincipalOf(c)
			c.JSON(http.StatusOK, gin.H{"role": string(p.Role)})
		})
	return r
}

func get(r *gin.Engine, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRequireRoleAdmitsAndRejects(t *testing.T) {
	r := roleRouter(auth.RoleManager, auth.RoleFinance)

	for _, role := range []auth.Role{auth.RoleManager, auth.RoleFinance} {
		if w := get(r, "/guarded", tokenFor(t, role)); w.Code != http.StatusOK {
			t.Errorf("%s = %d, want 200", role, w.Code)
		}
	}

	for _, role := range []auth.Role{auth.RoleRep, auth.RoleAdmin} {
		w := get(r, "/guarded", tokenFor(t, role))
		if w.Code != http.StatusForbidden {
			t.Errorf("%s = %d, want 403", role, w.Code)
		}
		if got := codeOf(t, w); got != "FORBIDDEN" {
			t.Errorf("%s code = %q, want FORBIDDEN", role, got)
		}
	}
}

// A rejected request must not reach the handler at all. Aborting after the
// handler has run would mean the side effect already happened.
func TestRejectedRequestNeverReachesTheHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()

	var reached bool
	r.GET("/guarded",
		middleware.RequireAuth(auth.NewSigner(secret, time.Hour), fail),
		middleware.RequireRole(fail, auth.RoleAdmin),
		func(c *gin.Context) {
			reached = true
			c.Status(http.StatusOK)
		})

	if w := get(r, "/guarded", tokenFor(t, auth.RoleRep)); w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", w.Code)
	}
	if reached {
		t.Error("the handler ran despite the 403; the guard aborted too late")
	}
}

func TestRequireAuthRejectsMalformedHeaders(t *testing.T) {
	r := roleRouter(auth.RoleRep)

	for name, header := range map[string]string{
		"missing":      "",
		"no scheme":    "abc.def.ghi",
		"wrong scheme": "Basic abc",
		"empty bearer": "Bearer ",
		"garbage":      "Bearer not-a-jwt",
	} {
		t.Run(name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/guarded", nil)
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want 401", w.Code)
			}
		})
	}
}

func TestBearerSchemeIsCaseInsensitive(t *testing.T) {
	r := roleRouter(auth.RoleRep)

	req := httptest.NewRequest(http.MethodGet, "/guarded", nil)
	req.Header.Set("Authorization", "bearer "+tokenFor(t, auth.RoleRep))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("lowercase scheme = %d, want 200", w.Code)
	}
}

func TestRateLimitAllowsBurstThenThrottles(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/limited",
		middleware.RateLimit(60, 3, fail),
		func(c *gin.Context) { c.Status(http.StatusOK) })

	// The burst is spent first.
	for i := 0; i < 3; i++ {
		if w := get(r, "/limited", ""); w.Code != http.StatusOK {
			t.Fatalf("request %d = %d, want 200 within the burst", i+1, w.Code)
		}
	}

	w := get(r, "/limited", "")
	if w.Code != http.StatusTooManyRequests {
		t.Errorf("request past the burst = %d, want 429", w.Code)
	}
	if got := codeOf(t, w); got != "RATE_LIMITED" {
		t.Errorf("code = %q, want RATE_LIMITED", got)
	}
}

func TestRateLimitIsSafeUnderConcurrency(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/limited",
		middleware.RateLimit(6000, 500, fail),
		func(c *gin.Context) { c.Status(http.StatusOK) })

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			get(r, "/limited", "")
		}()
	}
	wg.Wait() // the race detector is the assertion here
}

func TestDBStatsHeadersAppearOnEveryResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.DBStats(true))
	r.GET("/x", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	w := get(r, "/x", "")
	if got := w.Header().Get(middleware.HeaderDBQueries); got != "0" {
		t.Errorf("%s = %q, want 0 for a handler that touched no database",
			middleware.HeaderDBQueries, got)
	}
	if w.Header().Get(middleware.HeaderDBTime) == "" {
		t.Errorf("%s is missing", middleware.HeaderDBTime)
	}
	if w.Header().Get("Server-Timing") == "" {
		t.Error("Server-Timing is missing")
	}
}

func TestDBStatsCanBeDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.DBStats(false))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	if got := get(r, "/x", "").Header().Get(middleware.HeaderDBQueries); got != "" {
		t.Errorf("%s = %q when disabled, want absent", middleware.HeaderDBQueries, got)
	}
}
