import { cn } from "@/lib/utils";

export function Field({
  label,
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
}: {
  label: string;
  type?: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13.5px] font-medium text-ink">{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        placeholder={placeholder}
        required
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 w-full rounded-[10px] border border-ink/12 bg-white px-3.5 text-[14.5px] text-ink outline-none",
          "placeholder:text-mist/80",
          "focus-visible:border-ink/40",
        )}
      />
    </label>
  );
}

export function SubmitButton({
  children,
  pending,
}: {
  children: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-ink text-[15px] font-medium text-bone transition-colors hover:bg-ink/85 disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-3 text-[13.5px]"
      style={{ color: "var(--color-status-bad)" }}
    >
      {message}
    </p>
  );
}

export function Wave() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-11 text-ink"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M28 36c0-6 1.2-16 6-20" />
      <path d="M24 38c-1-8 0-18 4-22" />
      <path d="M32 38c2-7 6-14 12-16" />
      <path d="M26 40c1 8 8 14 16 12 7-2 10-10 8-16-3-8-12-10-16-4" />
      <path d="M22 22c-4-2-8 1-7 5" />
      <path d="M38 18c4-3 8 0 7 5" />
    </svg>
  );
}
