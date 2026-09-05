// Package db owns the PostgreSQL connection pool and its lifecycle.
//
// One pool is created at startup and shared by every request. pgx speaks the
// native Postgres protocol with binary encoding, so this is the fastest path
// available in Go, and the pool is what keeps the service from opening a
// connection per request under load.
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"dealflow360/backend/internal/platform/config"
)

// Pool is the shared connection pool. It is safe for concurrent use.
type Pool = pgxpool.Pool

// Open builds and verifies the pool.
//
// It pings before returning, so a bad DATABASE_URL fails at startup with a
// clear message rather than on the first request that happens to need data.
func Open(ctx context.Context, cfg config.Config) (*Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}

	poolCfg.MaxConns = cfg.DBMaxConns
	poolCfg.MinConns = cfg.DBMinConns
	poolCfg.MaxConnLifetime = cfg.DBMaxConnLife
	poolCfg.MaxConnIdleTime = cfg.DBMaxConnIdle
	poolCfg.HealthCheckPeriod = time.Minute

	// A connection that has lived a long time is recycled with jitter so all
	// replicas do not drop their connections at the same instant.
	poolCfg.MaxConnLifetimeJitter = cfg.DBMaxConnLife / 10

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

// Ready is a readiness probe for the HTTP layer. It is deliberately cheap:
// readiness is checked often, so it must not run a real query.
func Ready(pool *Pool) func(context.Context) error {
	return func(ctx context.Context) error {
		ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()

		if err := pool.Ping(ctx); err != nil {
			return fmt.Errorf("database unreachable: %w", err)
		}
		return nil
	}
}
