import Image from "next/image";

export function AuthPanel() {
  return (
    <aside className="relative hidden h-full min-h-[640px] overflow-hidden rounded-[22px] bg-[#f0b07a] lg:block">
      <Image
        src="/auth/panel.jpg"
        alt=""
        fill
        sizes="480px"
        className="object-cover object-top"
      />
      <div className="absolute inset-0 bg-[#f0b07a]/25" />

      <div className="relative flex h-full flex-col justify-end gap-8 p-6 pb-8">
        <figure className="rounded-[18px] bg-white p-5 text-ink card-shadow">
          <blockquote className="text-[16px] leading-relaxed">
            The rep never requested approval. The blended score routed this to
            Manager, then Finance, on its own.
          </blockquote>
          <figcaption className="mt-4 flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-bone">
              Q
            </span>
            <span>
              <span className="block text-[13.5px] font-medium">Q-1042 · Acme Corp</span>
              <span className="block text-[12.5px] text-mist">Gold · Hardware + Service</span>
            </span>
          </figcaption>
        </figure>

        <p className="px-1 text-center text-[12px] font-medium tracking-wide text-ink/55">
          Risk · Split · Billing · Portal · Health
        </p>
      </div>
    </aside>
  );
}
