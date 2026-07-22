"use client";

type Alert = {
  code?: string;
  message?: string;
  severity?: string;
};

type Props = {
  alerts?: Alert[];
};

const SEV_STYLE: Record<string, string> = {
  CRITICAL: "border-rose-300 bg-rose-50 text-rose-950",
  HIGH: "border-orange-300 bg-orange-50 text-orange-950",
  MEDIUM: "border-amber-300 bg-amber-50 text-amber-950",
  LOW: "border-slate-300 bg-slate-50 text-slate-800",
};

export default function AlertsPanel({ alerts = [] }: Props) {
  if (!alerts.length) return null;

  const sorted = [...alerts].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (order[a.severity as keyof typeof order] ?? 9) - (order[b.severity as keyof typeof order] ?? 9);
  });

  return (
    <section className="helios-card overflow-hidden">
      <h2 className="border-b border-[var(--helios-border)] px-4 py-3 text-sm font-semibold text-slate-800 sm:px-6">
        Alerts ({alerts.length})
      </h2>
      <ul className="divide-y divide-slate-100">
        {sorted.slice(0, 12).map((alert, idx) => (
          <li
            key={`${alert.code}-${idx}`}
            className={`border-l-4 px-4 py-3 sm:px-6 ${SEV_STYLE[alert.severity || "LOW"] || SEV_STYLE.LOW}`}
          >
            <p className="text-xs font-semibold uppercase">{alert.code || "ALERT"}</p>
            <p className="mt-1 text-sm">{alert.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
