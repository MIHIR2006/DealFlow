package middleware

import (
	"fmt"
	"log/slog"
	"runtime/debug"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/logger"
)

// Recovery converts a panic into a logged INTERNAL error response instead of
// killing the process. The stack goes to the log; the client sees nothing.
func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			rec := recover()
			if rec == nil {
				return
			}

			logger.From(c.Request.Context()).Error("panic recovered",
				slog.Any("panic", rec),
				slog.String("stack", string(debug.Stack())),
				slog.String("path", c.FullPath()),
			)

			status, env := apierr.Wire(apierr.Internal(fmt.Errorf("panic: %v", rec)))
			c.AbortWithStatusJSON(status, env)
		}()

		c.Next()
	}
}
