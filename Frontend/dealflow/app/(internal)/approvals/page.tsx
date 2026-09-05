import { ModuleStub } from "@/components/workspace/module-stub";
import { quotes } from "@/lib/demo/dashboard";

export default function ApprovalsPage() {
  const pending = quotes.filter(
    (q) => q.status === "Pending Manager" || q.status === "Pending Finance",
  );

  return (
    <div>
      <ModuleStub
        title="Approvals"
        kicker="Inbox"
        body="Quotes the risk engine already routed. Four waiting in the demo set — Q-1042 needs Finance."
      />
      <ul className="mt-8 divide-y divide-ink/6 overflow-hidden rounded-[20px] bg-white card-shadow">
        {pending.map((q) => (
          <li key={q.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="font-medium">
                {q.id} · {q.customer}
              </p>
              <p className="text-[13px] text-mist">{q.status}</p>
            </div>
            <p
              className="text-[13px] font-medium"
              style={{ color: "var(--color-status-warn)" }}
            >
              {q.risk}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
