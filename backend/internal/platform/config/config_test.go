package config_test

import (
	"strings"
	"testing"

	"dealflow360/backend/internal/platform/config"
)

const validSecret = "0123456789abcdef0123456789abcdef"

func setValid(t *testing.T) {
	t.Helper()
	t.Setenv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
	t.Setenv("JWT_SECRET", validSecret)
}

func TestLoadAppliesDefaults(t *testing.T) {
	setValid(t)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() = %v, want nil", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want 8080", cfg.Port)
	}
	if cfg.Env != config.EnvDev {
		t.Errorf("Env = %q, want dev", cfg.Env)
	}
	if cfg.DBMaxConns != 20 {
		t.Errorf("DBMaxConns = %d, want 20", cfg.DBMaxConns)
	}
	if cfg.IsProd() {
		t.Error("IsProd() = true, want false for dev")
	}
}

func TestLoadReportsEveryProblemAtOnce(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("LOG_LEVEL", "verbose")

	_, err := config.Load()
	if err == nil {
		t.Fatal("Load() = nil, want error")
	}

	// A misconfigured deploy should be fixable in one pass, not one
	// restart per missing variable.
	for _, want := range []string{"DATABASE_URL", "JWT_SECRET", "LOG_LEVEL"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error missing %q:\n%v", want, err)
		}
	}
}

func TestShortJWTSecretRejected(t *testing.T) {
	setValid(t)
	t.Setenv("JWT_SECRET", "too-short")

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() = nil, want error for short JWT_SECRET")
	}
}

func TestWildcardCORSRejectedInProd(t *testing.T) {
	setValid(t)
	t.Setenv("APP_ENV", "prod")
	t.Setenv("CORS_ORIGINS", "*")

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() = nil, want error for wildcard CORS in prod")
	}
}

func TestCORSOriginsParsedAndTrimmed(t *testing.T) {
	setValid(t)
	t.Setenv("CORS_ORIGINS", " https://a.example , https://b.example ,")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() = %v, want nil", err)
	}
	want := []string{"https://a.example", "https://b.example"}
	if len(cfg.CORSOrigins) != len(want) {
		t.Fatalf("CORSOrigins = %v, want %v", cfg.CORSOrigins, want)
	}
	for i := range want {
		if cfg.CORSOrigins[i] != want[i] {
			t.Errorf("CORSOrigins[%d] = %q, want %q", i, cfg.CORSOrigins[i], want[i])
		}
	}
}

// Profiling endpoints expose memory contents and goroutine stacks, so an
// address that is not loopback must be refused rather than quietly published.
func TestPprofMustBindToLoopback(t *testing.T) {
	setValid(t)

	for _, addr := range []string{"0.0.0.0:6060", ":6060", "10.0.0.5:6060", "example.com:6060"} {
		t.Run(addr, func(t *testing.T) {
			t.Setenv("PPROF_ADDR", addr)
			if _, err := config.Load(); err == nil {
				t.Errorf("PPROF_ADDR=%q was accepted", addr)
			}
		})
	}

	for _, addr := range []string{"127.0.0.1:6060", "localhost:6060", "[::1]:6060"} {
		t.Run(addr, func(t *testing.T) {
			t.Setenv("PPROF_ADDR", addr)
			if _, err := config.Load(); err != nil {
				t.Errorf("PPROF_ADDR=%q was rejected: %v", addr, err)
			}
		})
	}
}

func TestDealHealthThresholdsAreValidated(t *testing.T) {
	setValid(t)

	// A multiplier at or below one marks every discount as an anomaly, and a
	// dashboard that flags everything stops being read.
	for _, v := range []string{"1", "0.9", "0"} {
		t.Setenv("DEAL_ANOMALY_MULTIPLIER", v)
		if _, err := config.Load(); err == nil {
			t.Errorf("DEAL_ANOMALY_MULTIPLIER=%s was accepted", v)
		}
	}

	t.Setenv("DEAL_ANOMALY_MULTIPLIER", "1.5")
	t.Setenv("DEAL_STALL_DAYS", "0")
	if _, err := config.Load(); err == nil {
		t.Error("DEAL_STALL_DAYS=0 was accepted; every open deal would be stalled")
	}
}
