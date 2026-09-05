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
    <div className="grid min-h-[720px] overflow-hidden rounded-[28px] bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex items-center px-8 py-12 sm:px-14">
        <SignInForm role={role} />
      </div>
      <div className="p-3">
        <AuthPanel />
      </div>
    </div>
  );
}
