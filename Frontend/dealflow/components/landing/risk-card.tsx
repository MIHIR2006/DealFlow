export function RiskCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[22px] bg-white p-4.5 text-ink card-shadow ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-mist">Quotation Q-1042</p>
          <p className="text-[15px] font-semibold">Acme Corp</p>
        </div>
        <span className="rounded-full border border-ink/10 px-2.5 py-0.5 text-[11px] font-medium text-mist">
          Gold
        </span>
      </div>

      <div className="mt-2.5 flex justify-center">
        <span
          className="rounded-full px-3.5 py-1 text-[12px] font-semibold tracking-wide"
          style={{
            background: "var(--color-status-warn-bg)",
            color: "var(--color-status-warn)",
          }}
        >
          Blended risk 5.6%
        </span>
      </div>

      <div className="mt-3.5 border-t border-ink/8 pt-3">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[11px] font-semibold text-mist">
              <th className="font-semibold text-left pb-2">Line</th>
              <th className="font-semibold text-right pb-2">Given</th>
              <th className="font-semibold text-right pb-2">Allowed</th>
              <th className="font-semibold text-right pb-2">Result</th>
            </tr>
          </thead>
          <tbody className="text-[12.5px]">
            <tr>
              <td className="py-1 font-medium text-ink whitespace-nowrap">Laptop</td>
              <td className="py-1 text-right text-mist">12%</td>
              <td className="py-1 text-right text-mist">15%</td>
              <td className="py-1 text-right font-semibold" style={{ color: "var(--color-status-ok)" }}>
                OK
              </td>
            </tr>
            <tr>
              <td className="py-1 font-medium text-ink whitespace-nowrap">Setup Service</td>
              <td className="py-1 text-right text-mist">18%</td>
              <td className="py-1 text-right text-mist">10%</td>
              <td className="py-1 text-right font-semibold" style={{ color: "var(--color-status-warn)" }}>
                8pt over
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
