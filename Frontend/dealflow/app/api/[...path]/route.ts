import { NextRequest } from "next/server";

const BACKEND_URL = process.env.GO_BACKEND_URL;

const HOP_BY_HOP_REQUEST_HEADERS = ["host", "connection", "content-length"];

// Headers that describe the browser's relationship to *this* server and mean
// nothing to the one behind it.
//
// Origin is the important one. This proxy is a server-to-server call, but
// forwarding the browser's Origin makes the backend evaluate it as a browser
// cross-origin request against its CORS allowlist -- so a frontend served from
// any origin the backend does not happen to list has every mutation rejected
// with a bodyless 403, while GETs and server-side calls keep working. The
// browser's own same-origin protection still applies to the request that
// reaches this route, and the backend's allowlist still guards direct browser
// access to it; neither needs this header relayed.
const BROWSER_CONTEXT_HEADERS = ["origin", "referer"];
const HOP_BY_HOP_RESPONSE_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection"];

async function proxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!BACKEND_URL) {
    return Response.json(
      { error: { code: "CONFIG_ERROR", message: "GO_BACKEND_URL is not set" } },
      { status: 500 },
    );
  }

  const { path } = await params;
  const target = `${BACKEND_URL}/${path.join("/")}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  for (const name of HOP_BY_HOP_REQUEST_HEADERS) headers.delete(name);
  for (const name of BROWSER_CONTEXT_HEADERS) headers.delete(name);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: { code: "BACKEND_UNREACHABLE", message: "Could not reach the backend" } },
      { status: 502 },
    );
  }

  const resHeaders = new Headers(res.headers);
  for (const name of HOP_BY_HOP_RESPONSE_HEADERS) resHeaders.delete(name);

  return new Response(res.body, { status: res.status, headers: resHeaders });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
