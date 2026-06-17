"use client";

type IdentityCrossCheck = {
  status?: string;
  confidence?: number;
  bankBleedSkipped?: boolean;
  displayName?: string;
  mismatches?: Array<{ field?: string; expected?: string; observed?: string }>;
};

type Props = {
  crossCheck?: IdentityCrossCheck | null;
};

const STATUS_STYLE: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-800",
  review: "bg-amber-100 text-amber-900",
  mismatch: "bg-rose-100 text-rose-800",
};

export default function IdentityBadge({ crossCheck }: Props) {
  if (!crossCheck?.status) return null;

  const status = crossCheck.status.toLowerCase();
  const label =
    status === "pass"
      ? crossCheck.bankBleedSkipped
        ? "Verified (app)"
        : "Verified"
      : status === "mismatch"
        ? "Mismatch"
        : "Review";

  return (
    <div className="helios-card inline-flex flex-col gap-1 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">Identity</p>
      {crossCheck.displayName && (
        <p className="text-sm font-medium text-slate-800">{crossCheck.displayName}</p>
      )}
      <span className={`helios-chip ${STATUS_STYLE[status] ?? STATUS_STYLE.review}`}>
        {label}
        {crossCheck.confidence != null ? ` · ${Math.round(crossCheck.confidence * 100)}%` : ""}
      </span>
      {crossCheck.mismatches && crossCheck.mismatches.length > 0 && (
        <ul className="mt-1 text-xs text-slate-600">
          {crossCheck.mismatches.slice(0, 3).map((m) => (
            <li key={m.field}>
              {m.field}: expected {m.expected ?? "—"} · observed {m.observed ?? "—"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
