// Package seed loads the demonstration dataset.
//
// The numbers here are not arbitrary. They are chosen so the two demo flows
// produce the exact figures in the design mockups:
//
//   - a Gold customer buying 45,000 of hardware at 12% and 105,000 of
//     services at 18% scores a blended risk of 5.6 and routes to finance,
//     which is the worked example from section 10 of the problem statement;
//
//   - seven laptops against 5 at Main and 1 at East split into two shipments
//     and leave exactly one unit backordered.
//
// It also seeds one genuinely stalled deal and one genuine discount anomaly,
// so the deal health dashboard shows true findings rather than placeholders.
package seed

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"
	"golang.org/x/crypto/bcrypt"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/domain/money"
)

// DemoPassword is shared by every seeded account so a demo never stalls on a
// forgotten credential. Seeded data is not production data.
const DemoPassword = "dealflow360"

// Options tunes how the dataset is built.
type Options struct {
	// BcryptCost is the work factor for seeded passwords. Zero means the
	// production default. Tests lower it: the suite logs in dozens of times
	// and a production cost turns that into a minute of pure key stretching.
	BcryptCost int
}

func (o Options) cost() int {
	if o.BcryptCost <= 0 {
		return bcrypt.DefaultCost
	}
	return o.BcryptCost
}

// decNull builds a nullable decimal for optional numeric columns such as
// coordinates, which are absent on records that have no location on file.
func decNull(v string) decimal.NullDecimal {
	if v == "" {
		return decimal.NullDecimal{}
	}
	return decimal.NullDecimal{Decimal: dec(v), Valid: true}
}

func dec(s string) decimal.Decimal { return money.MustFromString(s) }

// Run truncates and repopulates every table. It is destructive by design:
// resetting to a known state between rehearsals must be one command.
func Run(ctx context.Context, pool *pgxpool.Pool) error {
	return RunWith(ctx, pool, Options{})
}

// RunWith is Run with explicit options.
func RunWith(ctx context.Context, pool *pgxpool.Pool, opts Options) error {
	q := sqlcgen.New(pool)

	if err := truncateAll(ctx, pool); err != nil {
		return fmt.Errorf("truncate: %w", err)
	}
	if err := seedUsers(ctx, q, opts.cost()); err != nil {
		return fmt.Errorf("users: %w", err)
	}

	customers, err := seedCustomers(ctx, q)
	if err != nil {
		return fmt.Errorf("customers: %w", err)
	}

	cats, err := seedCategories(ctx, q)
	if err != nil {
		return fmt.Errorf("categories: %w", err)
	}
	if err := seedGovernance(ctx, q, cats); err != nil {
		return fmt.Errorf("governance: %w", err)
	}

	plans, err := seedPlans(ctx, q)
	if err != nil {
		return fmt.Errorf("plans: %w", err)
	}

	products, err := seedProducts(ctx, q, cats, plans)
	if err != nil {
		return fmt.Errorf("products: %w", err)
	}
	if err := seedUpsells(ctx, q, products); err != nil {
		return fmt.Errorf("upsell rules: %w", err)
	}
	if err := seedInventory(ctx, q, products); err != nil {
		return fmt.Errorf("inventory: %w", err)
	}
	if err := seedDealHealth(ctx, pool, q, customers); err != nil {
		return fmt.Errorf("deal health: %w", err)
	}
	return nil
}

func truncateAll(ctx context.Context, pool *pgxpool.Pool) error {
	// RESTART IDENTITY keeps generated references (Q-0001, SO-0001) stable
	// across reseeds, which matters when a demo script names them.
	_, err := pool.Exec(ctx, `
		TRUNCATE TABLE
			billing_schedules, payments, invoice_lines, invoices,
			backorders, fulfillment_lines, fulfillments, sales_orders,
			counter_offers, negotiation_messages, portal_tokens,
			deal_alerts, audit_logs, approval_requests,
			quotation_lines, quotations,
			stock_items, warehouses, idempotency_keys,
			upsell_rules, subscription_plans, approval_policies,
			category_ceilings, discount_tiers, products, categories,
			customers, users
		RESTART IDENTITY CASCADE`)
	return err
}

type userSpec struct {
	email, name, role, team string
}

func seedUsers(ctx context.Context, q *sqlcgen.Queries, cost int) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(DemoPassword), cost)
	if err != nil {
		return err
	}

	for _, u := range []userSpec{
		{"admin@dealflow360.test", "Priya Admin", "ADMIN", "hq"},
		{"manager@dealflow360.test", "M. Shah", "MANAGER", "west"},
		{"finance@dealflow360.test", "R. Iyer", "FINANCE", "hq"},
		{"rep@dealflow360.test", "J. Rao", "REP", "west"},
		{"rep2@dealflow360.test", "Kiran Nair", "REP", "west"},
	} {
		if _, err := q.CreateUser(ctx, sqlcgen.CreateUserParams{
			Email:        u.email,
			PasswordHash: string(hash),
			FullName:     u.name,
			Role:         u.role,
			SalesTeam:    u.team,
		}); err != nil {
			return err
		}
	}
	return nil
}

type customerIDs struct{ acme, beta, gamma, delta int64 }

func seedCustomers(ctx context.Context, q *sqlcgen.Queries) (customerIDs, error) {
	var out customerIDs
	for _, c := range []struct {
		name, email, tier string
		city              string
		lat, lng          string
		dst               *int64
	}{
		// Delivery cities, so a shipment has somewhere to go on the map.
		{"Acme Corporation", "buyer@acme.test", "GOLD", "New Delhi", "28.613900", "77.209000", &out.acme},
		{"Beta Industries", "buyer@beta.test", "SILVER", "Pune", "18.520400", "73.856700", &out.beta},
		{"Gamma Retail", "buyer@gamma.test", "BRONZE", "Chennai", "13.082700", "80.270700", &out.gamma},
		{"Delta Labs", "buyer@delta.test", "SILVER", "Hyderabad", "17.385000", "78.486700", &out.delta},
	} {
		city := c.city
		lat, lng := decNull(c.lat), decNull(c.lng)
		row, err := q.CreateCustomer(ctx, sqlcgen.CreateCustomerParams{
			Name: c.name, Email: c.email, Tier: c.tier,
			City: &city, Latitude: lat, Longitude: lng,
		})
		if err != nil {
			return out, err
		}
		*c.dst = row.ID
	}
	return out, nil
}

type categoryIDs struct{ hardware, services, subscriptions int64 }

func seedCategories(ctx context.Context, q *sqlcgen.Queries) (categoryIDs, error) {
	var out categoryIDs
	for _, c := range []struct {
		name string
		dst  *int64
	}{
		{"Hardware", &out.hardware},
		{"Services", &out.services},
		{"Subscriptions", &out.subscriptions},
	} {
		row, err := q.CreateCategory(ctx, c.name)
		if err != nil {
			return out, err
		}
		*c.dst = row.ID
	}
	return out, nil
}

func seedGovernance(ctx context.Context, q *sqlcgen.Queries, cats categoryIDs) error {
	for _, t := range []struct {
		tier, pct string
	}{
		{"BRONZE", "5"},
		{"SILVER", "10"},
		{"GOLD", "15"},
	} {
		if _, err := q.UpsertDiscountTier(ctx, sqlcgen.UpsertDiscountTierParams{
			Tier: t.tier, MaxDiscountPct: dec(t.pct),
		}); err != nil {
			return err
		}
	}

	// Services carry thin margins, so they allow less than the tier would.
	// This is what makes a Gold customer's Service line breach at 18%.
	for _, c := range []struct {
		id  int64
		pct string
	}{
		{cats.hardware, "15"},
		{cats.services, "10"},
		{cats.subscriptions, "12"},
	} {
		if _, err := q.UpsertCategoryCeiling(ctx, sqlcgen.UpsertCategoryCeilingParams{
			CategoryID: c.id, MaxDiscountPct: dec(c.pct),
		}); err != nil {
			return err
		}
	}

	// Any breach at all needs a manager; a blended 5 or a single line 10
	// points out escalates to finance.
	for _, p := range []sqlcgen.CreateApprovalPolicyParams{
		{
			Name:       "Any ceiling breach requires a manager",
			MinBlended: dec("0.001"), MinLineOverage: dec("0.001"),
			RequiresManager: true, RequiresFinance: false,
		},
		{
			Name:       "High blended risk or a severe single line requires finance",
			MinBlended: dec("5"), MinLineOverage: dec("10"),
			RequiresManager: true, RequiresFinance: true,
		},
	} {
		if _, err := q.CreateApprovalPolicy(ctx, p); err != nil {
			return err
		}
	}
	return nil
}

type planIDs struct{ monthly, yearly int64 }

func seedPlans(ctx context.Context, q *sqlcgen.Queries) (planIDs, error) {
	var out planIDs
	for _, p := range []struct {
		name, period string
		cycles       int32
		dst          *int64
	}{
		{"Monthly Support", "MONTHLY", 12, &out.monthly},
		{"Annual Platform", "YEARLY", 3, &out.yearly},
	} {
		row, err := q.CreateSubscriptionPlan(ctx, sqlcgen.CreateSubscriptionPlanParams{
			Name: p.name, Period: p.period, Cycles: p.cycles,
		})
		if err != nil {
			return out, err
		}
		*p.dst = row.ID
	}
	return out, nil
}

type productIDs struct {
	laptop, docking, monitor int64
	setupSvc, training       int64
	support, platform        int64
}

func seedProducts(ctx context.Context, q *sqlcgen.Queries, cats categoryIDs, _ planIDs) (productIDs, error) {
	var out productIDs

	specs := []struct {
		sku, name  string
		catID      int64
		price, cst string
		promoted   bool
		sub        bool
		dst        *int64
	}{
		{"HW-LAPTOP", "Business Laptop", cats.hardware, "45000", "31000", false, false, &out.laptop},
		{"HW-DOCK", "Docking Station", cats.hardware, "8000", "5200", true, false, &out.docking},
		{"HW-MON27", "27\" Monitor", cats.hardware, "18000", "13500", false, false, &out.monitor},
		{"SV-SETUP", "Onsite Setup Service", cats.services, "15000", "11000", false, false, &out.setupSvc},
		{"SV-TRAIN", "Team Training Day", cats.services, "25000", "18000", true, false, &out.training},
		{"SB-SUPPORT", "Support Plan (per seat)", cats.subscriptions, "5000", "2000", false, true, &out.support},
		{"SB-PLATFORM", "Platform Licence (per seat)", cats.subscriptions, "12000", "4800", false, true, &out.platform},
	}

	for _, s := range specs {
		row, err := q.CreateProduct(ctx, sqlcgen.CreateProductParams{
			CategoryID:     s.catID,
			Sku:            s.sku,
			Name:           s.name,
			Description:    s.name,
			Unit:           "unit",
			UnitPrice:      dec(s.price),
			UnitCost:       dec(s.cst),
			TaxRatePct:     dec("18"),
			IsPromoted:     s.promoted,
			IsSubscription: s.sub,
		})
		if err != nil {
			return out, err
		}
		*s.dst = row.ID
	}
	return out, nil
}

func seedUpsells(ctx context.Context, q *sqlcgen.Queries, p productIDs) error {
	for _, r := range []sqlcgen.CreateUpsellRuleParams{
		{ProductID: p.laptop, SuggestedProductID: p.docking, Score: dec("0.85"), MinMarginPct: dec("15")},
		{ProductID: p.laptop, SuggestedProductID: p.monitor, Score: dec("0.72"), MinMarginPct: dec("15")},
		{ProductID: p.laptop, SuggestedProductID: p.support, Score: dec("0.64"), MinMarginPct: dec("20")},
		{ProductID: p.setupSvc, SuggestedProductID: p.training, Score: dec("0.58"), MinMarginPct: dec("15")},
		{ProductID: p.support, SuggestedProductID: p.platform, Score: dec("0.51"), MinMarginPct: dec("20")},
	} {
		if _, err := q.CreateUpsellRule(ctx, r); err != nil {
			return err
		}
	}
	return nil
}

func seedInventory(ctx context.Context, q *sqlcgen.Queries, p productIDs) error {
	type whSpec struct {
		name, weight string
		city         string
		lat, lng     string
		stock        map[int64]int64
	}

	// Laptops are deliberately scarce: 5 at Main and 1 at East means an order
	// for 7 splits across two warehouses and backorders exactly one unit.
	warehouses := []whSpec{
		{"Main Warehouse", "1.0", "Mumbai", "19.076000", "72.877700", map[int64]int64{
			p.laptop: 5, p.docking: 10, p.monitor: 6, p.setupSvc: 50, p.training: 20,
		}},
		{"East Depot", "1.4", "Kolkata", "22.572600", "88.363900", map[int64]int64{
			p.laptop: 1, p.docking: 10, p.monitor: 4, p.setupSvc: 30, p.training: 10,
		}},
		{"South Hub", "1.2", "Bengaluru", "12.971600", "77.594600", map[int64]int64{
			p.docking: 3, p.monitor: 2,
		}},
	}

	for _, w := range warehouses {
		city := w.city
		wh, err := q.CreateWarehouse(ctx, sqlcgen.CreateWarehouseParams{
			Name: w.name, ShippingCostWeight: dec(w.weight),
			City: &city, Latitude: decNull(w.lat), Longitude: decNull(w.lng),
		})
		if err != nil {
			return err
		}
		for productID, qty := range w.stock {
			if _, err := q.UpsertStock(ctx, sqlcgen.UpsertStockParams{
				WarehouseID: wh.ID, ProductID: productID, OnHand: qty,
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

// seedDealHealth creates the two true positives the dashboard shows: a quote
// nobody has touched in eleven days, and a rep whose discounting on one deal
// is far above their own baseline.
func seedDealHealth(ctx context.Context, pool *pgxpool.Pool, q *sqlcgen.Queries, c customerIDs) error {
	const repJRao, repKiran int64 = 4, 5

	stalled, err := q.CreateQuotation(ctx, sqlcgen.CreateQuotationParams{
		Reference: "Q-9001", CustomerID: c.gamma, RepID: repJRao,
	})
	if err != nil {
		return err
	}
	if _, err := pool.Exec(ctx, `
		UPDATE quotations
		SET status = 'SENT', list_subtotal = 240000, net_subtotal = 240000,
		    grand_total = 240000, last_activity_at = now() - interval '11 days'
		WHERE id = $1`, stalled.ID); err != nil {
		return err
	}

	// Kiran's baseline: three modest deals at roughly 4%.
	for i, ref := range []string{"Q-9002", "Q-9003", "Q-9004"} {
		base, err := q.CreateQuotation(ctx, sqlcgen.CreateQuotationParams{
			Reference: ref, CustomerID: c.beta, RepID: repKiran,
		})
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, `
			UPDATE quotations
			SET status = 'CONFIRMED', list_subtotal = 100000,
			    discount_total = $2::numeric,
			    net_subtotal   = 100000 - $2::numeric,
			    grand_total    = 100000 - $2::numeric,
			    created_at     = now() - make_interval(days => $3::int)
			WHERE id = $1`, base.ID, 3500+i*500, 30-i*5); err != nil {
			return err
		}
	}

	// The outlier: 14% against a ~4% baseline.
	anomaly, err := q.CreateQuotation(ctx, sqlcgen.CreateQuotationParams{
		Reference: "Q-9005", CustomerID: c.delta, RepID: repKiran,
	})
	if err != nil {
		return err
	}
	if _, err := pool.Exec(ctx, `
		UPDATE quotations
		SET status = 'PENDING_APPROVAL', list_subtotal = 200000,
		    discount_total = 28000, net_subtotal = 172000, grand_total = 172000,
		    blended_risk_score = 6.2, max_line_overage = 9,
		    required_level = 'MANAGER_FINANCE',
		    last_activity_at = now() - interval '2 days'
		WHERE id = $1`, anomaly.ID); err != nil {
		return err
	}

	if _, err := q.CreateDealAlert(ctx, sqlcgen.CreateDealAlertParams{
		QuotationID: stalled.ID,
		AlertType:   "STALLED",
		Severity:    "HIGH",
		Detail:      "No activity for 11 days while awaiting customer response",
		Metric:      dec("11"),
	}); err != nil {
		return err
	}
	if _, err := q.CreateDealAlert(ctx, sqlcgen.CreateDealAlertParams{
		QuotationID: anomaly.ID,
		AlertType:   "DISCOUNT_ANOMALY",
		Severity:    "HIGH",
		Detail:      "14.0% discount against this rep's 4.0% baseline (3.5x)",
		Metric:      dec("3.5"),
	}); err != nil {
		return err
	}

	_ = time.Now
	return nil
}

// Bulk inflates the dataset so query plans and budgets can be checked against
// something the planner takes seriously.
//
// Postgres will sequentially scan a small table no matter how good the index
// is, because scanning twelve rows is cheaper than consulting a tree. Proving
// an index is used, and that a page of results costs the same as the table
// grows, needs enough rows for the planner to care.
//
// The rows are deliberately unremarkable: they exist to be numerous, not to
// be demonstrated. The handful of seeded quotations that carry the demo are
// created by Run and are left untouched.
func Bulk(ctx context.Context, pool *pgxpool.Pool, quotations int, linesEach int) error {
	if quotations <= 0 {
		return nil
	}
	if linesEach <= 0 {
		linesEach = 5
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO quotations (
			reference, customer_id, rep_id, status,
			list_subtotal, discount_total, net_subtotal, grand_total,
			cost_total, margin_amount, margin_pct,
			blended_risk_score, last_activity_at, created_at
		)
		SELECT
			'Q-B' || g,
			(SELECT id FROM customers ORDER BY id LIMIT 1 OFFSET (g % 4)),
			4 + (g % 2),
			(ARRAY['DRAFT','PENDING_APPROVAL','SENT','CONFIRMED'])[1 + (g % 4)],
			100000, 8000, 92000, 92000,
			64000, 28000, 30.43,
			(g % 7),
			now() - make_interval(days => (g % 45)),
			now() - make_interval(days => (g % 90))
		FROM generate_series(1, $1) g`, quotations); err != nil {
		return fmt.Errorf("bulk quotations: %w", err)
	}

	if _, err := pool.Exec(ctx, `
		INSERT INTO quotation_lines (
			quotation_id, product_id, category_id, position,
			qty, unit_price, unit_cost, line_discount_pct,
			list_value, discount_amount, net_amount, cost_amount,
			margin_amount, margin_pct, effective_discount_pct
		)
		SELECT
			q.id, p.id, p.category_id, s,
			2, p.unit_price, p.unit_cost, 8,
			2 * p.unit_price,
			2 * p.unit_price * 0.08,
			2 * p.unit_price * 0.92,
			2 * p.unit_cost,
			(2 * p.unit_price * 0.92) - (2 * p.unit_cost),
			25, 8
		FROM quotations q
		CROSS JOIN generate_series(1, $1) s
		JOIN LATERAL (
			SELECT id, category_id, unit_price, unit_cost
			FROM products WHERE is_active
			ORDER BY id LIMIT 1 OFFSET ((q.id + s) % 5)
		) p ON true
		WHERE q.reference LIKE 'Q-B%'`, linesEach); err != nil {
		return fmt.Errorf("bulk quotation lines: %w", err)
	}

	// The planner chooses badly against stale statistics, so a scale test
	// that skipped this would measure the wrong thing.
	if _, err := pool.Exec(ctx, `ANALYZE quotations, quotation_lines`); err != nil {
		return fmt.Errorf("analyze: %w", err)
	}
	return nil
}
