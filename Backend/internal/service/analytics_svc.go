package service

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/platform/config"
)

// AnalyticsService answers the questions nobody asked it.
//
// Everything else in this system reacts to something a person did. This part
// goes looking: which deals have gone quiet, which discounts are out of
// character for the rep who gave them, which orders are past the date they
// were promised. A manager should not have to notice a stalled deal; the
// system should tell them.
//
// Every figure is an aggregate computed in Postgres. Nothing here pulls rows
// into Go to count them, so the dashboard costs the same whether there are
// twenty quotations or twenty thousand.
type AnalyticsService struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	cfg   config.Config
	quote *QuoteService

	// notify sends the chase a nudge represents. Optional.
	notify *Notifier
}

// WithNotifier attaches outbound mail. Optional; nil disables it.
func (s *AnalyticsService) WithNotifier(n *Notifier) *AnalyticsService {
	s.notify = n
	return s
}

// NewAnalyticsService builds the service.
func NewAnalyticsService(pool *pgxpool.Pool, q *sqlcgen.Queries, cfg config.Config, quote *QuoteService) *AnalyticsService {
	return &AnalyticsService{pool: pool, q: q, cfg: cfg, quote: quote}
}

// Built-in thresholds, used when neither the request nor the deployment's
// configuration supplies one.
//
// These are not merely tidy defaults. A zero stall window marks every open
// deal as stalled, and a zero multiplier marks every discount as an anomaly;
// a dashboard that flags everything is worse than one that flags nothing,
// because people stop reading it. Falling back to a known-good value is the
// safe direction to fail.
const (
	FallbackStallDays  int32 = 7
	FallbackMinSample  int32 = 3
	FallbackAlertLimit int32 = 20
)

// FallbackMultiplier is the default anomaly threshold: a discount half again
// above the rep's own baseline.
var FallbackMultiplier = decimal.RequireFromString("1.5")

// DealHealthOptions tunes a dashboard request. Zero values fall back to the
// deployment's configured thresholds, and then to the constants above.
type DealHealthOptions struct {
	StallDays  int32
	Multiplier decimal.Decimal
	MinSample  int32
	Limit      int32
}

func (o DealHealthOptions) resolve(cfg config.Config) DealHealthOptions {
	one := decimal.NewFromInt(1)

	if o.StallDays <= 0 {
		o.StallDays = cfg.StallDays
	}
	if o.StallDays <= 0 {
		o.StallDays = FallbackStallDays
	}

	if o.Multiplier.LessThanOrEqual(one) {
		o.Multiplier = cfg.AnomalyMultiplier
	}
	if o.Multiplier.LessThanOrEqual(one) {
		o.Multiplier = FallbackMultiplier
	}

	if o.MinSample <= 0 {
		o.MinSample = cfg.AnomalyMinSample
	}
	if o.MinSample <= 0 {
		o.MinSample = FallbackMinSample
	}

	if o.Limit <= 0 {
		o.Limit = FallbackAlertLimit
	}
	return o
}

// DealHealth is the dashboard payload.
type DealHealth struct {
	Summary   sqlcgen.PipelineSummaryRow
	Stalled   []sqlcgen.FindStalledQuotationsRow
	Anomalies []sqlcgen.FindDiscountAnomaliesRow
	Slippage  []sqlcgen.FindDeliverySlippageRow
	Statuses  []sqlcgen.QuotationStatusCountsRow

	// Thresholds are echoed back so the dashboard can say what it looked for,
	// not just what it found.
	Thresholds DealHealthOptions
}

// DealHealth scans for the three conditions worth interrupting someone about.
func (s *AnalyticsService) DealHealth(ctx context.Context, actor auth.Principal, opts DealHealthOptions) (DealHealth, error) {
	if !actor.Role.Is(auth.RoleAdmin, auth.RoleManager, auth.RoleFinance) {
		return DealHealth{}, apierr.Forbidden("your role cannot view the deal health dashboard")
	}
	o := opts.resolve(s.cfg)

	summary, err := s.q.PipelineSummary(ctx, sqlcgen.PipelineSummaryParams{})
	if err != nil {
		return DealHealth{}, apierr.Internal(fmt.Errorf("pipeline summary: %w", err))
	}

	// Deals nobody has touched. Covered by idx_quotations_stalled.
	stalled, err := s.q.FindStalledQuotations(ctx, sqlcgen.FindStalledQuotationsParams{
		StallDays: o.StallDays, PageSize: o.Limit,
	})
	if err != nil {
		return DealHealth{}, apierr.Internal(fmt.Errorf("find stalled quotations: %w", err))
	}

	// Discounts out of character for the rep who gave them. Comparing a rep
	// against their own history catches an outlier that a company-wide
	// threshold would miss entirely: a rep who always discounts at 3% jumping
	// to 12% is a signal, even though 12% breaks no policy.
	anomalies, err := s.q.FindDiscountAnomalies(ctx, sqlcgen.FindDiscountAnomaliesParams{
		MinSample: o.MinSample, Multiplier: o.Multiplier, PageSize: o.Limit,
	})
	if err != nil {
		return DealHealth{}, apierr.Internal(fmt.Errorf("find discount anomalies: %w", err))
	}

	slippage, err := s.q.FindDeliverySlippage(ctx, o.Limit)
	if err != nil {
		return DealHealth{}, apierr.Internal(fmt.Errorf("find delivery slippage: %w", err))
	}

	statuses, err := s.q.QuotationStatusCounts(ctx)
	if err != nil {
		return DealHealth{}, apierr.Internal(fmt.Errorf("quotation status counts: %w", err))
	}

	return DealHealth{
		Summary: summary, Stalled: stalled, Anomalies: anomalies,
		Slippage: slippage, Statuses: statuses, Thresholds: o,
	}, nil
}

// Nudge is the action a manager takes from a stalled-deal alert.
//
// It records that someone chased the deal and resets its activity clock, so
// it drops off the stalled list until it goes quiet again. The chase itself
// happens outside this system; what matters here is that it is recorded and
// that the alert stops repeating.
func (s *AnalyticsService) Nudge(ctx context.Context, actor auth.Principal, quotationID int64, note string) (Quotation, error) {
	if !actor.Role.Is(auth.RoleAdmin, auth.RoleManager, auth.RoleFinance) {
		return Quotation{}, apierr.Forbidden("your role cannot nudge a deal")
	}

	// Loading through the quotation service applies its visibility rules, so
	// a manager cannot nudge a deal outside their team.
	quote, err := s.quote.Get(ctx, actor, quotationID)
	if err != nil {
		return Quotation{}, err
	}

	if _, err := s.q.NudgeQuotation(ctx, quotationID); err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("nudge quotation: %w", err))
	}
	if _, err := s.q.ResolveAlertsForQuotation(ctx, sqlcgen.ResolveAlertsForQuotationParams{
		QuotationID: quotationID, AlertType: "STALLED",
	}); err != nil {
		return Quotation{}, apierr.Internal(fmt.Errorf("resolve stalled alerts: %w", err))
	}

	if note == "" {
		note = "Deal chased from the health dashboard"
	}
	s.quote.Audit(ctx, quotationID, "NUDGED", actor, note, map[string]any{
		"previous_activity_at": quote.Header.LastActivityAt.UTC().Format(time.RFC3339),
	})

	// The chase itself used to happen entirely outside this system. Now the
	// nudge sends it, where the customer still holds a live portal link.
	s.notify.QuotationNudged(ctx, quote.Header)

	return s.quote.Get(ctx, actor, quotationID)
}

// ReportFilter is the four dimensions the problem statement names: a period,
// a rep or team, an approval status, and a product category.
type ReportFilter struct {
	From       *time.Time
	To         *time.Time
	RepID      *int64
	SalesTeam  *string
	Status     *string
	CategoryID *int64
}

// Report is sales performance broken down by rep, team and category.
type Report struct {
	Rows    []sqlcgen.SalesReportRow
	Summary sqlcgen.PipelineSummaryRow
	Filter  ReportFilter
}

// SalesReport aggregates performance across the requested slice.
func (s *AnalyticsService) SalesReport(ctx context.Context, actor auth.Principal, f ReportFilter) (Report, error) {
	switch actor.Role {
	case auth.RoleAdmin, auth.RoleFinance:
		// Unrestricted.
	case auth.RoleManager:
		// A manager reports on their own team, whatever they asked for.
		team := actor.SalesTeam
		f.SalesTeam = &team
	case auth.RoleRep:
		// A rep sees their own numbers only.
		id := actor.UserID
		f.RepID = &id
		f.SalesTeam = nil
	default:
		return Report{}, apierr.Forbidden("your role cannot view reports")
	}

	rows, err := s.q.SalesReport(ctx, sqlcgen.SalesReportParams{
		From: f.From, To: f.To,
		RepID: f.RepID, SalesTeam: f.SalesTeam,
		Status: f.Status, CategoryID: f.CategoryID,
	})
	if err != nil {
		return Report{}, apierr.Internal(fmt.Errorf("sales report: %w", err))
	}

	summary, err := s.q.PipelineSummary(ctx, sqlcgen.PipelineSummaryParams{
		From: f.From, To: f.To,
	})
	if err != nil {
		return Report{}, apierr.Internal(fmt.Errorf("pipeline summary: %w", err))
	}

	return Report{Rows: rows, Summary: summary, Filter: f}, nil
}

// Alerts returns the recorded alerts still open.
func (s *AnalyticsService) Alerts(ctx context.Context, actor auth.Principal, limit int32) ([]sqlcgen.ListOpenDealAlertsRow, error) {
	if !actor.Role.Is(auth.RoleAdmin, auth.RoleManager, auth.RoleFinance) {
		return nil, apierr.Forbidden("your role cannot view alerts")
	}
	if limit <= 0 {
		limit = 20
	}

	rows, err := s.q.ListOpenDealAlerts(ctx, limit)
	if err != nil {
		return nil, apierr.Internal(fmt.Errorf("list open alerts: %w", err))
	}
	return rows, nil
}
