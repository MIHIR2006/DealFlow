package db

import (
	"context"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5"
)

// Stats counts the queries and database time consumed by one request.
//
// It exists because an N+1 regression is invisible until something reports
// it. With this attached, the count jumps from 4 to 40 the moment someone
// puts a query inside a loop, and the response header says so.
type Stats struct {
	queries  atomic.Int64
	durNanos atomic.Int64
}

// Queries returns how many statements ran during the request.
func (s *Stats) Queries() int64 { return s.queries.Load() }

// Duration returns the total time spent waiting on the database.
func (s *Stats) Duration() time.Duration { return time.Duration(s.durNanos.Load()) }

func (s *Stats) record(d time.Duration) {
	s.queries.Add(1)
	s.durNanos.Add(int64(d))
}

type statsKey struct{}
type queryStartKey struct{}

// WithStats attaches a fresh counter to ctx. The HTTP middleware calls this
// once per request; every query run under the returned context is counted.
func WithStats(ctx context.Context) (context.Context, *Stats) {
	s := &Stats{}
	return context.WithValue(ctx, statsKey{}, s), s
}

// StatsFrom returns the counter attached to ctx, or nil when none is.
func StatsFrom(ctx context.Context) *Stats {
	s, _ := ctx.Value(statsKey{}).(*Stats)
	return s
}

// Tracer counts queries per request.
//
// pgx hands the same context to TraceQueryStart and TraceQueryEnd, so the
// counter is found by context rather than by any global state. That keeps
// concurrent requests from counting each other's queries.
type Tracer struct{}

var _ pgx.QueryTracer = Tracer{}

// TraceQueryStart records when the statement began.
func (Tracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	if StatsFrom(ctx) == nil {
		// No counter attached (background job, seed, migration) — nothing to
		// measure, so avoid the allocation.
		return ctx
	}
	return context.WithValue(ctx, queryStartKey{}, time.Now())
}

// TraceQueryEnd adds the statement to the request's totals.
func (Tracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryEndData) {
	s := StatsFrom(ctx)
	if s == nil {
		return
	}

	started, ok := ctx.Value(queryStartKey{}).(time.Time)
	if !ok {
		s.record(0)
		return
	}
	s.record(time.Since(started))
}
