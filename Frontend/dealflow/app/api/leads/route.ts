import { promises as fs } from "fs";
import path from "path";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORE_PATH = path.join(process.cwd(), "data", "leads.json");

type Lead = { email: string; capturedAt: string };

async function readLeads(): Promise<Lead[]> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return JSON.parse(raw) as Lead[];
  } catch {
    return [];
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

  const leads = await readLeads();
  if (!leads.some((l) => l.email === email)) {
    leads.push({ email, capturedAt: new Date().toISOString() });
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    await fs.writeFile(STORE_PATH, JSON.stringify(leads, null, 2));
  }

  return Response.json({ ok: true });
}
