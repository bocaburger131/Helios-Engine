"use client";

type Props = {
  decision: string | null;
  score: number | null;
};

export default function VeraDock({ decision, score }: Props) {
  if (!decision) return null;

  return (
    <div className="vera-dock">
      <div className="helios-card flex items-center gap-3 border-blue-200 bg-white px-4 py-3 shadow-lg">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          V
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Vera decision</p>
          <p className="text-sm font-semibold text-slate-900">
            {decision}
            {score != null ? ` · ${score}/10` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
