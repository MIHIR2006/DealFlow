package http

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"

	sqlcgen "dealflow360/backend/internal/db/sqlc"

	"dealflow360/backend/internal/domain/money"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
)

type analyticsHandler struct {
	svc *service.AnalyticsService
}

// dealHealth scans for the three conditions worth interrupting someone about.
func (h analyticsHandler) dealHealth(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

	opts := service.DealHealthOptions{Limit: pageLimit(c)}

	// Thresholds default to the deployment's configuration; a caller can
	// widen or narrow them to explore without a redeploy.
	if raw := c.Query("stall_days"); raw != "" {
		v, err := parseDecimal(raw, "stall_days")
		if err != nil {
			Fail(c, err)
			return
		}
		opts.StallDays = int32(v.IntPart()) //nolint:gosec // bounded below
		if opts.StallDays < 1 {
			Fail(c, apierr.Validation("stall_days must be at least 1"))
			return
		}
	}
	if raw := c.Query("multiplier"); raw != "" {
		v, err := parseDecimal(raw, "multiplier")
		if err != nil {
			Fail(c, err)
			return
		}
		if v.LessThanOrEqual(decimal.NewFromInt(1)) {
			Fail(c, apierr.Validation("multiplier must be greater than 1, or every deal is an anomaly"))
			return
		}
		opts.Multiplier = v
	}

	health, err := h.svc.DealHealth(c.Request.Context(), actor, opts)
	if err != nil {
		Fail(c, err)
		return
	}

	out := dto.DealHealth{
		Summary:   summaryDTO(health.Summary),
		Statuses:  make([]dto.StatusCount, 0, len(health.Statuses)),
		Stalled:   make([]dto.StalledDeal, 0, len(health.Stalled)),
		Anomalies: make([]dto.DiscountAnomaly, 0, len(health.Anomalies)),
		Slippage:  make([]dto.DeliverySlippage, 0, len(health.Slippage)),
		Thresholds: dto.DealHealthThresholds{
			StallDays:         health.Thresholds.StallDays,
			AnomalyMultiplier: health.Thresholds.Multiplier.String(),
			AnomalyMinSample:  health.Thresholds.MinSample,
		},
	}

	for _, s := range health.Statuses {
		out.Statuses = append(out.Statuses, dto.StatusCount{
			Status: s.Status, Count: s.Total, Value: s.Value.String(),
		})
	}
	for _, s := range health.Stalled {
		out.Stalled = append(out.Stalled, dto.StalledDeal{
			QuotationID: s.ID, Reference: s.Reference, Status: s.Status,
			CustomerName: s.CustomerName, RepName: s.RepName,
			GrandTotal:     s.GrandTotal.String(),
			DaysInactive:   s.DaysInactive,
			LastActivityAt: iso(s.LastActivityAt),
		})
	}
	for _, a := range health.Anomalies {
		out.Anomalies = append(out.Anomalies, dto.DiscountAnomaly{
			QuotationID: a.ID, Reference: a.Reference,
			CustomerName: a.CustomerName, RepName: a.RepName,
			GrandTotal:  a.GrandTotal.String(),
			DiscountPct: money.RoundPct(a.DiscountPct).String(),
			BaselinePct: money.RoundPct(a.BaselinePct).String(),
			Ratio:       money.RoundPct(money.SafeDiv(a.DiscountPct, a.BaselinePct)).String(),
		})
	}
	for _, s := range health.Slippage {
		row := dto.DeliverySlippage{
			OrderID: s.ID, Reference: s.Reference, Status: s.Status,
			CustomerName: s.CustomerName, DaysLate: s.DaysLate,
		}
		if s.PromisedDate != nil {
			row.PromisedDate = iso(*s.PromisedDate)
		}
		out.Slippage = append(out.Slippage, row)
	}

	OK(c, http.StatusOK, out)
}

func (h analyticsHandler) alerts(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

	rows, err := h.svc.Alerts(c.Request.Context(), actor, pageLimit(c))
	if err != nil {
		Fail(c, err)
		return
	}

	out := make([]dto.DealAlert, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.DealAlert{
			ID: r.ID, QuotationID: r.QuotationID, Reference: r.Reference,
			CustomerName: r.CustomerName,
			AlertType:    r.AlertType, Severity: r.Severity,
			Detail: r.Detail, Metric: r.Metric.String(),
			CreatedAt: iso(r.CreatedAt),
		})
	}
	OK(c, http.StatusOK, Page[dto.DealAlert]{Data: out})
}

// nudge is the action taken from a stalled-deal alert.
func (h analyticsHandler) nudge(c *gin.Context) {
	actor, id, err := actorAndID(c)
	if err != nil {
		Fail(c, err)
		return
	}

	var req dto.NudgeRequest
	if c.Request.ContentLength > 0 {
		if err := c.ShouldBindJSON(&req); err != nil {
			Fail(c, bindError(err))
			return
		}
	}

	quote, err := h.svc.Nudge(c.Request.Context(), actor, id, req.Note)
	if err != nil {
		Fail(c, err)
		return
	}
	OK(c, http.StatusOK, quotationDTO(quote))
}

// report aggregates performance across the four dimensions the problem
// statement names: period, rep or team, approval status, and category.
func (h analyticsHandler) report(c *gin.Context) {
	actor, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

	var f service.ReportFilter

	from, err := optionalDateQuery(c, "from")
	if err != nil {
		Fail(c, err)
		return
	}
	to, err := optionalDateQuery(c, "to")
	if err != nil {
		Fail(c, err)
		return
	}
	f.From, f.To = from, to

	if f.RepID, err = optionalInt64Query(c, "rep_id"); err != nil {
		Fail(c, err)
		return
	}
	if f.CategoryID, err = optionalInt64Query(c, "category_id"); err != nil {
		Fail(c, err)
		return
	}
	if v := c.Query("sales_team"); v != "" {
		f.SalesTeam = &v
	}
	if v := c.Query("status"); v != "" {
		f.Status = &v
	}

	report, err := h.svc.SalesReport(c.Request.Context(), actor, f)
	if err != nil {
		Fail(c, err)
		return
	}

	out := dto.SalesReport{
		Rows:    make([]dto.ReportRow, 0, len(report.Rows)),
		Summary: summaryDTO(report.Summary),
		AppliedFilter: dto.ReportFilterEcho{
			RepID: report.Filter.RepID, CategoryID: report.Filter.CategoryID,
		},
	}
	if report.Filter.From != nil {
		out.AppliedFilter.From = iso(*report.Filter.From)
	}
	if report.Filter.To != nil {
		out.AppliedFilter.To = iso(*report.Filter.To)
	}
	if report.Filter.SalesTeam != nil {
		out.AppliedFilter.SalesTeam = *report.Filter.SalesTeam
	}
	if report.Filter.Status != nil {
		out.AppliedFilter.Status = *report.Filter.Status
	}

	for _, r := range report.Rows {
		out.Rows = append(out.Rows, dto.ReportRow{
			RepName: r.RepName, SalesTeam: r.SalesTeam, CategoryName: r.CategoryName,
			QuotationCount: r.QuotationCount,
			NetRevenue:     r.NetRevenue.String(),
			Margin:         r.Margin.String(),
			DiscountGiven:  r.DiscountGiven.String(),
		})
	}
	OK(c, http.StatusOK, out)
}

func summaryDTO(s sqlcgen.PipelineSummaryRow) dto.PipelineSummary {
	return dto.PipelineSummary{
		TotalQuotations:  s.TotalQuotations,
		PipelineValue:    s.PipelineValue.String(),
		WonValue:         s.WonValue.String(),
		AvgMarginPct:     money.RoundPct(s.AvgMarginPct).String(),
		AwaitingApproval: s.AwaitingApproval,
		AvgRiskScore:     money.RoundPct(s.AvgRiskScore).String(),
	}
}

func optionalDateQuery(c *gin.Context, name string) (*time.Time, error) {
	raw := c.Query(name)
	if raw == "" {
		return nil, nil
	}

	at, err := time.Parse("2006-01-02", raw)
	if err != nil {
		return nil, apierr.Validation(name + " must be a date in YYYY-MM-DD form")
	}
	return &at, nil
}
