import { NextRequest } from "next/server";

// Server-side proxy to the AI salesman service.
//
// The browser never reaches that service directly: it is an internal service
// on the compose network, and routing through here keeps it off the public
// surface. The portal token in the path is the only credential involved, and
// it is passed through untouched -- the assistant service hands it to the
// backend, which resolves exactly one quotation from it. Nothing here can
// widen what a token reaches.

const ASSISTANT_URL = process.env.AI_SALESMAN_URL;

// Generous next to the API proxy's default: a turn involves a model call and
// one or more backend round trips.
const TIMEOUT_MS = 45_000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!ASSISTANT_URL) {
    return Response.json(
      { error: { code: "ASSISTANT_DISABLED", message: "The assistant is not available" } },
      { status: 503 },
    );
  }

  const { token } = await params;
  const body = await req.text();

  let res: Response;
  try {
    res = await fetch(
      `${ASSISTANT_URL.replace(/\/$/, "")}/ai-portal/q/${encodeURIComponent(token)}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      },
    );
  } catch {
    return Response.json(
      { error: { code: "ASSISTANT_UNREACHABLE", message: "Could not reach the assistant" } },
      { status: 502 },
    );
  }

  if (!res.ok) {
    // FastAPI reports {detail}; the app's clients read {error:{code,message}}.
    const detail = await res
      .json()
      .then((b: { detail?: string }) => b?.detail)
      .catch(() => undefined);

    return Response.json(
      {
        error: {
          code: res.status === 503 ? "ASSISTANT_DISABLED" : "ASSISTANT_ERROR",
          message: detail ?? "The assistant could not answer",
        },
      },
      { status: res.status },
    );
  }

  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
