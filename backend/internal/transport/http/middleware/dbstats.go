package middleware

import (
	"fmt"
	"sync"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/db"
)

// Response headers carrying the request's database cost.
const (
	HeaderDBQueries = "X-DB-Queries"
	HeaderDBTime    = "X-DB-Time-Ms"
)

// DBStats attaches a per-request query counter and reports the totals.
//
// Two reasons this earns its place. An N+1 regression becomes visible the
// moment it is introduced, because the count jumps from four to forty. And
// the number is a concrete claim about the system: "quotation detail renders
// in four queries" is checkable by anyone with a network tab open.
func DBStats(enabled bool) gin.HandlerFunc {
	if !enabled {
		return func(c *gin.Context) { c.Next() }
	}

	return func(c *gin.Context) {
		ctx, stats := db.WithStats(c.Request.Context())
		c.Request = c.Request.WithContext(ctx)

		// Headers have to be written before the body. Gin offers no
		// before-write hook, so wrap the writer and stamp them on the first
		// write, by which point every query the handler ran has been counted.
		c.Writer = &statsWriter{ResponseWriter: c.Writer, stats: stats}

		c.Next()
	}
}

type statsWriter struct {
	gin.ResponseWriter
	stats *db.Stats
	once  sync.Once
}

func (w *statsWriter) stamp() {
	w.once.Do(func() {
		ms := float64(w.stats.Duration().Microseconds()) / 1000
		h := w.Header()
		h.Set(HeaderDBQueries, fmt.Sprintf("%d", w.stats.Queries()))
		h.Set(HeaderDBTime, fmt.Sprintf("%.2f", ms))
		h.Set("Server-Timing", fmt.Sprintf("db;dur=%.2f", ms))
	})
}

func (w *statsWriter) WriteHeader(status int) {
	w.stamp()
	w.ResponseWriter.WriteHeader(status)
}

func (w *statsWriter) Write(b []byte) (int, error) {
	w.stamp()
	return w.ResponseWriter.Write(b)
}

func (w *statsWriter) WriteString(s string) (int, error) {
	w.stamp()
	return w.ResponseWriter.WriteString(s)
}
