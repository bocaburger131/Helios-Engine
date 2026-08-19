/**
 * Analyst categorizer taxonomy (mirrors API allowlists).
 */

export const HIGH_LEVEL_CATEGORIES = [
  "COGS",
  "OPEX",
  "PAYROLL",
  "DEBT SERVICE",
  "NON-REVENUE TRANSFER",
  "HIGH-RISK",
  "EXCLUDED",
] as const;

export type HighLevelCategory = (typeof HIGH_LEVEL_CATEGORIES)[number];

export const HIGH_LEVEL_LABELS: Record<HighLevelCategory, string> = {
  COGS: "COGS",
  OPEX: "OpEx",
  PAYROLL: "Payroll",
  "DEBT SERVICE": "Debt Service",
  "NON-REVENUE TRANSFER": "Non-Revenue Transfer",
  "HIGH-RISK": "High-Risk",
  EXCLUDED: "Excluded",
};

export const SUBCATEGORIES_BY_HIGH_LEVEL: Record<
  HighLevelCategory,
  readonly string[]
> = {
  COGS: ["EQUIPMENT", "INVENTORY", "SUPPLIES"],
  OPEX: [
    "RENT",
    "UTILITIES",
    "SOFTWARE",
    "MERCHANT FEE",
    "INSURANCE",
    "OTHER OPEX",
  ],
  PAYROLL: ["WAGES", "CONTRACTOR", "BENEFITS", "PAYROLL TAX"],
  "DEBT SERVICE": ["LOAN DEBIT", "MCA DEBIT", "CREDIT CARD PAYMENT"],
  "NON-REVENUE TRANSFER": [
    "INTERNAL TRANSFER",
    "OWNER DRAW",
    "OWNER CONTRIBUTION",
  ],
  "HIGH-RISK": ["GAMBLING", "CASH ADVANCE", "CRYPTO", "OTHER HIGH-RISK"],
  EXCLUDED: ["DUPLICATE", "VOID", "REVERSAL", "OTHER EXCLUDED"],
};

export const TAX_DEDUCTIBLE_VALUES = [
  "deductible",
  "non_deductible",
  "unknown",
] as const;

export type TaxDeductible = (typeof TAX_DEDUCTIBLE_VALUES)[number];

export const TAX_LABELS: Record<TaxDeductible, string> = {
  deductible: "Deductible",
  non_deductible: "Non-deductible",
  unknown: "Unknown",
};

export function normalizeHighLevelCategory(
  raw: string | undefined | null
): HighLevelCategory | "" {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/_/g, " ");
  if ((HIGH_LEVEL_CATEGORIES as readonly string[]).includes(s)) {
    return s as HighLevelCategory;
  }
  if (s.includes("COGS") || s.includes("EQUIPMENT") || s.includes("INVENTORY"))
    return "COGS";
  if (s.includes("PAYROLL") || s.includes("WAGE") || s.includes("SALARY"))
    return "PAYROLL";
  if (s.includes("DEBT") || s.includes("MCA") || s.includes("LOAN DEBIT"))
    return "DEBT SERVICE";
  if (
    s.includes("TRANSFER") ||
    s.includes("NON-REVENUE") ||
    s.includes("NON REVENUE")
  )
    return "NON-REVENUE TRANSFER";
  if (s.includes("HIGH") && s.includes("RISK")) return "HIGH-RISK";
  if (s.includes("EXCLUD") || s.includes("VOID")) return "EXCLUDED";
  if (
    s.includes("OPEX") ||
    s.includes("OPERATIONS") ||
    s.includes("RENT") ||
    s.includes("UTILIT")
  )
    return "OPEX";
  return "";
}

export function subcategoriesFor(highLevel: string): readonly string[] {
  const hl = normalizeHighLevelCategory(highLevel);
  if (!hl) return [];
  return SUBCATEGORIES_BY_HIGH_LEVEL[hl];
}

export function formatSubcategoryLabel(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
