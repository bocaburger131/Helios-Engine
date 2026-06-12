"use client";

import { useCallback, useState } from "react";
import { PipelineShadowPanel } from "@/components/ParseTestPanels";
import { parseStatementPdf, type DevParseResult } from "@/lib/apiClient";

export default function ComparePage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DevParseResult | null>(null);

  const run = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await parseStatementPdf(file, { shadow: true, primary: false });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [file]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Pipeline Compare</h1>
        <p className="mt-1 text-sm text-slate-600">
          Side-by-side legacy vs layout-first shadow for a single PDF.
        </p>
      </header>

      <div className="helios-card space-y-4 p-6">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        <button
          type="button"
          disabled={!file || loading}
          onClick={run}
          className="helios-btn helios-btn-primary"
        >
          {loading ? "Parsing…" : "Compare pipelines"}
        </button>
        {error && <p className="text-sm text-rose-700">{error}</p>}
      </div>

      {result && (
        <section className="helios-card p-6">
          <h2 className="font-semibold text-slate-900">{result.fileName}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Legacy txns: {result.txnCount} · Profile: {result.profileId ?? "—"}
          </p>
          <div className="mt-4">
            <PipelineShadowPanel shadow={result.layoutPipelineShadow} />
          </div>
        </section>
      )}
    </div>
  );
}
