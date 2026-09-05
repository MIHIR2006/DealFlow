// Package http wires the Gin router, middleware, and response helpers.
package http

import (
	"log/slog"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/logger"
)

// OK writes a successful JSON response.
func OK(c *gin.Context, status int, body any) {
	c.JSON(status, body)
}

// Page is the envelope for every list endpoint. Pagination is mandatory from
// day one: retrofitting it later is how demos fall over on seeded data.
type Page[T any] struct {
	Data       []T    `json:"data"`
	NextCursor string `json:"next_cursor,omitempty"`
}

// Fail renders an error using the frozen envelope and logs the internal cause.
// Handlers should return early after calling it.
func Fail(c *gin.Context, err error) {
	status, env := apierr.Wire(err)

	if status >= 500 {
		logger.From(c.Request.Context()).Error("request failed",
			slog.String("code", string(env.Error.Code)),
			slog.String("cause", err.Error()),
		)
	}

	_ = c.Error(err) //nolint:errcheck // recorded for the access log only
	c.AbortWithStatusJSON(status, env)
}
