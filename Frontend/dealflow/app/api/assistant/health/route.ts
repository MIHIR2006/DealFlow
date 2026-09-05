// Whether the customer portal should offer the AI assistant at all.
//
// The portal calls this once on mount. An unset AI_SALESMAN_URL, an
// unreachable service, or one running without an LLM credential all resolve
// to the same answer -- not available -- so the portal renders no control
// rather than one that fails when a customer uses it.

const ASSISTANT_URL = process.env.AI_SALESMAN_URL;

const TIMEOUT_MS = 2000;

export async function GET() {
  if (!ASSISTANT_URL) {
    return Response.json({ available: false });
  }

  try {
    const res = await fetch(`${ASSISTANT_URL.replace(/\/$/, "")}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return Response.json({ available: false });

    const body = (await res.json()) as { configured?: boolean };
    return Response.json({ available: body.configured === true });
  } catch {
    return Response.json({ available: false });
  }
}
