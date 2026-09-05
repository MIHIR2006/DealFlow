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

	router := apihttp.NewRouter(apihttp.Deps{
		Config: cfg,
		Log:    log,
		// Ready is nil until Phase 2 wires the database ping.
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
