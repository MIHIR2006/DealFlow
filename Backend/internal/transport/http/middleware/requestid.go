package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
)

// HeaderRequestID is echoed on every response and accepted on input so a
// request can be traced across the frontend, the proxy, and this service.
const HeaderRequestID = "X-Request-ID"

const ctxRequestID = "request_id"

// RequestID assigns each request a stable id, reusing a caller-supplied one
// when present.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader(HeaderRequestID)
		if id == "" {
			id = newID()
		}
		c.Set(ctxRequestID, id)
		c.Writer.Header().Set(HeaderRequestID, id)
		c.Next()
	}
}

// RequestIDOf returns the current request's id, or "" outside a request.
func RequestIDOf(c *gin.Context) string {
	if v, ok := c.Get(ctxRequestID); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand failing is unrecoverable; an empty id is still safe
		// because the field is only used for correlation.
		return ""
	}
	return hex.EncodeToString(b[:])
}
