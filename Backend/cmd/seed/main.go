// Command seed resets the database to the demonstration dataset.
//
// It is destructive: every table is truncated first. That is deliberate --
// resetting to a known state between demo rehearsals must be one command.
//
//	seed              the demo dataset
//	seed -bulk 2000   the demo dataset plus 2,000 filler quotations, for
//	                  checking query plans and budgets at a size the planner
//	                  takes seriously
package main

import (
	"context"
	"flag"
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
	bulk := flag.Int("bulk", 0, "additional filler quotations to generate")
	linesEach := flag.Int("lines", 5, "lines per filler quotation")
	flag.Parse()

	cfg := config.MustLoad()
	log := logger.New(cfg.LogLevel, true)

	if cfg.IsProd() {
		log.Error("refusing to seed a production database")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
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
	log.Info("demo dataset loaded", slog.Duration("took", time.Since(start)))

	if *bulk > 0 {
		bulkStart := time.Now()
		if err := seed.Bulk(ctx, pool, *bulk, *linesEach); err != nil {
			log.Error("bulk seed failed", slog.String("error", err.Error()))
			os.Exit(1)
		}
		log.Info("filler data generated",
			slog.Int("quotations", *bulk),
			slog.Int("lines_each", *linesEach),
			slog.Duration("took", time.Since(bulkStart)))
	}

	fmt.Printf("\n  Sign in with any of these, password %q:\n"+
		"    admin@dealflow360.test    (ADMIN)\n"+
		"    manager@dealflow360.test  (MANAGER)\n"+
		"    finance@dealflow360.test  (FINANCE)\n"+
		"    rep@dealflow360.test      (REP)\n\n", seed.DemoPassword)
}
