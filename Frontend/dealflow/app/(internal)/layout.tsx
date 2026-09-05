import { WorkspaceNav } from "@/components/workspace/nav";

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-cream text-ink">
      <WorkspaceNav />
      <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </div>
    </div>
  );
}
