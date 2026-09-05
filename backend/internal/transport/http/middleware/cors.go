package middleware

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// CORS restricts browser access to an explicit origin allowlist. A wildcard
// is rejected at config load time in prod, so this never becomes "*".
func CORS(origins []string) gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins: origins,
		AllowMethods: []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{
			"Origin", "Content-Type", "Accept", "Authorization",
			HeaderRequestID, "Idempotency-Key",
		},
		ExposeHeaders: []string{
			HeaderRequestID, "X-DB-Queries", "X-DB-Time-Ms", "Server-Timing",
		},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}
