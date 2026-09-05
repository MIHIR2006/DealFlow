package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/logger"
)

// Logging attaches a request-scoped logger to the context and emits one
// structured line per request. Health probes are logged at debug so they do
// not drown the signal.
func Logging(base *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		log := base.With(
			slog.String("request_id", RequestIDOf(c)),
			slog.String("method", c.Request.Method),
			slog.String("path", c.Request.URL.Path),
		)
		c.Request = c.Request.WithContext(logger.Into(c.Request.Context(), log))

		c.Next()

		attrs := []any{
			slog.Int("status", c.Writer.Status()),
			slog.Int64("duration_ms", time.Since(start).Milliseconds()),
			slog.Int("bytes", c.Writer.Size()),
		}
		if len(c.Errors) > 0 {
			attrs = append(attrs, slog.String("errors", c.Errors.String()))
		}

		switch {
		case isProbe(c.Request.URL.Path):
			log.Debug("request", attrs...)
		case c.Writer.Status() >= 500:
			log.Error("request", attrs...)
		case c.Writer.Status() >= 400:
			log.Warn("request", attrs...)
		default:
			log.Info("request", attrs...)
		}
	}
}

func isProbe(p string) bool { return p == "/healthz" || p == "/readyz" }
