import { describe, it, expect } from "vitest";
import { formatBatchError } from "./batchUploadClient";

describe("formatBatchError", () => {
  it("returns gate recommendation for INSTITUTION_PROFILE_STEP1_REQUIRED", () => {
    const msg = formatBatchError(
      {
        error: "INSTITUTION_PROFILE_STEP1_REQUIRED",
        institutionProfileGate: {
          bankName: "Chase",
          recommendation:
            "Layout learning active — checksums improve as templates graduate to VERIFIED.",
        },
      },
      202
    );
    expect(msg).toMatch(/Layout learning active/i);
  });

  it("falls back to message field", () => {
    expect(
      formatBatchError({ message: "Bank confirmation required" }, 202)
    ).toBe("Bank confirmation required");
  });

  it("includes status in generic fallback", () => {
    expect(formatBatchError({}, 500)).toBe("Batch failed (500)");
  });
});
