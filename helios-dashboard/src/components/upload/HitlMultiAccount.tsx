"use client";

import { useState, useMemo } from "react";

type Props = {
  payload: {
    checksumDelta: number;
    extractedRows: Array<Record<string, unknown>>;
    runId?: string;
  };
};

type Account = "checking" | "savings" | "loc" | "unassigned";

function pickLabel(row: Record<string, unknown>, candidates: string[]): string {
  for (const key of candidates) {
    const val = row[key];
    if (val !== undefined && val !== null) return String(val);
  }
  return "—";
}

function pickAmount(row: Record<string, unknown>): number {
  for (const key of ["amount", "value", "transactionAmount", "valueAmount"]) {
    const val = row[key];
    if (val !== undefined && val !== null) {
      const n = Number(val);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

const ACCOUNT_COLORS: Record<Account, string> = {
  checking: "blue",
  savings: "green",
  loc: "purple",
  unassigned: "slate",
};

export default function HitlMultiAccount({ payload }: Props) {
  const rows = payload.extractedRows;
  const [accounts, setAccounts] = useState<Account[]>(
    () => new Array(rows.length).fill("unassigned")
  );

  const allAssigned = accounts.every((a) => a !== "unassigned");

  const toggleAccount = (index: number) => {
    setAccounts((prev) => {
      const next = [...prev];
      const order: Account[] = ["checking", "savings", "loc", "unassigned"];
      const current = next[index] ?? "unassigned";
      const nextIdx = (order.indexOf(current) + 1) % order.length;
      next[index] = order[nextIdx];
      return next;
    });
  };

  const pillClass = (active: boolean, account: Account) => {
    const color = ACCOUNT_COLORS[account];
    const base = `rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-pointer select-none transition-colors`;
    if (active) {
      const map: Record<Account, string> = {
        checking: "bg-blue-600 text-white shadow-sm",
        savings: "bg-green-600 text-white shadow-sm",
        loc: "bg-purple-600 text-white shadow-sm",
        unassigned: "bg-slate-100 text-slate-500",
      };
      return `${base} ${map[account]}`;
    }
    return `${base} bg-slate-100 text-slate-400 hover:bg-slate-200`;
  };

  const counts = useMemo(() => {
    const c = { checking: 0, savings: 0, loc: 0 };
    accounts.forEach((a) => {
      if (a in c) c[a as keyof typeof c]++;
    });
    return c;
  }, [accounts]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="text-purple-500">&#128196;</span>
        Ambiguous account assignment — categorize each row
      </div>

      <div className="flex gap-4 text-xs font-medium text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
          Checking ({counts.checking})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Savings ({counts.savings})
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
          LOC ({counts.loc})
        </span>
      </div>

      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
        {rows.map((row, i) => {
          const date = pickLabel(row, ["date", "transactionDate"]);
          const desc = pickLabel(row, ["description", "memo", "narrative"]);
          const amt = pickAmount(row);
          const cat = accounts[i] ?? "unassigned";

          return (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="min-w-[80px] text-xs font-mono text-slate-500">
                {date}
              </div>
              <div className="flex-1 min-w-0 truncate text-sm text-slate-800">
                {desc}
              </div>
              <div className="min-w-[70px] text-right text-sm font-mono font-semibold text-slate-700">
                {amt !== 0
                  ? (amt < 0 ? "−" : "+") +
                    " $" +
                    Math.abs(amt).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : "—"}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => toggleAccount(i)}
                  className={pillClass(cat === "checking", "checking")}
                >
                  Checking
                </button>
                <button
                  type="button"
                  onClick={() => toggleAccount(i)}
                  className={pillClass(cat === "savings", "savings")}
                >
                  Savings
                </button>
                <button
                  type="button"
                  onClick={() => toggleAccount(i)}
                  className={pillClass(cat === "loc", "loc")}
                >
                  LOC
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!allAssigned}
        className={`helios-btn helios-btn-primary w-full sm:w-auto ${
          !allAssigned ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {allAssigned ? "Assign Accounts" : "Assign All Rows First"}
      </button>
    </div>
  );
}