import Link from "next/link";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-cream px-3 py-5 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-[1080px]">
        <Link
          href="/"
          className="font-headline inline-block text-[15px] font-semibold tracking-tight text-ink"
        >
          DealFlow360
        </Link>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
