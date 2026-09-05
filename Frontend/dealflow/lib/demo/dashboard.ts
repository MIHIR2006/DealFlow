export type QuoteStatus =
  | "Draft"
  | "Pending Manager"
  | "Pending Finance"
  | "Approved"
  | "Under negotiation"
  | "Stalled";

export type QuoteRow = {
  id: string;
  customer: string;
  status: QuoteStatus;
  amount: string;
  risk: string;
  overage: boolean;
  owner: string;
  updated: string;
};

export const quotes: QuoteRow[] = [
  {
    id: "Q-1042",
    customer: "Acme Corp",
    status: "Pending Finance",
    amount: "₹4,82,000",
    risk: "5.6%",
    overage: true,
    owner: "J. Rao",
    updated: "Aug 22",
  },
  {
    id: "Q-1031",
    customer: "Beta Industries",
    status: "Under negotiation",
    amount: "₹2,40,000",
    risk: "3.2%",
    overage: false,
    owner: "A. Mehta",
    updated: "Aug 21",
  },
  {
    id: "Q-1018",
    customer: "Northwind",
    status: "Stalled",
    amount: "₹1,10,000",
    risk: "14%",
    overage: true,
    owner: "J. Rao",
    updated: "9d idle",
  },
  {
    id: "Q-0994",
    customer: "Helios Labs",
    status: "Approved",
    amount: "₹6,05,000",
    risk: "0%",
    overage: false,
    owner: "J. Rao",
    updated: "Aug 20",
  },
  {
    id: "Q-0988",
    customer: "Cedar & Co",
    status: "Pending Manager",
    amount: "₹87,500",
    risk: "2.1%",
    overage: true,
    owner: "S. Iyer",
    updated: "Aug 20",
  },
  {
    id: "Q-0971",
    customer: "Orbit Freight",
    status: "Draft",
    amount: "₹3,12,000",
    risk: "0%",
    overage: false,
    owner: "A. Mehta",
    updated: "Aug 19",
  },
];

export const kpis = {
  pendingApprovals: 4,
  openQuotations: 12,
  atRisk: 3,
  pipeline: "₹18.4L",
  avgMargin: "31%",
  blended: "5.6%",
};

export const activity = [
  {
    id: "a1",
    text: "Acme Corp quotation approved by Finance",
    detail: "Q-1042 · step 2 of 2",
    when: "2h ago",
  },
  {
    id: "a2",
    text: "Beta Industries requested a discount change",
    detail: "Portal counter-offer · Setup Service 20%",
    when: "5h ago",
  },
  {
    id: "a3",
    text: "East Depot stock updated for Order #2291",
    detail: "Backorder consolidate prompt is waiting",
    when: "Yesterday",
  },
];

export const mix = [
  { label: "Hardware", value: 45, color: "var(--color-chart-terracotta)" },
  { label: "Service", value: 35, color: "var(--color-chart-rose)" },
  { label: "Recurring", value: 20, color: "var(--color-chart-lilac)" },
];

export const weeklyApprovals = [
  { label: "W1", submitted: 6, manager: 4, finance: 2 },
  { label: "W2", submitted: 8, manager: 5, finance: 3 },
  { label: "W3", submitted: 7, manager: 6, finance: 4 },
  { label: "W4", submitted: 10, manager: 7, finance: 5 },
  { label: "W5", submitted: 9, manager: 8, finance: 6 },
  { label: "W6", submitted: 12, manager: 9, finance: 7 },
];

export type DashFilter = "all" | "pending" | "open" | "risk";

export function filterQuotes(list: QuoteRow[], filter: DashFilter) {
  if (filter === "pending") {
    return list.filter(
      (q) => q.status === "Pending Manager" || q.status === "Pending Finance",
    );
  }
  if (filter === "open") {
    return list.filter(
      (q) => q.status !== "Approved" && q.status !== "Stalled",
    );
  }
  if (filter === "risk") {
    return list.filter((q) => q.overage || q.status === "Stalled");
  }
  return list;
}
