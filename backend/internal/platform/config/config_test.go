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
