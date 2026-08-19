import {
  normalizeHighLevelCategory,
  type HighLevelCategory,
} from "@/lib/categorizerTaxonomy";
import type { HeliosTransaction } from "@/lib/dailyActivityAdapter";

export type CategorizerVitals = {
  trueMonthlyRevenue: number;
  totalOpex: number;
  totalCogs: number;
  totalPayroll: number;
  totalDebtService: number;
  netCashFlow: number;
};

function isCredit(txn: HeliosTransaction): boolean {
  const t = String(txn.type || "").toUpperCase();
  if (t === "CREDIT" || t.includes("DEPOSIT") || t === "IN") return true;
  if (t === "DEBIT" || t.includes("WITHDRAW") || t === "OUT") return false;
  const amt = Number(txn.amount);
  return Number.isFinite(amt) && amt >= 0;
}

function absAmount(txn: HeliosTransaction): number {
  return Math.abs(Number(txn.amount) || 0);
}

function highLevel(txn: HeliosTransaction): HighLevelCategory | "" {
  return normalizeHighLevelCategory(txn.category);
}

/**
 * Client-side vitals from the live categorizer row set.
 * True Monthly Revenue = credits excluding Non-Revenue Transfer / Excluded / High-Risk.
 * Expense totals sum debit absolute amounts by high-level bucket.
 * Net Cash Flow = all credits − all debits (absolute).
 */
export function recalcCategorizerVitals(
  transactions: HeliosTransaction[]
): CategorizerVitals {
  let trueMonthlyRevenue = 0;
  let totalOpex = 0;
  let totalCogs = 0;
  let totalPayroll = 0;
  let totalDebtService = 0;
  let creditSum = 0;
  let debitSum = 0;

  for (const txn of transactions) {
    const amt = absAmount(txn);
    const cat = highLevel(txn);
    if (isCredit(txn)) {
      creditSum += amt;
      const excludeRevenue =
        cat === "NON-REVENUE TRANSFER" ||
        cat === "EXCLUDED" ||
        cat === "HIGH-RISK";
      if (!excludeRevenue) trueMonthlyRevenue += amt;
    } else {
      debitSum += amt;
      if (cat === "COGS") totalCogs += amt;
      else if (cat === "OPEX") totalOpex += amt;
      else if (cat === "PAYROLL") totalPayroll += amt;
      else if (cat === "DEBT SERVICE") totalDebtService += amt;
    }
  }

  return {
    trueMonthlyRevenue,
    totalOpex,
    totalCogs,
    totalPayroll,
    totalDebtService,
    netCashFlow: creditSum - debitSum,
  };
}
