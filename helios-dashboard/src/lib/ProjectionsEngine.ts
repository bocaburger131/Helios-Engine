/**
 * 3-month moving average projections from forensic monthly breakdown.
 */

import type { HeliosStatementPayload } from "@/lib/analysisAdapter";
import { buildBaseMonthlyRows } from "@/lib/analysisAdapter";

export type ProjectionRow = {
  label: string;
  monthKey: string;
  deposits: number;
  withdrawals: number;
  net: number;
  projected?: boolean;
};

export function buildMonthlyProjections(
  payload: HeliosStatementPayload,
  horizonMonths = 3
): ProjectionRow[] {
  const rows = buildBaseMonthlyRows(payload);
  if (!rows.length) return [];

  const historical = rows.map((r) => ({
    label: r.label,
    monthKey: r.monthKey,
    deposits: r.deposits,
    withdrawals: r.withdrawals,
    net: r.deposits - r.withdrawals,
    projected: false,
  }));

  const window = historical.slice(-horizonMonths);
  if (window.length < 2) return window;

  const avgDeposits =
    window.reduce((s, r) => s + r.deposits, 0) / window.length;
  const avgWithdrawals =
    window.reduce((s, r) => s + r.withdrawals, 0) / window.length;
  const avgNet = avgDeposits - avgWithdrawals;

  const lastKey = window[window.length - 1]?.monthKey ?? "proj";
  const projected: ProjectionRow = {
    label: "Projected (MA)",
    monthKey: `${lastKey}-proj`,
    deposits: Math.round(avgDeposits),
    withdrawals: Math.round(avgWithdrawals),
    net: Math.round(avgNet),
    projected: true,
  };

  return [...window, projected];
}

export function l3mMovingAverageNet(payload: HeliosStatementPayload): number | null {
  const rows = buildMonthlyProjections(payload, 3).filter((r) => !r.projected);
  if (!rows.length) return null;
  const sum = rows.reduce((s, r) => s + r.net, 0);
  return Math.round(sum / rows.length);
}
