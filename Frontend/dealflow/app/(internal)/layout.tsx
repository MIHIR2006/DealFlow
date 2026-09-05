"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readToken } from "@/lib/api";
import { useAuth } from "@/lib/hooks";
import { WorkspaceNav } from "@/components/workspace/nav";

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    // A token that no longer resolves to a user (expired, revoked) is the
    // same as no token: back to sign-in rather than a half-rendered page.
    if (!readToken() || !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-svh bg-cream flex items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-cream text-ink">
      <WorkspaceNav user={user} />
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}
