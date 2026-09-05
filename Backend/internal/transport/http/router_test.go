package http_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/config"
	apihttp "dealflow360/backend/internal/transport/http"
	"dealflow360/backend/internal/transport/http/middleware"
)

func newTestRouter(t *testing.T, ready apihttp.ReadinessFunc) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	return apihttp.NewRouter(apihttp.Deps{
		Config: config.Config{
			Env:         config.EnvTest,
			CORSOrigins: []string{"http://localhost:3000"},
		},
		Log:   slog.New(slog.NewJSONHandler(io.Discard, nil)),
		Ready: ready,
	})
}

func do(r *gin.Engine, method, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(method, path, nil))
	return w
}

func TestHealthzIsAlwaysOK(t *testing.T) {
	// Liveness must not depend on the database, or a DB blip gets a healthy
	// pod killed by the orchestrator.
	r := newTestRouter(t, func(context.Context) error { return errors.New("db down") })

	if got := do(r, http.MethodGet, "/healthz").Code; got != http.StatusOK {
		t.Errorf("GET /healthz = %d, want 200", got)
	}
}

func TestReadyzReflectsDependencies(t *testing.T) {
	ok := newTestRouter(t, func(context.Context) error { return nil })
	if got := do(ok, http.MethodGet, "/readyz").Code; got != http.StatusOK {
		t.Errorf("GET /readyz (healthy) = %d, want 200", got)
	}

	bad := newTestRouter(t, func(context.Context) error { return errors.New("db down") })
	if got := do(bad, http.MethodGet, "/readyz").Code; got != http.StatusServiceUnavailable {
		t.Errorf("GET /readyz (unhealthy) = %d, want 503", got)
	}
}

func TestRequestIDHeaderAlwaysSet(t *testing.T) {
	r := newTestRouter(t, nil)

	got := do(r, http.MethodGet, "/healthz").Header().Get(middleware.HeaderRequestID)
	if got == "" {
		t.Fatalf("%s header is empty, want a generated id", middleware.HeaderRequestID)
	}
}

func TestRequestIDIsPreservedFromCaller(t *testing.T) {
	r := newTestRouter(t, nil)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set(middleware.HeaderRequestID, "trace-me")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if got := w.Header().Get(middleware.HeaderRequestID); got != "trace-me" {
		t.Errorf("request id = %q, want the caller's %q", got, "trace-me")
	}
}

func TestUnknownRouteUsesTheErrorEnvelope(t *testing.T) {
	// The frontend switches on error.code, so this shape is public API.
	r := newTestRouter(t, nil)

	w := do(r, http.MethodGet, "/api/v1/does-not-exist")
	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", w.Code)
	}

	var env struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("response is not the error envelope: %v (body=%s)", err, w.Body)
	}
	if env.Error.Code != "NOT_FOUND" {
		t.Errorf("error.code = %q, want NOT_FOUND", env.Error.Code)
	}
	if env.Error.Message == "" {
		t.Error("error.message is empty")
	}
}

func TestPanicBecomesInternalErrorNotACrash(t *testing.T) {
	r := newTestRouter(t, func(context.Context) error { panic("boom") })

	w := do(r, http.MethodGet, "/readyz")
	if w.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", w.Code)
	}

	var env struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("response is not the error envelope: %v", err)
	}
	if env.Error.Code != "INTERNAL" {
		t.Errorf("error.code = %q, want INTERNAL", env.Error.Code)
	}
}
