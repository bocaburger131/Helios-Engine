"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "@/lib/pdfWorker";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

export type SmartPdfViewerProps = {
  /** Blob URL or http(s) URL to the PDF. */
  fileUrl: string;
  /** 1-based page to open initially (clamped after load). */
  targetPageNumber?: number;
  className?: string;
  title?: string;
};

function clampPage(n: number, numPages: number): number {
  if (!Number.isFinite(n) || numPages < 1) return 1;
  return Math.min(Math.max(1, Math.floor(n)), numPages);
}

/**
 * react-pdf viewer with optional target-page jump and Prev/Next controls.
 */
export default function SmartPdfViewer({
  fileUrl,
  targetPageNumber,
  className = "",
  title = "PDF",
}: SmartPdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(360);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.clientWidth;
      if (w > 40) setPageWidth(Math.floor(w - 16));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setLoadError(null);
    setNumPages(0);
    const initial =
      targetPageNumber != null && Number.isFinite(targetPageNumber)
        ? Math.max(1, Math.floor(targetPageNumber))
        : 1;
    setPage(initial);
  }, [fileUrl, targetPageNumber]);

  const onLoadSuccess = useCallback(
    ({ numPages: next }: { numPages: number }) => {
      setNumPages(next);
      setLoadError(null);
      setPage((prev) => {
        const preferred =
          targetPageNumber != null && Number.isFinite(targetPageNumber)
            ? targetPageNumber
            : prev;
        return clampPage(preferred, next);
      });
    },
    [targetPageNumber]
  );

  const onLoadError = useCallback((err: Error) => {
    setLoadError(err?.message || "Failed to load PDF");
    setNumPages(0);
  }, []);

  const goPrev = () => setPage((p) => clampPage(p - 1, numPages || 1));
  const goNext = () => setPage((p) => clampPage(p + 1, numPages || 1));

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${className}`}
      ref={containerRef}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-1.5">
        <button
          type="button"
          onClick={goPrev}
          disabled={page <= 1 || numPages < 1}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="font-mono text-xs text-slate-600" title={title}>
          {numPages > 0 ? `Page ${page} / ${numPages}` : "Loading…"}
        </span>
        <button
          type="button"
          onClick={goNext}
          disabled={numPages < 1 || page >= numPages}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-2">
        {loadError ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
            <p className="text-sm font-medium text-slate-700">PDF load failed</p>
            <p className="text-xs text-slate-500">{loadError}</p>
          </div>
        ) : (
          <Document
            file={fileUrl}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            loading={
              <p className="p-4 text-center text-xs text-slate-500">
                Loading PDF…
              </p>
            }
            className="flex justify-center"
          >
            <Page
              pageNumber={page}
              width={pageWidth}
              renderTextLayer
              renderAnnotationLayer
              loading={
                <p className="p-4 text-center text-xs text-slate-500">
                  Rendering page…
                </p>
              }
            />
          </Document>
        )}
      </div>
    </div>
  );
}
