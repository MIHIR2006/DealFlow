import { NextRequest } from "next/server";

const BACKEND_URL = process.env.GO_BACKEND_URL;

export async function POST(req: NextRequest) {
  if (!BACKEND_URL) {
    return Response.json(
      { error: { code: "CONFIG_ERROR", message: "GO_BACKEND_URL is not set" } },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    // 1. Next.js server-side payload validation (BFF pattern)
    if (!body.email || typeof body.email !== "string" || !body.email.includes("@")) {
      return Response.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "A valid email is required.",
          },
        },
        { status: 422 }
      );
    }

    if (!body.password || typeof body.password !== "string" || body.password.trim() === "") {
      return Response.json(
        {
          error: {
            code: "VALIDATION_FAILED",
            message: "Password is required.",
          },
        },
        { status: 422 }
      );
    }

    // 2. Securely forward the sanitized payload to the Go backend
    const target = `${BACKEND_URL}/v1/auth/login`;
    const payload = {
      email: body.email,
      password: body.password,
    };

    const res = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    // 3. Return the exact response from the backend to the frontend
    return Response.json(data, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error("Login BFF Error:", error);
    const isConnRefused = error?.cause?.code === "ECONNREFUSED" || error?.message?.includes("fetch failed");
    return Response.json(
      {
        error: {
          code: isConnRefused ? "BACKEND_UNREACHABLE" : "INTERNAL_ERROR",
          message: isConnRefused
            ? "Cannot reach the Go backend. Make sure the Go server is running on port 8080."
            : "An unexpected error occurred during login.",
        },
      },
      { status: isConnRefused ? 502 : 500 }
    );
  }
}
