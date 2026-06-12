export type Bbox = { x: number; y: number; w: number; h: number };

export function regionPageIndex(region: { pageIndex?: number | null }): number | null {
  return region.pageIndex != null ? region.pageIndex : null;
}

export function bboxContainsPoint(
  bbox: Bbox,
  px: number,
  py: number
): boolean {
  return (
    px >= bbox.x &&
    px <= bbox.x + bbox.w &&
    py >= bbox.y &&
    py <= bbox.y + bbox.h
  );
}

export function findRegionKeyForCategory(
  regions: Record<string, { type?: string }>,
  category: string
): string | null {
  const normalized = category.toLowerCase();
  for (const [key, region] of Object.entries(regions)) {
    if (key.toLowerCase().includes(normalized)) return key;
    if (region.type?.toLowerCase().includes(normalized)) return key;
  }
  if (normalized.includes("nsf") || normalized.includes("overdraft") || normalized.includes("fee")) {
    return regions.fee_ledger ? "fee_ledger" : null;
  }
  return null;
}

const REGION_TYPE_LABELS: Record<string, string> = {
  ad: "Ad",
  faq: "FAQ",
  blank_page: "Blank page",
  disclosure: "Disclosure",
  unclassified: "Unclassified",
  summary: "Summary",
  transactionHistory: "Transaction history",
  fee_ledger: "Fee ledger",
  identity: "Identity",
};

export function regionTypeLabel(regionType?: string | null): string {
  if (!regionType) return "Unknown";
  return REGION_TYPE_LABELS[regionType] ?? regionType.replace(/_/g, " ");
}

export function formatArchiveStats(
  stats?: {
    ignoredBlocks?: number;
    ignoredByType?: Record<string, number>;
  } | null
): string | null {
  if (!stats?.ignoredBlocks) return null;
  const parts: string[] = [];
  const byType = stats.ignoredByType ?? {};
  for (const [key, count] of Object.entries(byType)) {
    if (count > 0) parts.push(`${count} ${regionTypeLabel(key).toLowerCase()}${count === 1 ? "" : "s"}`);
  }
  const detail = parts.length ? ` (${parts.join(", ")})` : "";
  return `${stats.ignoredBlocks} block${stats.ignoredBlocks === 1 ? "" : "s"} ignored${detail}`;
}
