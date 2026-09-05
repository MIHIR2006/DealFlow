"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, saveToken } from "@/lib/api";
import { type RoleId, ROLES } from "@/lib/roles";
import { Field, FormError, SubmitButton } from "@/components/auth/fields";

type TokenRes = { token?: string; data?: { token?: string } };

export function JoinForm({ role }: { role: RoleId }) {
  const router = useRouter();
  const meta = ROLES[role];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      const res = await api<TokenRes>("/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          full_name: name,
          email,
          password,
          role: role.toUpperCase(),
        }),
      });
      const token = res.token ?? res.data?.token;
      if (token) saveToken(token);
      router.push("/quotations");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create the account. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-[420px]">
      <p className="text-[14px] text-mist">Welcome to DealFlow360</p>
      <h1 className="font-serif mt-1 text-[32px] leading-[1.15] tracking-[-0.02em] text-ink">
        Create your {meta.account} account
      </h1>

      <div className="mt-8 space-y-4">
        <Field
          label="Your name"
          name="name"
          value={name}
          onChange={setName}
          placeholder="J. Rao"
          autoComplete="name"
          autoFocus
        />
        <Field
          label="Your email address"
          type="email"
          name="email"
          value={email}
          onChange={setEmail}
          placeholder="jane.rao@acme.com"
          autoComplete="email"
        />
        <Field
          label="Password"
          type="password"
          name="password"
          value={password}
          onChange={setPassword}
          placeholder="At least 8 characters"
          autoComplete="new-password"
        />
      </div>

      <FormError message={error} />
      <SubmitButton pending={pending}>Get access</SubmitButton>

      <div className="mt-6 space-y-1 text-[13.5px] text-mist">
        <p>
          Already have an account?{" "}
          <Link
            href={`/signin?role=${role}`}
            className="text-ink underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
        <p>
          Pick a different role?{" "}
          <Link href="/register" className="text-ink underline underline-offset-4">
            Go back
          </Link>
        </p>
      </div>
    </form>
  );
}
