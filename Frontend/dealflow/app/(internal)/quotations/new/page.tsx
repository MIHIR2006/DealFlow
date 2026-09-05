"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@/lib/hooks";
import type { Quotation } from "@/lib/types";

export default function NewQuotationRedirect() {
  const router = useRouter();
  const { trigger, error } = useMutation<{ data: Quotation }>();
  const [creating, setCreating] = useState(true);

  useEffect(() => {
    // ponytail: customer_id=1 is a reasonable default for demo.
    // A real flow would show a customer picker first.
    trigger("/v1/quotations", {
      method: "POST",
      body: JSON.stringify({ customer_id: 1 }),
    })
      .then((res) => {
        router.replace(`/quotations/${res.data.id}`);
      })
      .catch(() => {
        setCreating(false);
      });
  }, [trigger, router]);

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-[14px] font-medium text-rose-800">Failed to create quotation</p>
          <p className="text-[12px] text-mist mt-1">{error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="size-6 border-2 border-ink border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-3 text-[13px] text-mist font-medium">Initializing new quotation draft...</p>
      </div>
    </div>
  );
}
