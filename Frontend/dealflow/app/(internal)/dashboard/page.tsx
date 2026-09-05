"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  MessageSquare,
  Truck,
  Receipt,
  Package,
  Warehouse,
  SlidersHorizontal,
  Repeat,
  BarChart3,
  ShieldCheck,
  CheckCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { RiskBadge } from "@/components/ui/risk-badge";
import { useAuth, useFetch, inr } from "@/lib/hooks";
import type {
  Page,
  QuotationSummary,
  DealHealth,
  ApprovalInboxRow,
  OrderSummary,
  Invoice,
  Product,
  Warehouse as WarehouseType,
  SubscriptionPlan,
  GovernanceSnapshot,
} from "@/lib/types";

const ROLE_LABEL: Record<string, string> = {
  REP: "Sales Rep",
  MANAGER: "Sales Manager",
  FINANCE: "Finance & Ops",
  ADMIN: "Administrator",
};

// What each role is here to do, taken from the role definitions in the problem
// statement. This is the line under the greeting, and it is why two roles never
// see the same dashboard.
const ROLE_BRIEF: Record<string, string> = {
  REP: "Build quotations, track approval and fulfillment progress, and respond to customer negotiation requests.",
  MANAGER:
    "Review discounts that exceed thresholds, configure tiers and approval chains, and monitor deal health.",
  FINANCE:
    "Handle second-level approvals, decide warehouse splits and backorders, and reconcile recurring billing.",
  ADMIN:
    "Manage catalog, discount tiers, warehouses and subscription plans, and review platform-wide analytics.",
};

// ---------------------------------------------------------------------------
// Shared presentation
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  hint,
  tone = "ink",
  icon: Icon,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "ink" | "ok" | "warn" | "bad";
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const toneClass =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  const hintClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : "text-mist";

  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-mist">{label}</p>
        {Icon ? <Icon className={`size-4 ${toneClass} group-hover:scale-110 transition-transform`} /> : null}
      </div>
      <p className={`mt-2 text-[30px] font-serif tracking-tight tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className={`mt-1 text-[12px] font-medium ${hintClass}`}>{hint}</p> : null}
    </>
  );

  const className = "group rounded-[20px] bg-white p-5 card-shadow transition-colors";
  return href ? (
    <Link href={href} className={`${className} hover:bg-white/60`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] bg-white p-6 card-shadow">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-ink/6">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? <p className="text-[12.5px] text-mist mt-0.5">{subtitle}</p> : null}
        </div>
        {action ? (
          <Link href={action.href} className="text-[13px] font-medium text-ink hover:underline">
            {action.label} &rarr;
          </Link>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[12.5px] text-mist">{children}</p>;
}

/** A compact quotation/order/invoice row shared by the role panels. */
function ListRow({
  href,
  primary,
  secondary,
  right,
  rightHint,
}: {
  href: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  right?: React.ReactNode;
  rightHint?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 hover:bg-cream/50 transition-colors"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink truncate">{primary}</p>
        {secondary ? <p className="text-[11.5px] text-mist truncate">{secondary}</p> : null}
      </div>
      <div className="shrink-0 text-right">
        {right}
        {rightHint ? <p className="text-[11px] text-mist mt-0.5">{rightHint}</p> : null}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role;

  const isRep = role === "REP";
  const isManager = role === "MANAGER";
  const isFinance = role === "FINANCE";
  const isAdmin = role === "ADMIN";

  // An approver is anyone who can act on the approvals inbox; deal health is
  // scoped the same way the backend scopes it.
  const isApprover = isManager || isFinance || isAdmin;

  const { data: quotesPage, loading: quotesLoading } = useFetch<Page<QuotationSummary>>(
    "/v1/quotations?limit=8",
  );
  const { data: health } = useFetch<DealHealth>(
    isApprover ? "/v1/dashboard/deal-health?limit=5" : null,
  );
  const { data: inbox } = useFetch<Page<ApprovalInboxRow>>(isApprover ? "/v1/approvals?limit=6" : null);
  const { data: ordersPage } = useFetch<Page<OrderSummary>>(
    isRep || isFinance ? "/v1/orders?limit=20" : null,
  );
  const { data: invoicesPage } = useFetch<Page<Invoice>>(isFinance ? "/v1/invoices?limit=50" : null);

  // Admin owns backend setup, so its dashboard counts what has been set up.
  const { data: productsPage } = useFetch<Page<Product>>(isAdmin ? "/v1/products?limit=100" : null);
  const { data: warehousesPage } = useFetch<Page<WarehouseType>>(isAdmin ? "/v1/warehouses" : null);
  const { data: plansPage } = useFetch<Page<SubscriptionPlan>>(
    isAdmin ? "/v1/subscription-plans" : null,
  );
  const { data: governance } = useFetch<GovernanceSnapshot>(isAdmin ? "/v1/governance" : null);

  const quotes = useMemo(() => quotesPage?.data ?? [], [quotesPage]);
  const orders = useMemo(() => ordersPage?.data ?? [], [ordersPage]);
  const invoices = useMemo(() => invoicesPage?.data ?? [], [invoicesPage]);
  const inboxRows = useMemo(() => inbox?.data ?? [], [inbox]);

  const pipelineValue = useMemo(
    () => quotes.reduce((sum, q) => sum + (parseFloat(q.grand_total) || 0), 0),
    [quotes],
  );

  // Rep: the three things the role is accountable for.
  const awaitingApproval = quotes.filter((q) => q.status === "PENDING_APPROVAL");
  const negotiating = quotes.filter(
    (q) => q.status === "UNDER_NEGOTIATION" || q.status === "SENT",
  );
  const inFulfillment = orders.filter((o) => o.status !== "FULFILLED" && o.status !== "CANCELLED");

  // Finance: splits and backorders waiting on a decision, and money owed.
  const backordered = orders.filter((o) => o.backorder_count > 0);
  const openInvoices = invoices.filter((i) => i.status !== "PAID" && i.status !== "DRAFT");
  const outstanding = openInvoices.reduce((sum, i) => sum + (parseFloat(i.outstanding) || 0), 0);
  const recurringInvoices = invoices.filter((i) => i.kind === "RECURRING");

  const atRiskCount = (health?.stalled.length ?? 0) + (health?.discount_anomalies.length ?? 0);

  // Finance is a second-level approver; the inbox already only returns steps
  // that are waiting on this user's role.
  const myApprovals = inboxRows.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[13px] text-mist font-medium">
            Overview · {user ? (ROLE_LABEL[user.role] ?? user.role) : ""}
          </p>
          <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px] text-ink">
            Good day{user ? `, ${user.name}` : ""}
          </h1>
          <p className="mt-1 text-[14.5px] text-mist max-w-[620px]">
            {role ? ROLE_BRIEF[role] : ""}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isApprover ? (
            <Link
              href="/approvals"
              className="rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-[13px] font-medium text-ink hover:bg-white transition-colors"
            >
              Approvals ({myApprovals})
            </Link>
          ) : null}
          {isAdmin ? (
            <Link
              href="/reports"
              className="rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-[13px] font-medium text-ink hover:bg-white transition-colors"
            >
              Platform analytics
            </Link>
          ) : null}
          {/* Finance does not build quotations. */}
          {!isFinance ? (
            <Link
              href="/quotations/new"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone shadow-sm hover:bg-ink/90 transition-all"
            >
              <Plus className="size-4" />
              New Quotation
            </Link>
          ) : null}
        </div>
      </div>

      {/* ---- Stat cards, one set per role -------------------------------- */}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isRep ? (
          <>
            <StatCard
              label="My pipeline"
              value={inr(pipelineValue)}
              hint={`across ${quotes.length} recent deals`}
              icon={ArrowUpRight}
            />
            <StatCard
              label="Awaiting approval"
              value={awaitingApproval.length}
              hint="tracking, no action needed"
              tone="warn"
              icon={Clock}
              href="/quotations"
            />
            <StatCard
              label="Needs my reply"
              value={negotiating.length}
              hint="customer negotiation"
              tone="bad"
              icon={MessageSquare}
              href="/quotations"
            />
            <StatCard
              label="In fulfillment"
              value={inFulfillment.length}
              hint="orders in progress"
              icon={Truck}
              href="/fulfillment"
            />
          </>
        ) : null}

        {isManager ? (
          <>
            <StatCard
              label="Awaiting my approval"
              value={myApprovals}
              hint="over discount threshold"
              tone="warn"
              icon={Clock}
              href="/approvals"
            />
            <StatCard
              label="At-risk deals"
              value={atRiskCount}
              hint={`${health?.stalled.length ?? 0} stalled · ${health?.discount_anomalies.length ?? 0} anomaly`}
              tone="bad"
              icon={AlertTriangle}
              href="/deal-health"
            />
            <StatCard
              label="Team pipeline"
              value={inr(pipelineValue)}
              hint={`across ${quotes.length} recent deals`}
              icon={ArrowUpRight}
            />
            <StatCard
              label="Discount tiers"
              value="Configure"
              hint="tiers & approval chains"
              icon={SlidersHorizontal}
              href="/governance"
            />
          </>
        ) : null}

        {isFinance ? (
          <>
            <StatCard
              label="Second-level approvals"
              value={myApprovals}
              hint="high-risk discounts"
              tone="warn"
              icon={Clock}
              href="/approvals"
            />
            <StatCard
              label="Backorder decisions"
              value={backordered.length}
              hint="splits awaiting action"
              tone="bad"
              icon={Truck}
              href="/fulfillment"
            />
            <StatCard
              label="Outstanding"
              value={inr(outstanding)}
              hint={`${openInvoices.length} open invoices`}
              icon={Receipt}
              href="/invoices"
            />
            <StatCard
              label="Recurring billing"
              value={recurringInvoices.length}
              hint="subscription invoices"
              icon={Repeat}
              href="/subscriptions"
            />
          </>
        ) : null}

        {isAdmin ? (
          <>
            <StatCard
              label="Products"
              value={productsPage?.data?.length ?? 0}
              hint="catalog & price lists"
              icon={Package}
              href="/products"
            />
            <StatCard
              label="Warehouses"
              value={warehousesPage?.data?.length ?? 0}
              hint="stock locations"
              icon={Warehouse}
              href="/products"
            />
            <StatCard
              label="Subscription plans"
              value={plansPage?.data?.length ?? 0}
              hint="recurring products"
              icon={Repeat}
              href="/products"
            />
            <StatCard
              label="Discount tiers"
              value={governance?.tiers?.length ?? 0}
              hint={`config v${governance?.version ?? "—"}`}
              icon={ShieldCheck}
              href="/governance"
            />
          </>
        ) : null}
      </div>

      {/* ---- Role-specific working panels -------------------------------- */}

      {isRep ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel
            title="Customer negotiation requests"
            subtitle="Quotations with the customer right now."
            action={{ href: "/quotations", label: "All quotations" }}
          >
            {negotiating.length === 0 ? (
              <EmptyRow>Nothing with a customer at the moment.</EmptyRow>
            ) : (
              <div className="space-y-1">
                {negotiating.slice(0, 5).map((q) => (
                  <ListRow
                    key={q.id}
                    href={`/quotations/${q.id}`}
                    primary={`${q.reference} · ${q.customer_name}`}
                    secondary={`Last activity ${new Date(q.last_activity_at).toLocaleDateString()}`}
                    right={<StatusBadge status={q.status} size="sm" />}
                    rightHint={inr(q.grand_total)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Approval & fulfillment progress"
            subtitle="Where your deals are in the pipeline."
            action={{ href: "/fulfillment", label: "Fulfillment" }}
          >
            {awaitingApproval.length === 0 && inFulfillment.length === 0 ? (
              <EmptyRow>Nothing awaiting approval or in fulfillment.</EmptyRow>
            ) : (
              <div className="space-y-1">
                {awaitingApproval.slice(0, 3).map((q) => (
                  <ListRow
                    key={`q-${q.id}`}
                    href={`/quotations/${q.id}`}
                    primary={`${q.reference} · ${q.customer_name}`}
                    secondary="Waiting on internal approval"
                    right={<StatusBadge status={q.status} size="sm" />}
                  />
                ))}
                {inFulfillment.slice(0, 3).map((o) => (
                  <ListRow
                    key={`o-${o.id}`}
                    href={`/fulfillment/${o.id}`}
                    primary={`${o.reference} · ${o.customer_name}`}
                    secondary={`${o.shipment_count} shipment(s)${
                      o.backorder_count > 0 ? ` · ${o.backorder_count} backordered` : ""
                    }`}
                    right={<StatusBadge status={o.status} size="sm" />}
                  />
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {isManager || isFinance ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel
            title={isFinance ? "Second-level approvals" : "Awaiting your review"}
            subtitle={
              isFinance
                ? "High-risk discounts escalated past the manager step."
                : "Quotations that exceeded a discount threshold."
            }
            action={{ href: "/approvals", label: "Open inbox" }}
          >
            {inboxRows.length === 0 ? (
              <EmptyRow>Nothing waiting on you.</EmptyRow>
            ) : (
              <div className="space-y-1">
                {inboxRows.slice(0, 5).map((row) => (
                  <ListRow
                    key={row.id}
                    href={`/approvals/${row.quotation_id}`}
                    primary={`${row.reference} · ${row.customer_name}`}
                    secondary={`${row.rep_name} · step ${row.step} · ${row.required_role}`}
                    right={
                      <RiskBadge
                        score={row.blended_risk_score}
                        requiredLevel={row.required_level}
                        size="sm"
                      />
                    }
                    rightHint={inr(row.grand_total)}
                  />
                ))}
              </div>
            )}
          </Panel>

          {isManager ? (
            <Panel
              title="Deal health"
              subtitle="Stalled deals and discount anomalies."
              action={{ href: "/deal-health", label: "Health center" }}
            >
              {atRiskCount === 0 ? (
                <EmptyRow>No stalled deals or discount anomalies right now.</EmptyRow>
              ) : (
                <div className="space-y-1">
                  {(health?.stalled ?? []).slice(0, 3).map((s) => (
                    <ListRow
                      key={`s-${s.quotation_id}`}
                      href={`/quotations/${s.quotation_id}`}
                      primary={`Stalled · ${s.customer_name}`}
                      secondary={`${s.reference}: no activity for ${s.days_inactive} days`}
                      right={
                        <span className="rounded-full tone-warn px-2 py-0.5 text-[11px] font-semibold text-warn">
                          Stalled
                        </span>
                      }
                    />
                  ))}
                  {(health?.discount_anomalies ?? []).slice(0, 3).map((a) => (
                    <ListRow
                      key={`a-${a.quotation_id}`}
                      href={`/quotations/${a.quotation_id}`}
                      primary={`Discount spike · ${a.customer_name}`}
                      secondary={`${a.rep_name} gave ${a.discount_pct}% vs ${a.baseline_pct}% average`}
                      right={
                        <span className="rounded-full tone-bad px-2 py-0.5 text-[11px] font-semibold text-bad">
                          Anomaly
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </Panel>
          ) : (
            <Panel
              title="Fulfillment & billing"
              subtitle="Warehouse splits, backorders, and money owed."
              action={{ href: "/invoices", label: "All invoices" }}
            >
              {backordered.length === 0 && openInvoices.length === 0 ? (
                <EmptyRow>No backorders or open invoices.</EmptyRow>
              ) : (
                <div className="space-y-1">
                  {backordered.slice(0, 3).map((o) => (
                    <ListRow
                      key={`b-${o.id}`}
                      href={`/fulfillment/${o.id}`}
                      primary={`${o.reference} · ${o.customer_name}`}
                      secondary={`${o.backorder_count} line(s) backordered`}
                      right={<StatusBadge status={o.status} size="sm" />}
                    />
                  ))}
                  {openInvoices.slice(0, 3).map((i) => (
                    <ListRow
                      key={`i-${i.id}`}
                      href={`/invoices/${i.id}`}
                      primary={`${i.reference} · ${i.customer_name ?? ""}`}
                      secondary={i.kind === "RECURRING" ? "Recurring" : "One-time"}
                      right={<StatusBadge status={i.status} size="sm" />}
                      rightHint={`${inr(i.outstanding)} due`}
                    />
                  ))}
                </div>
              )}
            </Panel>
          )}
        </div>
      ) : null}

      {isAdmin ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Backend setup" subtitle="Everything the pricing engine reads.">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { href: "/products", label: "Products & price lists", icon: Package },
                { href: "/products", label: "Warehouses & stock", icon: Warehouse },
                { href: "/products", label: "Subscription plans", icon: Repeat },
                { href: "/governance", label: "Discount tiers & chains", icon: SlidersHorizontal },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-[16px] border border-ink/8 px-3.5 py-3 text-[12.5px] font-medium text-ink hover:bg-cream/50 transition-colors"
                >
                  <item.icon className="size-4 text-mist shrink-0" />
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1.5 rounded-[16px] tone-ok px-3.5 py-2.5 text-[12px] text-ok">
              <CheckCircle className="size-3.5 shrink-0" />
              Governance config v{governance?.version ?? "—"} is live and auto-routing approvals.
            </div>
          </Panel>

          <Panel
            title="Platform-wide analytics"
            subtitle="Every rep, every team."
            action={{ href: "/reports", label: "Full report" }}
          >
            {health ? (
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "Pipeline value", value: inr(health.summary.pipeline_value) },
                  { label: "Won value", value: inr(health.summary.won_value) },
                  { label: "Avg margin", value: `${health.summary.avg_margin_pct}%` },
                  { label: "Awaiting approval", value: health.summary.awaiting_approval },
                  { label: "Quotations", value: health.summary.total_quotations },
                  { label: "Avg risk score", value: `${health.summary.avg_risk_score}%` },
                ].map((m) => (
                  <div key={m.label} className="rounded-[16px] bg-cream/40 px-3.5 py-3">
                    <p className="text-[11.5px] text-mist">{m.label}</p>
                    <p className="text-[16px] font-semibold text-ink tabular-nums mt-0.5">{m.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRow>Loading platform metrics&hellip;</EmptyRow>
            )}
            <Link
              href="/deal-health"
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-ink/5 py-2 text-[12.5px] font-medium text-ink hover:bg-ink/10 transition-colors"
            >
              <BarChart3 className="size-3.5" /> Deal health center ({atRiskCount} at risk)
            </Link>
          </Panel>
        </div>
      ) : null}

      {/* ---- Recent deal flow, scoped by the backend to the role ---------- */}

      <div className="rounded-[24px] bg-white card-shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-ink/6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">
              {isRep ? "My recent deals" : isManager ? "Team deal flow" : "Recent deal flow"}
            </h2>
            <p className="text-[12.5px] text-mist">
              {isRep
                ? "Open a quotation to edit lines, apply discounts, or add upsell items."
                : "Click any row to open the full quotation and its governance trail."}
            </p>
          </div>
          <Link href="/quotations" className="text-[13px] font-medium text-ink hover:underline">
            View all &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11.5px] font-semibold text-mist bg-cream/50 border-b border-ink/6">
              <tr>
                <th className="px-6 py-3">Quote Ref</th>
                <th className="px-6 py-3">Customer &amp; Tier</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Grand Total</th>
                <th className="px-6 py-3">Blended Risk</th>
                {!isRep ? <th className="px-6 py-3">Owner</th> : null}
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {quotesLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-mist">
                    Loading&hellip;
                  </td>
                </tr>
              ) : quotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-mist">
                    No quotations yet.
                  </td>
                </tr>
              ) : (
                quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-cream/40 transition-colors cursor-pointer group">
                    <td className="px-6 py-3.5 font-medium text-ink">
                      <Link href={`/quotations/${q.id}`} className="hover:underline">
                        {q.reference}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{q.customer_name}</span>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded tone-warn text-warn">
                          {q.customer_tier}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusBadge status={q.status} size="sm" />
                    </td>
                    <td className="px-6 py-3.5 tabular-nums font-semibold text-ink">
                      {inr(q.grand_total)}
                    </td>
                    <td className="px-6 py-3.5">
                      <RiskBadge score={q.blended_risk_score} requiredLevel={q.required_level} size="sm" />
                    </td>
                    {!isRep ? <td className="px-6 py-3.5 text-mist">{q.rep_name}</td> : null}
                    <td className="px-6 py-3.5 text-right">
                      <Link
                        href={`/quotations/${q.id}`}
                        className="inline-flex items-center text-[12px] font-medium text-ink/70 group-hover:text-ink group-hover:underline"
                      >
                        {isRep ? "Open Builder" : "Review"} &rarr;
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
