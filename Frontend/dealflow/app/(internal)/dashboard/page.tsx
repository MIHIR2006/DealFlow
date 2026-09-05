import { AnalyticsPanel } from "@/components/dashboard/analytics";
import { RecentActivity } from "@/components/dashboard/activity";
import { ChartFan } from "@/components/dashboard/charts";

export default function DashboardPage() {
  return (
    <div>
      <p className="text-[13px] text-mist">Home</p>
      <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px]">
        Sales Dashboard
      </h1>
      <p className="mt-2 max-w-[520px] text-[15px] text-mist">
        Central hub. Pending approvals, open quotes, and deals Deal Health
        already flagged.
      </p>

      <div className="mt-8">
        <ChartFan />
      </div>

      <div className="mt-6">
        <AnalyticsPanel />
      </div>

      <RecentActivity />
    </div>
  );
}
