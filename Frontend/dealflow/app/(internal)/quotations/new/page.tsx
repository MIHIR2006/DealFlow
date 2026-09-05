"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewQuotationRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Generate new draft ID or route to builder
    const newId = `Q-${Math.floor(1045 + Math.random() * 50)}`;
    router.replace(`/quotations/${newId}`);
  }, [router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-3 text-[13px] text-mist font-medium">Initializing new quotation draft...</p>
      </div>
    </div>
  );
}
