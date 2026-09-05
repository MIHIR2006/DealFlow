export function ModuleStub({
  title,
  kicker,
  body,
}: {
  title: string;
  kicker: string;
  body: string;
}) {
  return (
    <div>
      <p className="text-[13px] text-mist">{kicker}</p>
      <h1 className="font-serif mt-1 text-[32px] tracking-[-0.02em] sm:text-[40px]">
        {title}
      </h1>
      <p className="mt-3 max-w-[520px] text-[15px] leading-relaxed text-mist">
        {body}
      </p>
    </div>
  );
}
