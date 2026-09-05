package apierr_test

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"dealflow360/backend/internal/platform/apierr"
)

func TestWireMapsTypedErrors(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   apierr.Code
	}{
		{"unauthenticated", apierr.Unauthenticated(""), http.StatusUnauthorized, apierr.CodeUnauthenticated},
		{"forbidden", apierr.Forbidden(""), http.StatusForbidden, apierr.CodeForbidden},
		{"not found", apierr.NotFound(""), http.StatusNotFound, apierr.CodeNotFound},
		{"validation", apierr.Validation(""), http.StatusUnprocessableEntity, apierr.CodeValidation},
		{"conflict", apierr.Conflict(""), http.StatusConflict, apierr.CodeConflict},
		{"rate limited", apierr.RateLimited(""), http.StatusTooManyRequests, apierr.CodeRateLimited},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, env := apierr.Wire(tc.err)
			if status != tc.wantStatus {
				t.Errorf("status = %d, want %d", status, tc.wantStatus)
			}
			if env.Error.Code != tc.wantCode {
				t.Errorf("code = %q, want %q", env.Error.Code, tc.wantCode)
			}
			if env.Error.Message == "" {
				t.Error("message is empty; every error needs a client-facing message")
			}
		})
	}
}

func TestUnknownErrorsCollapseToInternal(t *testing.T) {
	// Untyped errors must never leak their text to a client.
	secret := errors.New("pq: password authentication failed for user \"admin\"")

	status, env := apierr.Wire(secret)
	if status != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", status)
	}
	if env.Error.Code != apierr.CodeInternal {
		t.Errorf("code = %q, want INTERNAL", env.Error.Code)
	}
	if env.Error.Message != "internal server error" {
		t.Errorf("message = %q, want the generic message (leak!)", env.Error.Message)
	}
}

func TestWireUnwrapsThroughFmtErrorf(t *testing.T) {
	base := apierr.NotFound("quotation not found")
	wrapped := fmt.Errorf("loading quotation 42: %w", base)

	status, env := apierr.Wire(wrapped)
	if status != http.StatusNotFound {
		t.Errorf("status = %d, want 404", status)
	}
	if env.Error.Code != apierr.CodeNotFound {
		t.Errorf("code = %q, want NOT_FOUND", env.Error.Code)
	}
}

func TestCauseIsLoggedButNotSerialised(t *testing.T) {
	cause := errors.New("constraint violation on stock_items")
	err := apierr.Conflict("insufficient stock").WithCause(cause)

	if !errors.Is(err, cause) {
		t.Error("errors.Is could not reach the cause; Unwrap is broken")
	}

	_, env := apierr.Wire(err)
	if env.Error.Message != "insufficient stock" {
		t.Errorf("message = %q, want the client-facing message only", env.Error.Message)
	}
}

func TestDetailsArePreserved(t *testing.T) {
	err := apierr.Validation("request validation failed").
		WithDetails(map[string]any{"discount_pct": "must be between 0 and 100"})

	_, env := apierr.Wire(err)
	if env.Error.Details["discount_pct"] == nil {
		t.Error("details were dropped; the frontend needs field-level errors")
	}
}
