"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, saveToken } from "@/lib/api";
import { type RoleId, ROLES } from "@/lib/roles";
import { Field, FormError, SubmitButton } from "@/components/auth/fields";

type TokenRes = { token?: string; data?: { token?: string } };

export function SignInForm({ role }: { role: RoleId | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const heading = role
    ? `Sign in to your ${ROLES[role].account} account`
    : "Sign in to your workspace";
  const other: RoleId = role === "rep" ? "manager" : "rep";
  const otherLabel = other === "manager" ? "Approver workspace" : "Sales Rep";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (step === "email") {
      if (!email.includes("@")) {
        setError("Enter a valid email address.");
        return;
      }
      setStep("password");
      return;
    }

    setPending(true);
    try {
      const res = await api<TokenRes>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, role: role ?? undefined }),
      });
      const token = res.token ?? res.data?.token;
      if (token) saveToken(token);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not sign in. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-[420px]">
      <p className="text-[14px] text-mist">Welcome to DealFlow360</p>
      <h1 className="font-serif mt-1 text-[28px] leading-[1.15] tracking-[-0.02em] text-ink sm:text-[32px]">
        {heading}
      </h1>

      <div className="mt-8">
        <Field
          label="Your email address"
          type="email"
          name="email"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (step === "password") setStep("email");
          }}
          placeholder="jane.rao@acme.com"
          autoComplete="email"
          autoFocus
        />
      </div>

      {step === "password" ? (
        <div className="mt-4">
          <Field
            label="Password"
            type="password"
            name="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            autoFocus
          />
        </div>
      ) : null}

      <FormError message={error} />
      <SubmitButton pending={pending}>
        {step === "email" ? "Continue" : "Sign in"}
      </SubmitButton>

      <div className="mt-6 space-y-1 text-[13.5px] text-mist">
        <p>
          No account yet?{" "}
          <Link href="/register" className="text-ink underline underline-offset-4">
            Join now
          </Link>
        </p>
        <p>
          {otherLabel}?{" "}
          <Link
            href={`/signin?role=${other}`}
            className="text-ink underline underline-offset-4"
          >
            Sign in here instead
          </Link>
        </p>
      </div>
    </form>
  );
}
