export const ROLES = {
  rep: {
    id: "rep",
    account: "Sales Rep",
    title: "I'm a Sales Rep",
    body: "Build quotations, apply line discounts, and watch live margin and blended risk — the engine routes approval for you.",
    image: "/auth/rep.jpg",
    alt: "Two characters with a quotation clipboard",
  },
  manager: {
    id: "manager",
    account: "Approver",
    title: "I approve deals",
    body: "Review why a quote was flagged, return it for revision, or send it through. Manager and Finance sit on the same chain.",
    image: "/auth/approver.jpg",
    alt: "A character bringing a quote to a reviewer at a desk",
  },
  finance: {
    id: "finance",
    account: "Finance",
    title: "I'm in Finance",
    body: "Second-level approval, warehouse overrides, billing, and credit notes.",
  },
  admin: {
    id: "admin",
    account: "Admin",
    title: "I'm an Admin",
    body: "Products, tiers, warehouses, plans, and the approval policy itself.",
  },
} as const;

export type RoleId = keyof typeof ROLES;

export function parseRole(value: string | null | undefined): RoleId | null {
  if (!value) return null;
  return value in ROLES ? (value as RoleId) : null;
}
