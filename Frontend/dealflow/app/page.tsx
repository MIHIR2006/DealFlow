import Image from "next/image";
import { ArrowRight, ArrowUp, Play } from "lucide-react";
import { Nav } from "@/components/landing/nav";
import { QuoteReveal } from "@/components/landing/quote-reveal";
import { EngineCanvas } from "@/components/landing/engine-canvas";
import { Chapter } from "@/components/landing/chapter";
import { Faq } from "@/components/landing/faq";
import { RiskCard } from "@/components/landing/risk-card";
import { SmoothScroll } from "@/components/landing/smooth-scroll";

const marquee = [
  "Laptop 12% / 15% · OK",
  "Setup Service 18% / 10% · 8pt over",
  "Blended 5.6%",
  "Manager → Finance",
  "Gold ceiling 15%",
  "Service ceiling 10%",
  "Warehouse split",
  "Portal counter-offer",
  "Return for revision",
  "Hybrid billing",
];

const steps = ["Submitted", "Sales Manager", "Finance", "Confirmed"];

const pills = [
  { name: "J. Rao", note: "Submitted", x: "8%", y: "18%", seed: "JRao", bgHex: "b6e3f4" },
  { name: "M. Shah", note: "Returned", x: "78%", y: "14%", seed: "MShah", bgHex: "ffdfbf" },
  { name: "Acme Gold", note: "Q-1042", x: "12%", y: "72%", seed: "AcmeCorp", bgHex: "d1d4f9" },
  { name: "Portal", note: "Counter 20%", x: "70%", y: "68%", seed: "Portal", bgHex: "c0aedd" },
  { name: "Finance", note: "Pending", x: "84%", y: "42%", seed: "Finance", bgHex: "ffd5dc" },
];

export default function Home() {
  return (
    <SmoothScroll>
      <div id="top" className="bg-cream text-ink">
      <Nav />

      <Hero />
      <Marquee />

      <section className="px-6 py-24 sm:px-10 sm:py-32">
        <div className="mx-auto max-w-[860px] text-center">
          <p className="text-[13px] font-medium text-mist">From the approval trail</p>
          <QuoteReveal
            className="mt-8"
            lines={[
              "“The rep never requested approval.",
              "The blended score routed this to Manager,",
              "then Finance, on its own.”",
            ]}
          />
          <div className="mt-10 flex flex-col items-center">
            <div className="size-11 overflow-hidden rounded-full border-2 border-white bg-white p-0.5 shadow-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://api.dicebear.com/7.x/notionists/svg?seed=AcmeCorp&backgroundColor=ffdfbf"
                alt="Acme Corp"
                className="size-full rounded-full object-cover"
              />
            </div>
            <p className="mt-3 text-[15px] font-medium">Q-1042 · Acme Corp</p>
            <p className="text-[13px] text-mist">Gold · Hardware + Service</p>
          </div>
        </div>
      </section>

      <Chapter src="/landing/engine.jpg" alt="Volumetric dusk clouds">
        Meet the engine.
        <br />
        Discount governance, finally visible.
      </Chapter>

      <section id="engine" className="canvas-shell -mt-24 px-6 pb-24 pt-28 sm:-mt-32 sm:px-10 sm:pt-32">
        <div className="relative z-[1] mx-auto max-w-[800px] text-center">
          <h3 className="font-serif text-[32px] tracking-[-0.02em] sm:text-[40px]">
            From a line discount to a full approval chain — in one submit
          </h3>
          <p className="mx-auto mt-4 max-w-[540px] text-[16px] leading-relaxed text-mist">
            Give the quote a discount, and the system decides who has to sign.
            Ceiling per line, blended across the order, never a gut feel.
          </p>
        </div>
        <div className="relative z-[1] mt-14">
          <EngineCanvas />
        </div>
      </section>

      <section className="grid gap-px border-t border-ink/8 lg:grid-cols-2">
        <Split
          title="Warehouse split from live stock"
          body="The system picks the fewest shipments that cover demand. One warehouse if it can. Two if it must. Remainder becomes a backorder — the order still confirms."
        >
          <SplitCard>
            <p className="text-[13px] font-semibold">Suggested split · Q-1042</p>
            <div className="mt-4 grid gap-3">
              <WhRow name="West Hub" qty="12 Laptop" note="covers in full" />
              <WhRow name="East DC" qty="8 Setup kits" note="partial" />
              <WhRow name="Backorder" qty="3 Setup kits" note="stock arrives Thu" warn />
            </div>
            <div className="mt-5 flex gap-2">
              <span className="rounded-full bg-ink px-3 py-1.5 text-[12px] text-bone">
                Accept split
              </span>
              <span className="rounded-full border border-ink/10 px-3 py-1.5 text-[12px] text-mist">
                Manual override
              </span>
            </div>
          </SplitCard>
        </Split>
        <Split
          title="Hybrid billing on one order"
          body="One-time hardware and a recurring plan live on the same quotation. They post separately: an invoice now, a schedule next. Proration is day-count."
        >
          <div className="relative h-[280px]">
            <BillCard className="absolute top-2 right-4 rotate-[-6deg]" title="Invoice INV-204" amount="₹4,82,000" sub="Laptop · one-time" />
            <BillCard className="absolute top-16 left-2 rotate-[4deg]" title="Schedule" amount="₹18,000 / mo" sub="Care plan · 12 periods" />
            <BillCard className="absolute bottom-2 right-8 rotate-[-2deg]" title="Payment" amount="PAID" sub="Bank · recorded" />
          </div>
        </Split>
      </section>

      <Chapter src="/landing/scale.jpg" alt="Dusk mountains and pine forest">
        Run deals at policy,
        <br />
        not in spreadsheets.
      </Chapter>

      <section id="how" className="canvas-shell -mt-24 px-6 pb-24 pt-28 sm:-mt-32 sm:px-10 sm:pt-32 sm:pb-32">
        <div className="relative z-[1] mx-auto max-w-[720px] text-center">
          <h3 className="font-serif text-[32px] tracking-[-0.02em] sm:text-[40px]">
            Work the chain the spec actually wrote
          </h3>
          <p className="mx-auto mt-4 max-w-[540px] text-[16px] leading-relaxed text-mist">
            Zero discount skips approval. One line over goes to Manager. Blended
            or a max-line spike brings Finance in. Return for revision is a
            real state, not a reject.
          </p>
          <div className="mt-12 flex justify-center gap-16 sm:gap-24">
            <Stat n="0" label="Clicks to request approval" sub="vs. a manual chain" />
            <Stat n="2" label="Levels when risk trips" sub="Manager, then Finance" />
          </div>
        </div>
        <Orbit />
      </section>

      <section className="grid gap-px border-t border-ink/8 lg:grid-cols-2">
        <Split
          title="Keep the deal moving without chasing it"
          body="Stalled quotes, discount anomalies, delivery slip. Deal health finds the ones nobody asked about — seeded with true positives, not empty states."
        >
          <SplitCard>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="size-7 overflow-hidden rounded-full border border-ink/10 bg-white shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="https://api.dicebear.com/7.x/notionists/svg?seed=Northwind&backgroundColor=b6e3f4"
                    alt="Northwind"
                    className="size-full rounded-full object-cover"
                  />
                </div>
                <p className="text-[13px] font-semibold">Q-1018 · Northwind</p>
              </div>
              <span className="text-[12px]" style={{ color: "var(--color-status-warn)" }}>
                Stalled 9 days
              </span>
            </div>
            <p className="mt-3 text-[13px] text-mist">
              No activity since last return. Baseline discount 6%. This quote sits at 14%.
            </p>
            <div className="mt-4 space-y-2 rounded-xl border border-ink/8 p-3">
              <ActionRow k="A" title="Nudge the rep" />
              <ActionRow k="B" title="Escalate to manager" />
              <ActionRow k="C" title="Leave a note…" muted />
            </div>
          </SplitCard>
        </Split>
        <Split
          title="Three buttons. Most teams ship two."
          body="Approve, Return for Revision, Reject. The audit trail keeps Submitted → Returned → Resubmitted as three surviving rows. The mockup showed this. We built it."
        >
          <SplitCard>
            <p className="text-[13px] text-mist">Approval Detail · Q-1042</p>
            <div className="mt-5 flex items-center gap-0">
              {steps.map((step, i) => (
                <div key={step} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <span
                      className={`size-2.5 rounded-full border ${
                        i === 0 ? "border-ink bg-ink" : "border-ink/30 bg-transparent"
                      }`}
                    />
                    <span className="whitespace-nowrap text-[11px] text-mist">{step}</span>
                  </div>
                  {i < steps.length - 1 ? (
                    <span className="mx-2 h-px flex-1 bg-ink/15" />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ background: "var(--color-status-ok-bg)", color: "var(--color-status-ok)" }}>
                Approve
              </span>
              <span className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ background: "var(--color-status-warn-bg)", color: "var(--color-status-warn)" }}>
                Return for revision
              </span>
              <span className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ background: "var(--color-status-bad-bg)", color: "var(--color-status-bad)" }}>
                Reject
              </span>
            </div>
          </SplitCard>
        </Split>
      </section>

      <Chapter src="/landing/playbook.jpg" alt="Dusk city garden">
        A living document,
        <br />
        not a static PDF.
      </Chapter>

      <section id="portal" className="canvas-shell -mt-24 px-6 pb-24 pt-28 sm:-mt-32 sm:px-10 sm:pt-32">
        <div className="relative z-[1] mx-auto max-w-[720px] text-center">
          <h3 className="font-serif text-[32px] tracking-[-0.02em] sm:text-[40px]">
            The negotiation loop, live
          </h3>
          <p className="mx-auto mt-4 max-w-[540px] text-[16px] leading-relaxed text-mist">
            Customer opens a magic link. Counters a line. Internal workflow
            state changes. No email. No rep in the middle.
          </p>
        </div>
        <div className="relative z-[1] mx-auto mt-14 grid max-w-[920px] gap-4 sm:grid-cols-2">
          <Window
            kicker="Customer view"
            title="Counter-offer sent"
            body="Asked for 20% off Setup Service. Waiting on review. Token scoped to this quote only."
          />
          <Window
            kicker="Internal view"
            title="Q-1042 reopened"
            body="Back in Pending Approval. Chain rebuilt from step one. Audit: Customer counter-offer."
          />
        </div>
      </section>

      <section className="overflow-hidden px-6 py-24 sm:px-10">
        <h2 className="font-serif mx-auto max-w-[920px] text-center text-[40px] leading-[1.08] tracking-[-0.02em] sm:text-[56px]">
          The trail the mockup asked for
        </h2>
        <div className="mx-auto mt-14 flex max-w-[1200px] gap-4 overflow-x-auto pb-2">
          <QuoteCard
            tone="lavender"
            quote="Submitted. Initial 12% discount on the laptop — within the Gold hardware ceiling."
            who="J. Rao"
            role="Sales Rep · Aug 20"
            seed="JRao"
            bgHex="b6e3f4"
          />
          <QuoteCard
            tone="peach"
            quote="Returned for revision. Need a margin note on the setup service before this can move."
            who="M. Shah"
            role="Sales Manager · Aug 21"
            seed="MShah"
            bgHex="ffdfbf"
          />
          <QuoteCard
            tone="mist"
            quote="A customer action just mutated our internal workflow state and re-entered the chain."
            who="Portal"
            role="Counter-offer · token-scoped"
            seed="Portal"
            bgHex="c0aedd"
          />
        </div>
      </section>

      <section id="get-started" className="relative overflow-hidden px-6 py-32 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,oklch(0.85_0.04_300/0.35),transparent_60%)]" />
        {pills.map((p) => (
          <span
            key={p.name}
            className="capsule pointer-events-none absolute hidden items-center gap-2 py-1.5 pr-3 pl-1.5 text-[13px] shadow-sm lg:inline-flex"
            style={{ left: p.x, top: p.y }}
          >
            <div className="size-6 overflow-hidden rounded-full border border-white bg-white shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.dicebear.com/7.x/notionists/svg?seed=${p.seed}&backgroundColor=${p.bgHex}`}
                alt={p.name}
                className="size-full rounded-full object-cover"
              />
            </div>
            {p.name}
          </span>
        ))}
        <div className="relative mx-auto max-w-[780px] text-center">
          <h2 className="font-serif text-[40px] leading-[1.08] tracking-[-0.02em] sm:text-[56px]">
            Most sales tools stop at quote to invoice.
            <br />
            DealFlow360 decides what happens next.
          </h2>
          <p className="mx-auto mt-5 max-w-[480px] text-[16px] text-mist">
            Build the quote. The engine routes it. The customer can still
            negotiate. Policy stays intact.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-6 py-3 text-[15px] font-medium text-bone hover:bg-ink/85"
            >
              Get access
              <ArrowRight className="size-4" />
            </a>
            <a
              href="/signin"
              className="inline-flex items-center rounded-full bg-white px-6 py-3 text-[15px] font-medium text-ink card-shadow"
            >
              Sign in
            </a>
          </div>
        </div>
      </section>

      <Faq />

      <footer className="px-3 pb-3 sm:px-5 sm:pb-5">
        <div className="art-frame relative mx-auto min-h-[520px] max-w-[1280px] overflow-hidden rounded-[28px] sm:min-h-[640px] lg:min-h-[720px]">
          <Image
            src="/landing/DFooter.png"
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
          <div className="relative z-[1] grid gap-12 p-8 text-bone sm:p-12 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="font-headline text-[28px] font-semibold tracking-tight">
                DealFlow360
              </p>
              <p className="mt-3 max-w-[360px] text-[14px] leading-relaxed text-bone/70">
                A self-governing deal engine. Discount routing, warehouse
                splits, hybrid billing, portal negotiation.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 text-[14px] sm:grid-cols-3">
              <FooterCol
                title="Product"
                links={[
                  ["#engine", "Risk engine"],
                  ["#how", "Approvals"],
                  ["#portal", "Portal"],
                ]}
              />
              <FooterCol
                title="Workspace"
                links={[
                  ["/signin", "Sign in"],
                  ["#faq", "FAQ"],
                  ["#top", "Home"],
                ]}
              />
              <FooterCol
                title="Spec"
                links={[
                  ["#engine", "§10 example"],
                  ["#how", "Return loop"],
                  ["#portal", "Token isolation"],
                ]}
              />
            </div>
          </div>
        </div>
      </footer>
    </div>
    </SmoothScroll>
  );
}

function Hero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-canvas text-bone flex flex-col justify-start">
      <div className="art-frame absolute inset-0">
        <Image
          src="/landing/newc.png"
          alt="DealFlow360"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col items-center justify-start px-6 pt-28 pb-8 text-center sm:pt-36">
        <div className="flex w-full flex-col items-center">
          <h1 className="font-serif mt-4 sm:mt-6 max-w-[860px] text-[38px] leading-[1.06] tracking-[-0.03em] text-balance sm:text-[54px] lg:text-[64px]">
            The self-governing deal engine for B2B sales
          </h1>
          {/* <p className="mt-4 max-w-[640px] text-[15px] leading-relaxed text-bone/85 sm:text-[17.5px]">
            Discount limits, stock splits, and customer counter-offers get
            resolved by the system itself — before a manager ever opens the deal.
          </p> */}

          <div className="mt-6 sm:mt-8 flex w-full max-w-[500px] flex-col items-center gap-2 sm:flex-row sm:rounded-full sm:border sm:border-white/25 sm:bg-white/15 sm:p-1 sm:backdrop-blur-xl sm:shadow-2xl">
            <input
              type="email"
              placeholder="Enter your work email"
              className="w-full rounded-full border border-white/20 bg-white/15 px-4 py-2 text-[13.5px] text-white placeholder-white/60 backdrop-blur-md focus:outline-none sm:border-none sm:bg-transparent sm:py-2 sm:backdrop-blur-none"
            />
            <div className="flex w-full shrink-0 flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center">
              <a
                href="/register"
                className="inline-flex items-center justify-center rounded-full bg-bone px-4 py-2 text-[13.5px] font-medium text-ink shadow-lg transition-all hover:bg-white whitespace-nowrap"
              >
                Open workspace
              </a>
              <a
                href="#engine"
                className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/10 px-4 py-2 text-[13.5px] font-medium text-white backdrop-blur-md transition-all hover:bg-white/20 whitespace-nowrap"
              >
                Launch demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Marquee() {
  const loop = [...marquee, ...marquee];
  return (
    <section className="border-b border-ink/8 bg-cream py-10">
      <p className="text-center text-[15px] font-medium">
        Built around the spec&rsquo;s own worked example
      </p>
      <div className="mt-6 overflow-hidden">
        <div className="marquee-track gap-12 px-8 text-[15px] text-ink/70">
          {loop.map((item, i) => (
            <span key={`${item}-${i}`} className="shrink-0">
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Split({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-16 sm:px-12 sm:py-20">
      <h3 className="font-serif max-w-[460px] text-[32px] leading-[1.12] tracking-[-0.02em] sm:text-[36px]">
        {title}
      </h3>
      <p className="mt-4 max-w-[460px] text-[15.5px] leading-relaxed text-ink/75">
        {body}
      </p>
      <div className="mt-10">{children}</div>
    </div>
  );
}

function SplitCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[20px] bg-white p-5 card-shadow">{children}</div>;
}

function WhRow({
  name,
  qty,
  note,
  warn,
}: {
  name: string;
  qty: string;
  note: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-cream/80 px-3 py-2.5">
      <div>
        <p className="text-[13px] font-medium">{name}</p>
        <p className="text-[12px] text-mist">{qty}</p>
      </div>
      <p
        className="text-[12px]"
        style={{ color: warn ? "var(--color-status-warn)" : "var(--color-mist)" }}
      >
        {note}
      </p>
    </div>
  );
}

function BillCard({
  title,
  amount,
  sub,
  className,
}: {
  title: string;
  amount: string;
  sub: string;
  className?: string;
}) {
  return (
    <div className={`w-[240px] rounded-[18px] bg-white p-4 card-shadow ${className ?? ""}`}>
      <p className="text-[12px] text-mist">{title}</p>
      <p className="mt-1 text-[18px] font-semibold">{amount}</p>
      <p className="mt-1 text-[12px] text-mist">{sub}</p>
    </div>
  );
}

function Stat({ n, label, sub }: { n: string; label: string; sub: string }) {
  return (
    <div>
      <p className="font-serif text-[56px] leading-none tracking-[-0.04em] sm:text-[72px]">
        {n}
      </p>
      <p className="mt-3 text-[14px] font-medium">{label}</p>
      <p className="text-[13px] text-mist italic">{sub}</p>
    </div>
  );
}

function Orbit() {
  return (
    <div className="relative mx-auto mt-8 h-[480px] max-w-[720px] sm:h-[560px]">
      <div className="orbit-ring absolute top-1/2 left-1/2 size-[220px] -translate-x-1/2 -translate-y-1/2 sm:size-[280px]" />
      <div className="orbit-ring absolute top-1/2 left-1/2 size-[340px] -translate-x-1/2 -translate-y-1/2 sm:size-[420px]" />
      <div className="orbit-ring absolute top-1/2 left-1/2 size-[460px] -translate-x-1/2 -translate-y-1/2 sm:size-[560px]" />
      <div className="absolute top-1/2 left-1/2 z-[1] flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-ink text-[11px] font-semibold text-bone">
        Q-1042
      </div>
      <Bubble className="top-[18%] left-[18%]" text="Love this, I'm in." who="Manager" seed="Manager" bgHex="ffdfbf" />
      <Bubble className="top-[22%] right-[14%]" text="Need a margin note." who="Finance" seed="Finance" bgHex="c0aedd" />
      <Bubble className="bottom-[28%] left-[10%]" text="Returned. Edit the service line." who="M. Shah" seed="MShah" bgHex="b6e3f4" />
      <Bubble className="right-[12%] bottom-[22%]" text="Counter sent from portal." who="Acme" seed="AcmeCorp" bgHex="d1d4f9" />
      <div className="capsule absolute bottom-8 left-1/2 z-[2] max-w-[280px] -translate-x-1/2 px-4 py-3 text-left text-[13px] text-ink">
        We&rsquo;d like 20% on Setup Service. Can you take another look?
      </div>
    </div>
  );
}

function Bubble({
  className,
  text,
  who,
  seed,
  bgHex = "ffffff",
}: {
  className: string;
  text: string;
  who: string;
  seed: string;
  bgHex?: string;
}) {
  return (
    <div className={`absolute z-[1] flex items-center gap-2 ${className}`}>
      <span className="capsule px-3 py-1.5 text-[12.5px]">{text}</span>
      <div className="hidden size-9.5 overflow-hidden rounded-full border-2 border-white shadow-md sm:block" title={who}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=${bgHex}`}
          alt={who}
          className="size-full object-cover rounded-full"
        />
      </div>
    </div>
  );
}

function ActionRow({
  k,
  title,
  muted,
}: {
  k: string;
  title: string;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 text-[13px] ${muted ? "text-mist" : "text-ink"}`}>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-ink/15 text-[11px]">
        {k}
      </span>
      {title}
    </div>
  );
}

function Window({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[20px] border border-ink/10 bg-white p-6 text-left">
      <p className="text-[13px] text-mist">{kicker}</p>
      <p className="mt-3 text-[18px] font-semibold">{title}</p>
      <p className="mt-2 text-[14.5px] leading-relaxed text-mist">{body}</p>
    </div>
  );
}

function QuoteCard({
  quote,
  who,
  role,
  tone,
  seed,
  bgHex = "ffffff",
}: {
  quote: string;
  who: string;
  role: string;
  tone: "lavender" | "peach" | "mist";
  seed?: string;
  bgHex?: string;
}) {
  const bg =
    tone === "lavender"
      ? "linear-gradient(180deg, #f3e9fb 0%, #f7f1ea 100%)"
      : tone === "peach"
        ? "linear-gradient(180deg, #fde9d8 0%, #f7f1ea 100%)"
        : "linear-gradient(180deg, #e7eef7 0%, #f7f1ea 100%)";
  const avatarSeed = seed ?? who.replace(/[^a-zA-Z0-9]/g, "");

  return (
    <article
      className="flex min-h-[340px] min-w-[280px] flex-1 flex-col justify-between rounded-[24px] p-6 sm:min-w-[340px]"
      style={{ background: bg }}
    >
      <p className="font-serif text-[22px] leading-snug tracking-[-0.02em]">
        “{quote}”
      </p>
      <div className="mt-8 flex items-center gap-3">
        <div className="size-10 overflow-hidden rounded-full border-2 border-white bg-white shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=${bgHex}`}
            alt={who}
            className="size-full rounded-full object-cover"
          />
        </div>
        <div>
          <p className="text-[14px] font-medium">{who}</p>
          <p className="text-[13px] text-mist">{role}</p>
        </div>
      </div>
    </article>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <p className="mb-3 text-[13px] text-bone/50">{title}</p>
      <ul className="space-y-2">
        {links.map(([href, label]) => (
          <li key={label}>
            <a href={href} className="text-bone/85 hover:text-white">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
