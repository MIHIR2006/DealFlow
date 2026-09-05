import { activity } from "@/lib/demo/dashboard";

export function RecentActivity() {
  return (
    <section className="mt-8">
      <h2 className="text-[16px] font-semibold tracking-tight">Recent activity</h2>
      <ul className="mt-4 divide-y divide-ink/6 overflow-hidden rounded-[20px] bg-white card-shadow">
        {activity.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-[14.5px]">{item.text}</p>
              <p className="mt-0.5 text-[13px] text-mist">{item.detail}</p>
            </div>
            <p className="shrink-0 text-[12.5px] text-mist">{item.when}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
