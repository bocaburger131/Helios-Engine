import type { HeliosTransaction } from "@/lib/dailyActivityAdapter";
import {
  HIGH_LEVEL_LABELS,
  normalizeHighLevelCategory,
  TAX_LABELS,
  type TaxDeductible,
} from "@/lib/categorizerTaxonomy";

function formatDate(d: string | Date | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return "";
}

function creditDebit(txn: HeliosTransaction): string {
  const t = String(txn.type || "").toUpperCase();
  if (t === "CREDIT" || t.includes("DEPOSIT")) return "CREDIT";
  if (t === "DEBIT" || t.includes("WITHDRAW")) return "DEBIT";
  return Number(txn.amount) >= 0 ? "CREDIT" : "DEBIT";
}

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export type LedgerExportRow = {
  date: string;
  rawDescription: string;
  type: string;
  amount: number;
  highLevelCategory: string;
  subCategory: string;
  taxDeductibility: string;
  status: string;
};

export function buildLedgerExportRows(
  transactions: HeliosTransaction[]
): LedgerExportRow[] {
  return transactions.map((t) => {
    const hl = normalizeHighLevelCategory(t.category);
    const tax = (t.taxDeductible || "unknown") as TaxDeductible;
    const overridden =
      t.categorizationSource === "analyst_override" ||
      Boolean((t as { flags?: { isReviewed?: boolean } }).flags?.isReviewed);
    return {
      date: formatDate(t.date),
      rawDescription: String(
        t.originalDescription || t.description || ""
      ),
      type: creditDebit(t),
      amount: Number(t.amount) || 0,
      highLevelCategory: hl
        ? HIGH_LEVEL_LABELS[hl]
        : String(t.category || ""),
      subCategory: String(t.subcategory || ""),
      taxDeductibility: TAX_LABELS[tax] || String(t.taxDeductible || "Unknown"),
      status: overridden ? "Analyst Overridden" : "Auto-AI",
    };
  });
}

export function ledgerRowsToCsv(rows: LedgerExportRow[]): string {
  const headers = [
    "Date",
    "Raw Description",
    "Type",
    "Amount",
    "High-Level Category",
    "Sub-Category",
    "Tax Deductibility",
    "Status",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.rawDescription,
        r.type,
        r.amount,
        r.highLevelCategory,
        r.subCategory,
        r.taxDeductibility,
        r.status,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  return lines.join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadLedgerCsv(
  transactions: HeliosTransaction[],
  filename = "ledger-export.csv"
) {
  const csv = ledgerRowsToCsv(buildLedgerExportRows(transactions));
  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, filename);
}

export async function downloadLedgerXlsx(
  transactions: HeliosTransaction[],
  filename = "ledger-export.xlsx"
) {
  const XLSX = await import("xlsx");
  const rows = buildLedgerExportRows(transactions);
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Date: r.date,
      "Raw Description": r.rawDescription,
      Type: r.type,
      Amount: r.amount,
      "High-Level Category": r.highLevelCategory,
      "Sub-Category": r.subCategory,
      "Tax Deductibility": r.taxDeductibility,
      Status: r.status,
    }))
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Ledger");
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}
