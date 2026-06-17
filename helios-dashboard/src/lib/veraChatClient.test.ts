import { describe, it, expect } from "vitest";
import { extractVeraChatAnswer } from "./veraChatClient";

describe("extractVeraChatAnswer", () => {
  it("returns answer when present", () => {
    expect(
      extractVeraChatAnswer({
        success: true,
        data: { answer: "  JPMorgan Chase  " },
      })
    ).toBe("JPMorgan Chase");
  });

  it("falls back to legacy response field", () => {
    expect(
      extractVeraChatAnswer({
        success: true,
        data: { response: "Chase Business Complete Checking" },
      })
    ).toBe("Chase Business Complete Checking");
  });

  it("prefers answer over response when both exist", () => {
    expect(
      extractVeraChatAnswer({
        success: true,
        data: { answer: "from answer", response: "from response" },
      })
    ).toBe("from answer");
  });

  it("returns empty string when neither field is set", () => {
    expect(extractVeraChatAnswer({ success: true, data: {} })).toBe("");
  });
});
