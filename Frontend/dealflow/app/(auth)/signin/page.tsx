import { AuthPanel } from "@/components/auth/panel";
import { SignInForm } from "@/components/auth/sign-in-form";
import { parseRole } from "@/lib/roles";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[] }>;
}) {
  const params = await searchParams;
  const role = parseRole(
    typeof params.role === "string" ? params.role : params.role?.[0],
  );

  return (
    <div className="grid overflow-hidden rounded-[28px] bg-white lg:min-h-[720px] lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex items-center px-5 py-10 sm:px-14 sm:py-12">
        <SignInForm role={role} />
      </div>
      <div className="hidden p-3 lg:block">
        <AuthPanel />
      </div>
    </div>
  );
}
