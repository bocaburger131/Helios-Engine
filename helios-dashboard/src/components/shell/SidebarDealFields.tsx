"use client";

import { useDealContext } from "@/components/shell/DealContext";

export default function SidebarDealFields() {
  const {
    dealId,
    companyName,
    statedRevenue,
    requestedLoanAmount,
    setDealId,
    setCompanyName,
    setStatedRevenue,
    setRequestedLoanAmount,
  } = useDealContext();

  return (
    <div className="space-y-3 border-b border-white/10 pb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Deal context
      </p>
      <label className="block text-xs text-slate-400">
        Deal ID
        <input
          type="text"
          value={dealId}
          onChange={(e) => setDealId(e.target.value)}
          placeholder="Optional"
          className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500"
        />
      </label>
      <label className="block text-xs text-slate-400">
        Business name
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company name"
          className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500"
        />
      </label>
      <label className="block text-xs text-slate-400">
        Requested amount
        <input
          type="text"
          value={requestedLoanAmount}
          onChange={(e) => setRequestedLoanAmount(e.target.value)}
          placeholder="$0"
          className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500"
        />
      </label>
      <label className="block text-xs text-slate-400">
        Stated revenue
        <input
          type="text"
          value={statedRevenue}
          onChange={(e) => setStatedRevenue(e.target.value)}
          placeholder="$0"
          className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white placeholder:text-slate-500"
        />
      </label>
    </div>
  );
}
