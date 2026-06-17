"use client";

import {
  formatMoney,
  type DevParseResult,
  type LayoutPipelineShadow,
  type ParseReconciliation,
} from "@/lib/apiClient";

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-800"
          : "bg-rose-100 text-rose-800"
      }`}
    >
      {label}: {ok ? "PASS" : "FAIL"}
    </span>
  );
}

function MetricRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "good" | "bad" | "neutral";
}) {
  const tone =
    highlight === "good"
      ? "text-emerald-700"
      : highlight === "bad"
        ? "text-rose-700"
        : "text-slate-700";
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-medium ${tone}`}>{value}</span>
    </div>
  );
}

export function ReconciliationPanel({
  reconciliation,
  stitcherPrinted,
}: {
  reconciliation: ParseReconciliation | null;
  stitcherPrinted?: DevParseResult["stitcherPrinted"];
}) {
  if (!reconciliation) {
    return (
      <p className="text-sm text-slate-500">No reconciliation data returned.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <StatusBadge ok={Boolean(reconciliation.checksumOk)} label="Checksum" />
        <StatusBadge ok={Boolean(reconciliation.depositsMatch)} label="Deposits" />
        <StatusBadge ok={Boolean(reconciliation.withdrawalsMatch)} label="Withdrawals" />
        <StatusBadge ok={Boolean(reconciliation.closingMatch)} label="Closing" />
      </div>
      <div className="grid gap-2 rounded-lg bg-slate-50 p-3">
        <MetricRow
          label="Parsed deposits"
          value={formatMoney(reconciliation.parsedDeposits)}
        />
        <MetricRow
          label="Printed deposits"
          value={formatMoney(reconciliation.printedDeposits ?? stitcherPrinted?.totalDeposits)}
        />
        <MetricRow
          label="Parsed withdrawals"
          value={formatMoney(reconciliation.parsedWithdrawals)}
        />
        <MetricRow
          label="Printed withdrawals"
          value={formatMoney(reconciliation.printedWithdrawals ?? stitcherPrinted?.totalWithdrawals)}
        />
        <MetricRow
          label="Computed closing"
          value={formatMoney(reconciliation.computedClosing)}
        />
        <MetricRow
          label="Printed closing"
          value={formatMoney(reconciliation.closing ?? stitcherPrinted?.closing)}
        />
      </div>
    </div>
  );
}

export function PipelineShadowPanel({ shadow }: { shadow: LayoutPipelineShadow | null }) {
  if (!shadow) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        No shadow metrics — enable layout pipeline on the API (
        <code className="rounded bg-amber-100 px-1">LAYOUT_FIRST_SHADOW=true</code>
        ) or upload with shadow mode (default on dev parse).
      </div>
    );
  }

  const inflationBad =
    shadow.depositInflationLegacy != null && shadow.depositInflationLegacy > 1.02;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {shadow.layoutFirstWins && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
            Layout-first wins
          </span>
        )}
        {!shadow.layoutFirstWins && shadow.checksumOkLayoutFirst && !shadow.checksumOkLegacy && (
          <p className="w-full text-xs text-sky-800">
            Layout-first checksum passes where legacy fails — trust improves as the template graduates to VERIFIED.
          </p>
        )}
        {shadow.promoteCandidate && (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            Promote candidate
          </span>
        )}
      </div>
      <div className="grid gap-2 rounded-lg bg-slate-50 p-3">
        <MetricRow
          label="Legacy checksum"
          value={shadow.checksumOkLegacy ? "OK" : "FAIL"}
          highlight={shadow.checksumOkLegacy ? "good" : "bad"}
        />
        <MetricRow
          label="Layout-first checksum"
          value={shadow.checksumOkLayoutFirst ? "OK" : "FAIL"}
          highlight={shadow.checksumOkLayoutFirst ? "good" : "bad"}
        />
        <MetricRow
          label="Txn count (legacy → new)"
          value={`${shadow.legacyTxnCount ?? "—"} → ${shadow.newTxnCount ?? "—"} (Δ ${shadow.txnCountDelta ?? 0})`}
        />
        <MetricRow
          label="Deposit delta (new − legacy)"
          value={
            shadow.depositDelta != null
              ? formatMoney(shadow.depositDelta)
              : "—"
          }
        />
        <MetricRow
          label="Legacy deposit inflation"
          value={
            shadow.depositInflationLegacy != null
              ? `${shadow.depositInflationLegacy}×`
              : "—"
          }
          highlight={inflationBad ? "bad" : "good"}
        />
        <MetricRow
          label="Layout-first deposit inflation"
          value={
            shadow.depositInflationNew != null
              ? `${shadow.depositInflationNew}×`
              : "—"
          }
          highlight={
            shadow.depositInflationNew != null && shadow.depositInflationNew > 1.02
              ? "bad"
              : "good"
          }
        />
        <MetricRow
          label="Profile match"
          value={shadow.profileIdMatch ? "Yes" : "No"}
          highlight={shadow.profileIdMatch ? "good" : "neutral"}
        />
      </div>
    </div>
  );
}

export function TransactionsSampleTable({
  rows,
}: {
  rows: DevParseResult["transactionsSample"];
}) {
  if (!rows.length) {
    return <p className="text-sm text-slate-500">No transactions extracted.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i} className="text-slate-800">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                {row.date ?? "—"}
              </td>
              <td className="max-w-xs truncate px-3 py-2">{row.description ?? "—"}</td>
              <td
                className={`whitespace-nowrap px-3 py-2 text-right font-mono ${
                  (row.amount ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {formatMoney(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
