export function RiskCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[18px] bg-white p-5 text-ink card-shadow ${className}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[12.5px] text-mist">Quotation Q-1042</p>
          <p className="text-[16px] font-semibold">Acme Corp</p>
        </div>
        <span className="rounded-full border border-ink/10 px-2.5 py-1 text-[12px] font-medium text-mist">
          Gold
        </span>
      </div>

      <span
        className="flag-badge mt-4 inline-block rounded-full px-3 py-1 text-[13px] font-medium"
        style={{
          background: "var(--color-status-warn-bg)",
          color: "var(--color-status-warn)",
        }}
      >
        Blended risk 5.6%
      </span>

      <div className="mt-5 border-t border-ink/8 pt-4">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[11px] text-mist">
          <span>Line</span>
          <span className="text-right">Given</span>
          <span className="text-right">Allowed</span>
          <span className="text-right">Result</span>
        </div>
        <div className="mt-3 grid gap-y-2 text-[13px]">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3">
            <span>Laptop (Hardware)</span>
            <span className="text-right text-mist">12%</span>
            <span className="text-right text-mist">15%</span>
            <span
              className="text-right font-medium"
              style={{ color: "var(--color-status-ok)" }}
            >
              OK
            </span>
          </div>
          <div className="flag-row grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3">
            <span>Setup Service</span>
            <span className="text-right text-mist">18%</span>
            <span className="text-right text-mist">10%</span>
            <span
              className="text-right font-medium"
              style={{ color: "var(--color-status-warn)" }}
            >
              8pt over
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
