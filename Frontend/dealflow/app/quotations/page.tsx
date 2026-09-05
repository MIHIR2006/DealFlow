import Link from "next/link";

export default function QuotationsPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-cream px-6 text-center">
      <p className="font-headline text-[15px] font-semibold">DealFlow360</p>
      <h1 className="font-serif mt-4 max-w-[520px] text-[36px] leading-[1.12] tracking-[-0.02em]">
        You&rsquo;re in. The workspace is next.
      </h1>
      <p className="mt-4 max-w-[420px] text-[15px] text-mist">
        Auth landed. Quotations, approvals, and the portal ship in the
        following screens.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-bone"
      >
        Back to DealFlow360
      </Link>
    </div>
  );
}
