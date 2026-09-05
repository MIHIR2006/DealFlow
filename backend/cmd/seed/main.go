// Command seed resets the database to the demonstration dataset.
//
// It is destructive: every table is truncated first. That is deliberate —
// resetting to a known state between demo rehearsals must be one command.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/platform/db"
	"dealflow360/backend/internal/platform/logger"
	"dealflow360/backend/internal/seed"
)

func main() {
	cfg := config.MustLoad()
	log := logger.New(cfg.LogLevel, true)

	if cfg.IsProd() {
		log.Error("refusing to seed a production database")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := db.Open(ctx, cfg)
	if err != nil {
		log.Error("connect", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()

	start := time.Now()
	if err := seed.Run(ctx, pool); err != nil {
		log.Error("seed failed", slog.String("error", err.Error()))
		os.Exit(1)
	}

	log.Info("seed complete", slog.Duration("took", time.Since(start)))
	fmt.Printf("\n  Sign in with any of these, password %q:\n"+
		"    admin@dealflow360.test    (ADMIN)\n"+
		"    manager@dealflow360.test  (MANAGER)\n"+
		"    finance@dealflow360.test  (FINANCE)\n"+
		"    rep@dealflow360.test      (REP)\n\n", seed.DemoPassword)
}
