import { NextRequest } from "next/server";

const BACKEND_URL = process.env.GO_BACKEND_URL;

const HOP_BY_HOP_REQUEST_HEADERS = ["host", "connection", "content-length"];
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
