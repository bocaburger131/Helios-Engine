"use client";

import { useVeraOptional, VERA_ACCENT } from "@/components/vera/VeraProvider";

type Props = {
  decision: string | null;
  score: number | null;
};

/**
 * Dark floating dock (bottom-right) — opens Vera results co-pilot.
 */
export default function VeraDock({ decision, score }: Props) {
  const vera = useVeraOptional();
  if (!decision) return null;

  const openChat = () => {
    vera?.open();
  };

  return (
    <div className="vera-dock">
      <button
        type="button"
        onClick={openChat}
        className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-left shadow-xl transition hover:border-[#3366a9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3366a9]"
        aria-label="Open Vera results co-pilot"
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: VERA_ACCENT }}
        >
          V
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Vera decision
          </p>
          <p className="truncate text-sm font-semibold text-slate-100">
            {decision}
            {score != null ? ` · ${score}/10` : ""}
          </p>
          <p className="mt-0.5 text-[10px] text-[#7eb6ff]">Ask about results →</p>
        </div>
      </button>
    </div>
  );
}
