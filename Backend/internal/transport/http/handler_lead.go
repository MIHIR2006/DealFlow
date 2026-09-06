package http

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/service"
)

// leadHandler takes enquiries from the public landing page.
//
// This is the one unauthenticated write in the API, so it is deliberately
// narrow: one field, validated here, and nothing is persisted that could be
// read back. The route is rate limited alongside login for the same reason —
// it is reachable by anyone.
type leadHandler struct {
	notify *service.Notifier
	cfg    config.Config
}

// emailRe is a deliberately loose shape check. Real validation of an address
// is delivery; this only rejects input that could not possibly be one.
var emailRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

type leadRequest struct {
	Email string `json:"email" binding:"required"`
}

func (h leadHandler) capture(c *gin.Context) {
	var req leadRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if len(email) > 254 || !emailRe.MatchString(email) {
		Fail(c, apierr.Validation("enter a valid email address"))
		return
	}

	// The response does not depend on whether mail is configured. A prospect
	// on the landing page is told their enquiry was received either way, and
	// an unconfigured mailer is an operator's problem, not theirs.
	h.notify.LeadCaptured(c.Request.Context(), email, h.cfg.SalesInbox(),
		time.Now().Format(time.RFC1123))

	OK(c, http.StatusAccepted, gin.H{"received": true})
}
