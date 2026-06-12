"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchBatchJob,
  fetchBatchProgress,
  type BatchProgress,
} from "@/lib/batchUploadClient";

type TimelinePhase = {
  key: string;
  label: string;
  status: "pending" | "active" | "done" | "failed";
  detail?: string;
};

const PHASE_ORDER = [
  { key: "upload", label: "Upload & triage" },
  { key: "parse", label: "Parse statements" },
  { key: "reconcile", label: "Reconcile & checksum" },
  { key: "persist", label: "Persist analysis" },
];

function mapProgressToPhases(progress: BatchProgress | null, jobStatus?: string): TimelinePhase[] {
  const phase = progress?.phase ?? "";
  const failed = jobStatus === "failed";

  return PHASE_ORDER.map((p, i) => {
    let status: TimelinePhase["status"] = "pending";
    if (failed && i === PHASE_ORDER.length - 1) status = "failed";
    else if (phase.includes("parse") && p.key === "parse") status = "active";
    else if (phase.includes("reconcile") && p.key === "reconcile") status = "active";
    else if (jobStatus === "completed" || jobStatus === "COMPLETED_WITH_WARNINGS")
      status = "done";
    else if (i === 0 && progress) status = "done";

    return {
      ...p,
      status,
      detail: progress?.message ?? progress?.fileName,
    };
  });
}

function JobsInner() {
  const searchParams = useSearchParams();
  const initialJob = searchParams.get("jobId") ?? searchParams.get("correlationId") ?? "";
  const [jobId, setJobId] = useState(initialJob);
  const [correlationId, setCorrelationId] = useState(initialJob);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const poll = useCallback(async (jid: string, cid: string) => {
    setPolling(true);
    setError(null);
    try {
      const p = await fetchBatchProgress(cid);
      setProgress(p);
      const job = await fetchBatchJob(jid);
      setJobStatus(job.status ?? null);
      setCorrelationId(job.correlationId ?? cid);
      if (
        job.status !== "completed" &&
        job.status !== "COMPLETED_WITH_WARNINGS" &&
        job.status !== "failed"
      ) {
        setTimeout(() => poll(jid, cid), 5000);
      } else {
        setPolling(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Poll failed");
      setPolling(false);
    }
  }, []);

  useEffect(() => {
    if (initialJob) poll(initialJob, initialJob);
  }, [initialJob, poll]);

  const load = () => {
    if (!jobId.trim()) return;
    window.location.href = `/dev/jobs?jobId=${encodeURIComponent(jobId.trim())}`;
  };

  const phases = mapProgressToPhases(progress, jobStatus ?? undefined);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Batch Timeline</h1>
        <p className="mt-1 text-sm text-slate-600">
          Replay macro job phases from correlation or job ID.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          placeholder="Job ID or correlation ID"
          className="min-w-[240px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
        />
        <button type="button" onClick={load} className="helios-btn helios-btn-primary">
          Track
        </button>
      </div>

      {correlationId && (
        <p className="font-mono text-xs text-slate-500">Correlation: {correlationId}</p>
      )}
      {jobStatus && (
        <p className="text-sm">
          Status: <strong>{jobStatus}</strong>
          {polling && " · polling…"}
        </p>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <ol className="space-y-3">
        {phases.map((p) => (
          <li
            key={p.key}
            className={`helios-card border-l-4 p-4 ${
              p.status === "done"
                ? "border-l-emerald-500"
                : p.status === "active"
                  ? "border-l-blue-500"
                  : p.status === "failed"
                    ? "border-l-rose-500"
                    : "border-l-slate-200"
            }`}
          >
            <p className="font-medium text-slate-900">{p.label}</p>
            {p.detail && <p className="mt-1 text-sm text-slate-600">{p.detail}</p>}
            <p className="mt-1 text-xs uppercase text-slate-400">{p.status}</p>
          </li>
        ))}
      </ol>

      {progress?.phase && (
        <p className="text-xs text-slate-500">Current phase: {progress.phase}</p>
      )}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading…</p>}>
      <JobsInner />
    </Suspense>
  );
}
