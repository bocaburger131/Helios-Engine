import { describe, it, expect } from "vitest";
import { parseTelemetryTimeline } from "./parseTelemetryTimeline";

describe("parseTelemetryTimeline", () => {
  it("aggregates multi-file parseQualityByFile into one Standard Parse step", () => {
    const events = parseTelemetryTimeline({
      data: {
        statement: {
          analysis: {
            metadata: {
              parseQualityByFile: [
                {
                  fileName: "a.pdf",
                  checksumOk: true,
                  parseQuality: "OK",
                  transactionCount: 100,
                },
                {
                  fileName: "b.pdf",
                  checksumOk: false,
                  parseQuality: "FAILED_CHECKSUM",
                  transactionCount: 50,
                },
                {
                  fileName: "c.pdf",
                  checksumOk: true,
                  parseQuality: "OK",
                  transactionCount: 20,
                },
              ],
              llmCostTracking: {
                totalCost: 0.12,
                transactionsCategorized: 170,
                service: "Perplexity AI",
              },
              processingDuration: 15000,
            },
            vera: {
              decision: "STIPULATE",
              metadata: {
                model: "gemini-flash-latest",
                durationMs: 420,
                fallback: false,
              },
            },
          },
          transactions: [],
        },
      },
    });

    const parse = events.find((e) => e.id === "parse-standard");
    expect(parse).toBeDefined();
    expect(parse?.aggregate).toEqual({
      fileCount: 3,
      filesPassed: 2,
      filesFailed: 1,
      transactionCount: 170,
    });
    expect(parse?.status).toBe("failed");
    expect(parse?.detail).toContain("2 passed checksum");
    expect(parse?.detail).toContain("1 failed");

    const checksum = events.find((e) => e.id === "checksum-micro");
    expect(checksum?.status).toBe("failed");
    expect(checksum?.aggregate?.filesFailed).toBe(1);
  });

  it("marks AI Vision rescue for legacy gemini_row_fallback and ai_vision_fallback", () => {
    const eventsLegacy = parseTelemetryTimeline({
      data: {
        statement: {
          analysis: {
            metadata: {
              parseQualityByFile: [
                {
                  fileName: "x.pdf",
                  checksumOk: false,
                  parseQuality: "FAILED_CHECKSUM",
                  transactionCount: 10,
                  layoutPipelineShadow: { layoutFirstWins: true },
                },
              ],
            },
          },
          transactions: [
            { amount: 1, extractionSource: "gemini_row_fallback" },
            { amount: 2, extractionSource: "pdfplumber" },
          ],
        },
      },
    });

    const rescueLegacy = eventsLegacy.find((e) => e.id === "ai-rescue-vision");
    expect(rescueLegacy?.name).toBe("AI Vision Rescue");
    expect(rescueLegacy?.status).toBe("rescued");
    expect(rescueLegacy?.aiDriven).toBe(true);
    expect(rescueLegacy?.detail).toMatch(/1 txn/i);

    const eventsNew = parseTelemetryTimeline({
      transactions: [{ amount: 3, extractionSource: "ai_vision_fallback" }],
      analysis: { metadata: { parseQualityByFile: [] } },
    });
    const rescueNew = eventsNew.find((e) => e.id === "ai-rescue-vision");
    expect(rescueNew?.status).toBe("rescued");
    expect(rescueNew?.name).toBe("AI Vision Rescue");
  });

  it("uses < $0.01 when totalCost is 0", () => {
    const events = parseTelemetryTimeline({
      analysis: {
        metadata: {
          parseQualityByFile: [],
          llmCostTracking: {
            totalCost: 0,
            transactionsCategorized: 0,
            service: "Perplexity AI",
          },
        },
      },
    });

    const llm = events.find((e) => e.id === "llm-cost");
    expect(llm?.costDisplay).toBe("< $0.01");
    expect(llm?.costUsd).toBeNull();
  });

  it("uses Tracking Pending when llmCostTracking is missing", () => {
    const events = parseTelemetryTimeline({
      analysis: {
        metadata: {
          parseQualityByFile: [{ fileName: "a.pdf", checksumOk: true }],
        },
      },
    });

    const llm = events.find((e) => e.id === "llm-cost");
    expect(llm?.costDisplay).toBe("Tracking Pending");
  });

  it("sets warning when vera.metadata.fallback is true", () => {
    const events = parseTelemetryTimeline({
      analysis: {
        metadata: { parseQualityByFile: [] },
        vera: {
          decision: "FUND",
          metadata: {
            model: "deterministic",
            durationMs: 0,
            fallback: true,
            source: "deterministic",
          },
        },
      },
    });

    const vera = events.find((e) => e.id === "vera-underwriting");
    expect(vera?.warning).toBe(true);
    expect(vera?.aiDriven).toBe(true);
  });

  it("returns empty array for invalid input", () => {
    expect(parseTelemetryTimeline(null)).toEqual([]);
    expect(parseTelemetryTimeline("x")).toEqual([]);
  });
});
