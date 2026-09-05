import { mix, weeklyApprovals } from "@/lib/demo/dashboard";

const terracotta = "var(--color-chart-terracotta)";
const rose = "var(--color-chart-rose)";
const lilac = "var(--color-chart-lilac)";

export function DonutChart() {
  const stops: string[] = [];
  let cursor = 0;
  for (const slice of mix) {
    stops.push(`${slice.color} ${cursor}% ${cursor + slice.value}%`);
    cursor += slice.value;
  }

  return (
    <figure className="flex h-full flex-col">
      <figcaption className="text-[13px] text-mist">Quote mix</figcaption>
      <div className="mt-4 flex flex-1 items-center gap-5">
        <div
          className="relative size-[132px] shrink-0 rounded-full"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
          aria-hidden
        >
          <span className="absolute inset-[26%] rounded-full bg-white" />
          <span className="absolute top-[18%] right-[-6px] text-[12px] font-medium">
            45%
          </span>
          <span className="absolute bottom-[28%] left-[-2px] text-[12px] font-medium">
            20%
          </span>
        </div>
        <ul className="space-y-1.5 text-[12.5px]">
          {mix.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span
                className="size-2 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

export function BarChart() {
  const max = Math.max(
    ...weeklyApprovals.flatMap((w) => [w.submitted, w.manager, w.finance]),
  );

  return (
    <figure className="flex h-full flex-col">
      <figcaption className="text-[13px] text-mist">Approvals this quarter</figcaption>
      <div className="mt-4 flex h-[160px] flex-1 items-end justify-between gap-2 px-1">
        {weeklyApprovals.map((w) => (
          <div key={w.label} className="flex flex-1 items-end justify-center gap-0.5">
            <Bar h={(w.submitted / max) * 100} color={terracotta} />
            <Bar h={(w.manager / max) * 100} color={rose} />
            <Bar h={(w.finance / max) * 100} color={lilac} />
          </div>
        ))}
      </div>
      <ul className="mt-3 flex gap-3 text-[11px] text-mist">
        <Legend color={terracotta} label="Submitted" />
        <Legend color={rose} label="Manager" />
        <Legend color={lilac} label="Finance" />
      </ul>
    </figure>
  );
}

function Bar({ h, color }: { h: number; color: string }) {
  return (
    <span
      className="inline-block w-[7px] rounded-t-[3px] sm:w-[9px]"
      style={{ height: `${Math.max(h, 8)}%`, background: color }}
    />
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {label}
    </li>
  );
}

export function AreaChart() {
  return (
    <figure className="flex h-full flex-col">
      <figcaption className="text-[13px] text-mist">Pipeline value</figcaption>
      <svg
        viewBox="0 0 320 160"
        className="mt-3 h-full w-full"
        role="img"
        aria-label="Pipeline value rising over six weeks"
      >
        <path
          d="M0 120 C 40 118, 70 100, 110 92 C 150 84, 180 70, 220 58 C 260 46, 290 38, 320 28 L 320 160 L 0 160 Z"
          fill={lilac}
          opacity="0.28"
        />
        <path
          d="M0 136 C 50 132, 80 124, 120 118 C 170 110, 210 96, 250 90 C 285 84, 305 80, 320 72 L 320 160 L 0 160 Z"
          fill={rose}
          opacity="0.32"
        />
        <path
          d="M0 120 C 40 118, 70 100, 110 92 C 150 84, 180 70, 220 58 C 260 46, 290 38, 320 28"
          fill="none"
          stroke={lilac}
          strokeWidth="2"
        />
        <path
          d="M0 136 C 50 132, 80 124, 120 118 C 170 110, 210 96, 250 90 C 285 84, 305 80, 320 72"
          fill="none"
          stroke={rose}
          strokeWidth="2"
        />
      </svg>
    </figure>
  );
}

export function ChartFan() {
  return (
    <>
      <div className="grid gap-3 sm:hidden">
        <div className="rounded-[20px] bg-white p-4 card-shadow">
          <DonutChart />
        </div>
        <div className="h-[220px] rounded-[20px] bg-white p-4 card-shadow">
          <BarChart />
        </div>
      </div>

      <div className="relative mx-auto hidden h-[320px] max-w-[980px] sm:block">
        <div className="absolute top-8 left-0 w-[58%] max-w-[340px] -rotate-6 rounded-[20px] bg-white p-5 card-shadow">
          <DonutChart />
        </div>
        <div className="absolute top-0 left-1/2 z-[1] w-[62%] max-w-[380px] -translate-x-1/2 rounded-[20px] bg-white p-5 card-shadow">
          <div className="h-[230px]">
            <BarChart />
          </div>
        </div>
        <div className="absolute top-10 right-0 w-[54%] max-w-[320px] rotate-6 rounded-[20px] bg-white p-5 card-shadow">
          <div className="h-[190px]">
            <AreaChart />
          </div>
        </div>
      </div>
    </>
  );
}
