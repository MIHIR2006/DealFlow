// Package apierr defines the service's error taxonomy and the wire envelope
// the frontend depends on.
//
// The envelope shape is frozen. Adding a field is fine; renaming or removing
// one is a breaking change for the frontend team:
//
//	{"error":{"code":"VALIDATION_FAILED","message":"...","details":{...}}}
//
// This package deliberately has no HTTP framework dependency so it can be
// used from services and tested in isolation.
package apierr

import (
	"errors"
	"fmt"
	"net/http"
)

// Code is a stable, machine-readable error identifier. The frontend switches
// on these, so treat the set as public API.
type Code string

const (
	CodeUnauthenticated Code = "UNAUTHENTICATED"
	CodeForbidden       Code = "FORBIDDEN"
	CodeNotFound        Code = "NOT_FOUND"
	CodeValidation      Code = "VALIDATION_FAILED"
	CodeConflict        Code = "CONFLICT"
	CodeRateLimited     Code = "RATE_LIMITED"
	CodeInternal        Code = "INTERNAL"
)

// Error is a typed application error carrying everything needed to render a
// response, plus an optional wrapped cause that is logged but never returned.
type Error struct {
	Code    Code
	Message string
	Details map[string]any
	Status  int

	cause error
}

func (e *Error) Error() string {
	if e.cause != nil {
		return fmt.Sprintf("%s: %s: %v", e.Code, e.Message, e.cause)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

// Unwrap exposes the underlying cause to errors.Is / errors.As.
func (e *Error) Unwrap() error { return e.cause }

// WithCause attaches an internal cause. The cause is logged, never serialised.
func (e *Error) WithCause(err error) *Error {
	e.cause = err
	return e
}

// WithDetails attaches structured, client-safe context (e.g. field errors).
func (e *Error) WithDetails(d map[string]any) *Error {
	e.Details = d
	return e
}

func newErr(code Code, status int, msg string) *Error {
	return &Error{Code: code, Status: status, Message: msg}
}

// Constructors. Messages are client-facing: never leak internals through them.

func Unauthenticated(msg string) *Error {
	return newErr(CodeUnauthenticated, http.StatusUnauthorized, or(msg, "authentication required"))
}

func Forbidden(msg string) *Error {
	return newErr(CodeForbidden, http.StatusForbidden, or(msg, "you do not have access to this resource"))
}

func NotFound(msg string) *Error {
	return newErr(CodeNotFound, http.StatusNotFound, or(msg, "resource not found"))
}

func Validation(msg string) *Error {
	return newErr(CodeValidation, http.StatusUnprocessableEntity, or(msg, "request validation failed"))
}

func Conflict(msg string) *Error {
	return newErr(CodeConflict, http.StatusConflict, or(msg, "conflicting state"))
}

func RateLimited(msg string) *Error {
	return newErr(CodeRateLimited, http.StatusTooManyRequests, or(msg, "too many requests"))
}

// Internal is the fallback. Its Message is intentionally generic; the real
// detail belongs in the cause, which is logged and not returned.
func Internal(err error) *Error {
	return newErr(CodeInternal, http.StatusInternalServerError, "internal server error").WithCause(err)
}

// Envelope is the serialised form of an Error.
type Envelope struct {
	Error Body `json:"error"`
}

// Body carries the client-visible fields.
type Body struct {
	Code    Code           `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

// Wire converts any error into a response envelope and HTTP status. Unknown
// errors collapse to INTERNAL so internals are never leaked to a client.
func Wire(err error) (int, Envelope) {
	var e *Error
	if !errors.As(err, &e) {
		e = Internal(err)
	}
	return e.Status, Envelope{Body{Code: e.Code, Message: e.Message, Details: e.Details}}
}

func or(s, fallback string) string {
	if s == "" {
		return fallback
	}
	return s
}
