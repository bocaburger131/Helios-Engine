"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  PipelineShadowPanel,
  ReconciliationPanel,
  TransactionsSampleTable,
} from "@/components/ParseTestPanels";
import {
  fetchDevConfig,
  formatMoney,
  parseStatementPdf,
  type DevConfig,
  type DevParseResult,
} from "@/lib/apiClient";

export default function ParseTestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DevParseResult | null>(null);
  const [config, setConfig] = useState<DevConfig | null>(null);
  const [usePrimary, setUsePrimary] = useState(false);
  const [useShadow, setUseShadow] = useState(true);

  useEffect(() => {
    fetchDevConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!file) {
        setError("Choose a PDF first");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await parseStatementPdf(file, {
          shadow: useShadow,
          primary: usePrimary,
        });
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Parse failed");
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [file, usePrimary, useShadow]
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-8">
      <header className="space-y-2">
        <Link href="/upload" className="text-sm text-blue-600 hover:underline">
          ← Upload Hub
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Pipeline parse tester</h1>
        <p className="text-sm text-slate-600">
          Upload a statement PDF to run the API parser with layout-first shadow comparison.
        </p>
        {config && (
          <p className="text-xs text-slate-500">
            Server flags — shadow: {String(config.layoutFirstShadow)}, primary:{" "}
            {String(config.layoutFirstPrimary)}, port: {config.apiPort}
          </p>
        )}
      </header>

      <form onSubmit={onSubmit} className="helios-card p-6">
        <label className="block text-sm font-medium text-slate-700">
          Statement PDF
          <input
            type="file"
            accept="application/pdf"
            className="mt-2 block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={useShadow}
              onChange={(e) => setUseShadow(e.target.checked)}
            />
            Run layout-first shadow
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={usePrimary}
              onChange={(e) => setUsePrimary(e.target.checked)}
            />
            Use layout-first as primary
          </label>
        </div>

        <button
          type="submit"
          disabled={loading || !file}
          className="helios-btn helios-btn-primary mt-6"
        >
          {loading ? "Parsing…" : "Parse statement"}
        </button>
        {error && (
          <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        )}
      </form>

      {result && (
        <div className="space-y-6">
          <section className="helios-card p-6">
            <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["File", result.fileName],
                ["Bank", result.bankName ?? "—"],
                ["Profile", result.profileId ?? "—"],
                ["Transactions", String(result.txnCount)],
                ["Opening", formatMoney(result.balances.opening)],
                ["Closing", formatMoney(result.balances.closing)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-xs uppercase text-slate-500">{k}</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="helios-card p-6">
            <h2 className="text-lg font-semibold text-slate-900">Legacy reconciliation</h2>
            <div className="mt-4">
              <ReconciliationPanel
                reconciliation={result.reconciliation}
                stitcherPrinted={result.stitcherPrinted}
              />
            </div>
          </section>

          <section className="helios-card p-6">
            <h2 className="text-lg font-semibold text-slate-900">Layout-first shadow</h2>
            <div className="mt-4">
              <PipelineShadowPanel shadow={result.layoutPipelineShadow} />
            </div>
          </section>

          <section className="helios-card p-6">
            <h2 className="text-lg font-semibold text-slate-900">Sample transactions</h2>
            <div className="mt-4">
              <TransactionsSampleTable rows={result.transactionsSample} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
