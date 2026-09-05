import Image from "next/image";
import Link from "next/link";
import { Wave } from "@/components/auth/fields";
import { ROLES } from "@/lib/roles";

const cards = [ROLES.rep, ROLES.manager] as const;

export default function RegisterPage() {
  return (
    <div className="rounded-[28px] bg-white px-6 py-8 sm:px-10 sm:py-10">
      <Wave />
      <p className="mt-5 text-[15px] text-ink/80">Welcome to DealFlow360</p>
      <h1 className="font-serif mt-1 text-[34px] leading-[1.12] tracking-[-0.02em] sm:text-[40px]">
        Pick your role to get started
      </h1>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {cards.map((role) => (
          <Link
            key={role.id}
            href={`/register/join?role=${role.id}`}
            className="group rounded-[20px] border border-ink/8 p-3 transition-colors hover:border-ink/20"
          >
            <div className="art-frame relative h-[180px] overflow-hidden rounded-[14px] sm:h-[200px]">
              <Image
                src={role.image}
                alt={role.alt}
                fill
                sizes="(min-width: 768px) 420px, 100vw"
                className="object-cover"
              />
            </div>
            <h2 className="mt-4 px-1 text-[20px] font-semibold tracking-tight">
              {role.title}
            </h2>
            <p className="mt-1.5 px-1 pb-2 text-[14.5px] leading-relaxed text-mist">
              {role.body}
            </p>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-[13.5px] text-mist">
        Finance or Admin?{" "}
        <Link
          href="/register/join?role=finance"
          className="text-ink underline underline-offset-4"
        >
          Join as Finance
        </Link>
        {" · "}
        <Link
          href="/register/join?role=admin"
          className="text-ink underline underline-offset-4"
        >
          Join as Admin
        </Link>
        <span className="mt-1 block">
          Already have an account?{" "}
          <Link href="/signin" className="text-ink underline underline-offset-4">
            Sign in
          </Link>
        </span>
      </p>
    </div>
  );
}
