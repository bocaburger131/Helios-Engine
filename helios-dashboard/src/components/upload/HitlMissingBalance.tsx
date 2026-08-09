"use client";

import { useState } from "react";

type Props = {
  payload: {
    checksumDelta: number;
    extractedRows: Array<Record<string, unknown>>;
    runId?: string;
  };
};

export default function HitlMissingBalance({ payload }: Props) {
  const [value, setValue] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return;
    setSubmitted(true);
    console.log("[HITL-MISSING-BALANCE] Closing balance entered:", num);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-blue-500">&#9432;</span>
        Cannot locate closing balance. Please verify on the PDF and enter it
        below.
      </div>

      {!submitted ? (
        <div className="flex items-center gap-2">
          <label htmlFor="missing-balance-input" className="sr-only">
            Closing balance
          </label>
          <input
            id="missing-balance-input"
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 12450.75"
            className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-mono text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={value.trim() === "" || Number.isNaN(parseFloat(value))}
            className="helios-btn helios-btn-primary whitespace-nowrap"
          >
            Submit
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Closing balance recorded:{" "}
          <code className="font-mono font-semibold">
            {parseFloat(value).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </code>
          </div>
      )}
    </div>
  );
}