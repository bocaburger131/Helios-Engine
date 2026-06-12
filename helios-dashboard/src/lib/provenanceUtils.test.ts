import { describe, it, expect } from "vitest";
import {
  bboxContainsPoint,
  findRegionKeyForCategory,
  regionTypeLabel,
  formatArchiveStats,
} from "./provenanceUtils";

describe("provenanceUtils", () => {
  it("bboxContainsPoint detects inside point", () => {
    expect(bboxContainsPoint({ x: 10, y: 10, w: 100, h: 50 }, 50, 30)).toBe(true);
    expect(bboxContainsPoint({ x: 10, y: 10, w: 100, h: 50 }, 5, 30)).toBe(false);
  });

  it("findRegionKeyForCategory maps NSF to fee_ledger", () => {
    const key = findRegionKeyForCategory(
      { fee_ledger: { type: "fee_ledger" }, summary: { type: "summary" } },
      "NSF"
    );
    expect(key).toBe("fee_ledger");
  });

  it("regionTypeLabel maps ignored types", () => {
    expect(regionTypeLabel("disclosure")).toBe("Disclosure");
    expect(regionTypeLabel("blank_page")).toBe("Blank page");
  });

  it("formatArchiveStats summarizes ignored blocks", () => {
    const line = formatArchiveStats({
      ignoredBlocks: 3,
      ignoredByType: { disclosure: 2, ad: 1, faq: 0, blank_page: 0, unclassified: 0 },
    });
    expect(line).toContain("3 blocks ignored");
    expect(line).toContain("disclosure");
  });
});
