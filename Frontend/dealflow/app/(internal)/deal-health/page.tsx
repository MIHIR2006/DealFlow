import { ModuleStub } from "@/components/workspace/module-stub";
import { quotes } from "@/lib/demo/dashboard";

export default function DealHealthPage() {
  const flagged = quotes.filter((q) => q.overage || q.status === "Stalled");

  return (
    <div>
      <ModuleStub
        title="Deal Health"
        kicker="Anomalies"
        body="Stalled quotes and discount spikes the engine found without anyone asking."
      />
      <ul className="mt-8 divide-y divide-ink/6 overflow-hidden rounded-[20px] bg-white card-shadow">
        {flagged.map((q) => (
          <li key={q.id} className="px-5 py-4">
            <p className="font-medium">
              {q.id} · {q.customer}
            </p>
            <p className="text-[13px] text-mist">
              {q.status === "Stalled"
                ? "No activity past stall_days. Click through from the dashboard."
                : `Blended risk ${q.risk} — over category or tier ceiling.`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
