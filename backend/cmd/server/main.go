// Command server runs the DealFlow360 API.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"dealflow360/backend/internal/platform/config"
	"dealflow360/backend/internal/platform/db"
	"dealflow360/backend/internal/platform/logger"
	apihttp "dealflow360/backend/internal/transport/http"
)

func main() {
	cfg := config.MustLoad()

	log := logger.New(cfg.LogLevel, !cfg.IsProd())
	slog.SetDefault(log)

	log.Info("starting dealflow360 api",
		slog.String("env", string(cfg.Env)),
		slog.String("port", cfg.Port),
	)

	// Connect before serving: a bad DATABASE_URL should fail at startup with a
	// clear message, not on the first request that happens to need data.
	dbCtx, dbCancel := context.WithTimeout(context.Background(), 30*time.Second)
	pool, err := db.Open(dbCtx, cfg)
	dbCancel()
	if err != nil {
		log.Error("database unavailable", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer pool.Close()

	log.Info("database connected",
		slog.Int("max_conns", int(cfg.DBMaxConns)),
		slog.Int("min_conns", int(cfg.DBMinConns)),
	)

	router := apihttp.NewRouter(apihttp.Deps{
		Config: cfg,
		Log:    log,
		Pool:   pool,
		Ready:  db.Ready(pool),
	})

	srv := &http.Server{
		Addr:              net.JoinHostPort("", cfg.Port),
		Handler:           router,
		ReadTimeout:       cfg.ReadTimeout,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
	}

	// Serve in the background so main can block on the shutdown signal.
	serveErr := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
			return
		}
		serveErr <- nil
	}()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	select {
	case err := <-serveErr:
		if err != nil {
			log.Error("server failed", slog.String("error", err.Error()))
			os.Exit(1)
		}
	case <-ctx.Done():
		log.Info("shutdown signal received, draining connections",
			slog.Duration("timeout", cfg.ShutdownTimeout))

		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Error("graceful shutdown failed", slog.String("error", err.Error()))
			os.Exit(1)
		}
		log.Info("shutdown complete")
	}
}
