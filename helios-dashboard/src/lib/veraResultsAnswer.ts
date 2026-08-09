/**
 * Client-side results-only Vera answers when /api/vera/chat is unavailable.
 */
export function answerFromDealContextClient(
  message: string,
  dealContext: Record<string, unknown> | null
): string {
  const ctx = dealContext || {};
  const q = message.toLowerCase();
  const lines: string[] = [];

  const decision = (ctx.veraDecision ?? ctx.decision) as string | null;
  const score = (ctx.veraScore ?? ctx.veritasScore) as number | null;
  const badge = (ctx.veritasBadge ?? ctx.bankabilityLabel) as string | null;
  const metrics =
    ctx.metrics && typeof ctx.metrics === "object"
      ? (ctx.metrics as Record<string, unknown>)
      : {};
  const adb = (metrics.l3mAdb ?? ctx.l3mAdb) as number | null;
  const nsf = (metrics.nsfCount ?? ctx.nsfCount) as number | null;
  const net = ctx.netCashFlow as number | null;
  const checksumOk = ctx.checksumOk as boolean | undefined;
  const failedFiles = Array.isArray(ctx.checksumFailedFiles)
    ? (ctx.checksumFailedFiles as string[])
    : [];
  const company = (ctx.companyName || ctx.bankName) as string | null;

  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  if (
    /pipeline|telemetry|gemini.?vision|extraction|pdf.?plumber/i.test(q) &&
    !/checksum|decision|adb|nsf|cash/i.test(q)
  ) {
    return "I only cover underwriting results (decision, scores, ADB, NSF, cash flow, checksum outcome).";
  }

  if (/checksum|reconcil|did (it|this).*(pass|fail)/i.test(q)) {
    if (checksumOk === true) lines.push("Checksum result: **PASS**.");
    else if (checksumOk === false)
      lines.push(
        `Checksum result: **FAIL**${failedFiles.length ? ` (${failedFiles.join(", ")})` : ""}.`
      );
    else lines.push("Checksum outcome is not in the loaded results.");
  }

  if (/decision|stipulat|fund|decline|veritas|score/i.test(q) || !lines.length) {
    if (decision) {
      lines.push(
        `Vera decision: **${decision}**` +
          (score != null ? ` · **${score}/10**` : "") +
          (badge ? ` (${badge})` : "") +
          "."
      );
    }
  }

  if (/\badb\b|average daily/i.test(q) && adb != null) {
    lines.push(`L3M ADB: **${money(Number(adb))}**.`);
  }
  if (/\bnsf\b/i.test(q) && nsf != null) {
    lines.push(`NSF count: **${nsf}**.`);
  }
  if (/cash.?flow|net cash/i.test(q) && net != null) {
    lines.push(`Net cash flow: **${money(Number(net))}**.`);
  }

  if (!lines.length) {
    const bits = [
      company,
      decision ? `decision ${decision}` : null,
      score != null ? `score ${score}/10` : null,
    ].filter(Boolean);
    return bits.length
      ? `Results snapshot: ${bits.join(" · ")}. Ask about decision, ADB, NSF, cash flow, or checksum.`
      : "No deal results are loaded yet. Open a completed underwriting report and ask again.";
  }

  return lines.join(" ");
}
