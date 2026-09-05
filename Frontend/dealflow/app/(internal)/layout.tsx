"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readToken } from "@/lib/api";
import { WorkspaceNav } from "@/components/workspace/nav";

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!readToken()) {
      router.replace("/signin");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    return (
      <div className="min-h-svh bg-cream flex items-center justify-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-cream text-ink">
      <WorkspaceNav />
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}
