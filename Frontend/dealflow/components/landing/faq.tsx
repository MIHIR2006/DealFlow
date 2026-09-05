const items = [
  {
    q: "What is DealFlow360?",
    a: "A self-governing B2B deal engine. It builds quotations, scores discount risk, routes approval, splits warehouses, bills hybrid orders, and lets customers negotiate in a portal — without a rep requesting any of it.",
  },
  {
    q: "How does blended risk routing work?",
    a: "Every line is checked against the tighter of the customer-tier ceiling and the category ceiling. Overage is value-weighted across the quote. Blended ≥ 5 or a single line ≥ 10 points over goes Manager → Finance. Any overage goes to Manager. Zero discount goes straight through. Thresholds live in config, not code.",
  },
  {
    q: "Does the sales rep request approval?",
    a: "No. Submit runs the risk engine and creates the chain. The spec's worked example — Laptop 12%/15% OK, Setup Service 18%/10% → 8pt over — flags the whole quote even though Gold “allows” 15%.",
  },
  {
    q: "What happens when a customer counters?",
    a: "The portal is keyed by a magic-link token scoped to one quotation. A counter-offer re-scores the quote. If it exceeds limits, the quote re-enters approval from step 1 and the audit trail records “Customer counter-offer”.",
  },
  {
    q: "Can a rep approve their own quote?",
    a: "Never. Even if they also hold a Manager role. That check lives in the approval service, not the UI.",
  },
  {
    q: "How are one-time and recurring lines billed?",
    a: "On the same order, separately. One-time lines post an invoice. Recurring lines generate a billing schedule with day-count proration on quantity change.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="px-6 py-24 sm:px-10">
      <div className="mx-auto grid max-w-[1120px] gap-12 lg:grid-cols-[minmax(0,0.9fr)_1.1fr] lg:gap-20">
        <div>
          <h2 className="font-serif text-[40px] leading-[1.08] tracking-[-0.02em] sm:text-[52px]">
            Frequently Asked Questions
          </h2>
          <p className="mt-5 text-[15px] text-mist">
            Don&rsquo;t see the answer you&rsquo;re looking for?{" "}
            <a href="/register" className="text-ink underline decoration-ink/30 underline-offset-4">
              Get in touch
            </a>
          </p>
        </div>
        <div className="overflow-hidden rounded-[20px] bg-white card-shadow">
          {items.map((item, i) => (
            <details
              key={item.q}
              className={`group px-6 ${i < items.length - 1 ? "border-b border-ink/8" : ""}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[15.5px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="relative size-5 shrink-0 text-mist">
                  <span className="absolute top-1/2 left-0 h-px w-5 -translate-y-1/2 bg-current" />
                  <span className="absolute top-0 left-1/2 h-5 w-px -translate-x-1/2 bg-current transition-transform group-open:rotate-90 group-open:scale-y-0" />
                </span>
              </summary>
              <p className="pb-5 text-[14.5px] leading-relaxed text-mist">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
