import { promises as fs } from "fs";
import path from "path";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORE_PATH = path.join(process.cwd(), "data", "leads.json");
const BACKEND_URL = process.env.GO_BACKEND_URL;

/**
 * How long the same address is ignored after a successful submit.
 *
 * This exists only to absorb a double-click or an impatient second press. It
 * is deliberately short: somebody filling this form in again next week is
 * asking to be contacted again, and an address that was seen once must not be
 * silenced forever.
 */
const RESUBMIT_WINDOW_MS = 60_000;

type Lead = {
  email: string;
  capturedAt: string;
  /** Most recent submission, which is what the throttle above is measured on. */
  lastRequestedAt?: string;
  requests?: number;
};

async function readLeads(): Promise<Lead[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Lead[]) : [];
  } catch {
    return [];
  }
}

async function writeLeads(leads: Lead[]): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(leads, null, 2));
}

/**
 * Hand the enquiry to the Go backend, which owns the one mailer.
 *
 * Returns whether it was accepted, so the page can say what actually happened
 * instead of claiming a rep was notified when nothing left the building.
 */
async function notifySales(email: string): Promise<boolean> {
  if (!BACKEND_URL) {
    console.warn("lead notification skipped: GO_BACKEND_URL is not set");
    return false;
  }
  try {
    // GO_BACKEND_URL already carries the /api prefix, exactly as the generic
    // proxy in app/api/[...path] assumes.
    const res = await fetch(`${BACKEND_URL}/v1/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("lead notification rejected by backend", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("lead notification could not reach the backend", err);
    return false;
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!EMAIL_RE.test(email)) {
    return Response.json(
      { error: { code: "INVALID_EMAIL", message: "Enter a valid email address." } },
      { status: 400 },
    );
  }

  const now = new Date();
  const leads = await readLeads();
  const existing = leads.find((l) => l.email === email);

  // Every submission is somebody asking to be contacted, so every submission
  // notifies — the previous behaviour only mailed on an address the store had
  // never seen, which meant a returning prospect got a success message and
  // nobody was told anything.
  const lastAt = existing?.lastRequestedAt ?? existing?.capturedAt;
  const throttled =
    !!lastAt && now.getTime() - new Date(lastAt).getTime() < RESUBMIT_WINDOW_MS;

  const notified = throttled ? false : await notifySales(email);

  if (existing) {
    existing.lastRequestedAt = now.toISOString();
    existing.requests = (existing.requests ?? 1) + 1;
  } else {
    leads.push({
      email,
      capturedAt: now.toISOString(),
      lastRequestedAt: now.toISOString(),
      requests: 1,
    });
  }
  await writeLeads(leads);

  return Response.json({ ok: true, notified });
}
