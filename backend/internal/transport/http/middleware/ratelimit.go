package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"

	"dealflow360/backend/internal/platform/apierr"
)

// RateLimit throttles a client by IP using a token bucket.
//
// It guards the two endpoints where an attacker gets something for trying
// repeatedly: login, where the prize is a password, and the portal, where the
// prize is a valid quotation token. Everything else is authenticated already
// and does not need it.
//
// The limiter is in-process, so each replica enforces its own budget. That is
// the right trade here: it costs nothing, needs no Redis, and the failure
// mode is a limit N times looser than configured rather than an outage.
func RateLimit(perMinute int, burst int, fail func(*gin.Context, error)) gin.HandlerFunc {
	limiter := newIPLimiter(rate.Limit(float64(perMinute)/60.0), burst)

	// Visitors that have gone quiet are dropped so the map cannot grow
	// without bound under a spray of distinct source addresses.
	go limiter.reapForever(10*time.Minute, 3*time.Minute)

	return func(c *gin.Context) {
		if !limiter.allow(c.ClientIP()) {
			fail(c, apierr.RateLimited("too many requests, please slow down"))
			return
		}
		c.Next()
	}
}

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type ipLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rate     rate.Limit
	burst    int
}

func newIPLimiter(r rate.Limit, burst int) *ipLimiter {
	return &ipLimiter{
		visitors: make(map[string]*visitor),
		rate:     r,
		burst:    burst,
	}
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	v, ok := l.visitors[ip]
	if !ok {
		v = &visitor{limiter: rate.NewLimiter(l.rate, l.burst)}
		l.visitors[ip] = v
	}
	v.lastSeen = time.Now()
	lim := v.limiter
	l.mu.Unlock()

	return lim.Allow()
}

func (l *ipLimiter) reapForever(every, idleFor time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()

	for range ticker.C {
		cutoff := time.Now().Add(-idleFor)
		l.mu.Lock()
		for ip, v := range l.visitors {
			if v.lastSeen.Before(cutoff) {
				delete(l.visitors, ip)
			}
		}
		l.mu.Unlock()
	}
}
