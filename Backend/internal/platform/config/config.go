// Package config loads and validates all runtime configuration at boot.
//
// Nothing else in the codebase may read os.Getenv. If a value is missing or
// malformed the process must refuse to start with a clear message, rather
// than failing later on a request path.
package config

import (
	"fmt"
	"net"

	"github.com/shopspring/decimal"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Env identifies the deployment environment.
type Env string

const (
	EnvDev  Env = "dev"
	EnvTest Env = "test"
	EnvProd Env = "prod"
)

// Config holds every tunable the service needs. It is immutable after Load.
type Config struct {
	Env  Env
	Port string

	DatabaseURL    string
	DBMaxConns     int32
	DBMinConns     int32
	DBMaxConnLife  time.Duration
	DBMaxConnIdle  time.Duration
	DBQueryTimeout time.Duration

	JWTSecret      string
	JWTTTL         time.Duration
	PortalTokenTTL time.Duration

	CORSOrigins []string

	LogLevel string

	// Deal-health thresholds. The problem statement calls for a configured
	// stall window rather than a hardcoded one; these are the knobs, and the
	// dashboard accepts per-request overrides on top of them.
	StallDays         int32
	AnomalyMultiplier decimal.Decimal
	AnomalyMinSample  int32

	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
	IdleTimeout     time.Duration
	ShutdownTimeout time.Duration

	// ExposeDBStats controls the X-DB-Queries / X-DB-Time-Ms response headers.
	// Safe to leave on for the demo; gate it off in a real production deploy.
	ExposeDBStats bool

	// RecommendationURL points at the recommendation engine. Empty disables
	// it, and the upsell endpoint serves the rules-based ranking on its own.
	// It is deliberately optional: the engine is an enrichment, and the
	// quotation builder must work with it absent, down, or slow.
	RecommendationURL     string
	RecommendationTimeout time.Duration

	// SMTP is the account transactional mail is sent through. Every field
	// empty disables mail entirely: the platform must run with no credentials
	// at all, exactly as it runs with the recommendation engine absent.
	SMTPHost string
	SMTPPort string
	SMTPUser string
	SMTPPass string
	SMTPFrom string

	// SalesInboxEmail receives landing-page enquiries. Empty falls back to
	// SMTPFrom, so a configured mailer always has somewhere to deliver a lead.
	SalesInboxEmail string

	// AppBaseURL is the public origin of the frontend. Customer email carries
	// portal links, and a link is only useful if it is absolute — the backend
	// cannot infer this from a request it is not handling.
	AppBaseURL string

	// PprofAddr, when set, starts the profiling endpoints on a second
	// listener. It is deliberately separate from the API port so profiles
	// are never reachable from the internet by accident, and refuses to
	// bind anywhere but loopback.
	PprofAddr string
}

// IsProd reports whether the service is running in production mode.
func (c Config) IsProd() bool { return c.Env == EnvProd }

// MailEnabled reports whether enough SMTP configuration is present to send.
func (c Config) MailEnabled() bool {
	return c.SMTPHost != "" && c.SMTPPort != "" && c.SMTPUser != "" && c.SMTPPass != ""
}

// SalesInbox is where landing-page enquiries go, falling back to the sending
// account so a configured mailer never drops a lead for want of one more
// variable.
func (c Config) SalesInbox() string {
	if c.SalesInboxEmail != "" {
		return c.SalesInboxEmail
	}
	if c.SMTPFrom != "" {
		return c.SMTPFrom
	}
	return c.SMTPUser
}

// Load reads configuration from the environment, applies defaults, and
// validates. It returns every problem it finds at once so a misconfigured
// deploy is fixed in one pass instead of one restart per missing variable.
func Load() (Config, error) {
	// Attempt to load .env file; ignore errors if it doesn't exist
	_ = godotenv.Load()

	c := Config{
		Env:               Env(str("APP_ENV", string(EnvDev))),
		Port:              str("PORT", "8080"),
		DatabaseURL:       str("DATABASE_URL", ""),
		DBMaxConns:        num32("DB_MAX_CONNS", 20),
		DBMinConns:        num32("DB_MIN_CONNS", 2),
		DBMaxConnLife:     dur("DB_MAX_CONN_LIFETIME", time.Hour),
		DBMaxConnIdle:     dur("DB_MAX_CONN_IDLE", 30*time.Minute),
		DBQueryTimeout:    dur("DB_QUERY_TIMEOUT", 5*time.Second),
		JWTSecret:         str("JWT_SECRET", ""),
		JWTTTL:            dur("JWT_TTL", 12*time.Hour),
		PortalTokenTTL:    dur("PORTAL_TOKEN_TTL", 14*24*time.Hour),
		CORSOrigins:       list("CORS_ORIGINS", "http://localhost:3000"),
		LogLevel:          str("LOG_LEVEL", "info"),
		StallDays:         num32("DEAL_STALL_DAYS", 7),
		AnomalyMultiplier: decOr("DEAL_ANOMALY_MULTIPLIER", "1.5"),
		AnomalyMinSample:  num32("DEAL_ANOMALY_MIN_SAMPLE", 3),
		ReadTimeout:       dur("HTTP_READ_TIMEOUT", 10*time.Second),
		WriteTimeout:      dur("HTTP_WRITE_TIMEOUT", 30*time.Second),
		IdleTimeout:       dur("HTTP_IDLE_TIMEOUT", 120*time.Second),
		ShutdownTimeout:   dur("HTTP_SHUTDOWN_TIMEOUT", 15*time.Second),
		ExposeDBStats:     boolean("EXPOSE_DB_STATS", true),
		PprofAddr:         str("PPROF_ADDR", ""),

		RecommendationURL:     strings.TrimRight(str("RECOMMENDATION_URL", ""), "/"),
		RecommendationTimeout: dur("RECOMMENDATION_TIMEOUT", 1500*time.Millisecond),

		SMTPHost:        str("SMTP_HOST", ""),
		SMTPPort:        str("SMTP_PORT", ""),
		SMTPUser:        str("SMTP_USER", ""),
		SMTPPass:        str("SMTP_PASS", ""),
		SMTPFrom:        str("SMTP_FROM", ""),
		SalesInboxEmail: str("SALES_INBOX_EMAIL", ""),
		AppBaseURL:      strings.TrimRight(str("APP_BASE_URL", "http://localhost:3000"), "/"),
	}

	var problems []string

	switch c.Env {
	case EnvDev, EnvTest, EnvProd:
	default:
		problems = append(problems, fmt.Sprintf("APP_ENV must be one of dev|test|prod, got %q", c.Env))
	}

	if c.DatabaseURL == "" {
		problems = append(problems, "DATABASE_URL is required (postgres connection string)")
	}

	switch {
	case c.JWTSecret == "":
		problems = append(problems, "JWT_SECRET is required")
	case len(c.JWTSecret) < 32:
		problems = append(problems, "JWT_SECRET must be at least 32 characters")
	}

	if c.DBMaxConns < 1 {
		problems = append(problems, "DB_MAX_CONNS must be >= 1")
	}
	if c.DBMinConns < 0 || c.DBMinConns > c.DBMaxConns {
		problems = append(problems, "DB_MIN_CONNS must be between 0 and DB_MAX_CONNS")
	}
	if c.StallDays < 1 {
		problems = append(problems, "DEAL_STALL_DAYS must be >= 1")
	}
	if c.AnomalyMultiplier.LessThanOrEqual(decimal.NewFromInt(1)) {
		problems = append(problems,
			"DEAL_ANOMALY_MULTIPLIER must be greater than 1, or every deal is an anomaly")
	}
	if c.AnomalyMinSample < 1 {
		problems = append(problems, "DEAL_ANOMALY_MIN_SAMPLE must be >= 1")
	}
	if len(c.CORSOrigins) == 0 {
		problems = append(problems, "CORS_ORIGINS must list at least one origin")
	}
	for _, o := range c.CORSOrigins {
		if o == "*" && c.IsProd() {
			problems = append(problems, `CORS_ORIGINS may not be "*" in prod`)
		}
	}

	// Profiling endpoints expose memory contents and goroutine stacks. Binding
	// them to anything but loopback would publish that.
	if c.PprofAddr != "" && !isLoopback(c.PprofAddr) {
		problems = append(problems,
			`PPROF_ADDR must bind to loopback, for example "127.0.0.1:6060"`)
	}

	if c.RecommendationURL != "" {
		if !strings.HasPrefix(c.RecommendationURL, "http://") &&
			!strings.HasPrefix(c.RecommendationURL, "https://") {
			problems = append(problems,
				"RECOMMENDATION_URL must be an absolute http(s) URL, for example http://recommendation:8001")
		}
		// http.Client reads a zero timeout as "wait forever", which would let
		// a stalled engine hold a rep's request open indefinitely.
		if c.RecommendationTimeout <= 0 {
			problems = append(problems, "RECOMMENDATION_TIMEOUT must be greater than zero")
		}
	}

	switch strings.ToLower(c.LogLevel) {
	case "debug", "info", "warn", "error":
	default:
		problems = append(problems, "LOG_LEVEL must be one of debug|info|warn|error")
	}

	if len(problems) > 0 {
		return Config{}, fmt.Errorf("invalid configuration:\n  - %s", strings.Join(problems, "\n  - "))
	}
	return c, nil
}

// MustLoad is Load but terminates the process on failure. Use it from main.
func MustLoad() Config {
	c, err := Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	return c
}

// isLoopback reports whether an address binds only to the local machine.
func isLoopback(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	switch host {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}

func str(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

// num32 parses an int32. Using ParseInt with a 32-bit size means the value
// is range-checked by the parser, so the conversion below cannot overflow.
func num32(key string, def int32) int32 {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	n, err := strconv.ParseInt(v, 10, 32)
	if err != nil {
		return def
	}
	return int32(n)
}

func dur(key string, def time.Duration) time.Duration {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return def
	}
	return d
}

func boolean(key string, def bool) bool {
	v, ok := os.LookupEnv(key)
	if !ok || v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}

// decOr parses a decimal setting, falling back to a default that is known
// good rather than to zero.
func decOr(key, def string) decimal.Decimal {
	v, err := decimal.NewFromString(str(key, def))
	if err != nil {
		v, _ = decimal.NewFromString(def)
	}
	return v
}

func list(key, def string) []string {
	raw := str(key, def)
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
