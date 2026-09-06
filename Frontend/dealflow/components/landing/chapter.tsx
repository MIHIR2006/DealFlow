import Image from "next/image";

export function Chapter({
  src,
  alt,
  children,
}: {
  src: string;
  alt: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-3 sm:px-5">
      <div className="art-frame relative mx-auto min-h-[380px] max-w-[1280px] overflow-hidden rounded-[28px] sm:min-h-[460px] lg:min-h-[520px]">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-black/10" />
        <h2 className="font-serif absolute inset-x-5 top-[16%] text-center text-[30px] leading-[1.08] tracking-[-0.02em] text-white text-balance sm:inset-x-16 sm:top-[18%] sm:text-[52px] lg:text-[64px]">
          {children}
        </h2>
      </div>
    </section>
  );
}
