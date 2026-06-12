"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HeliosStatementPayload } from "@/lib/analysisAdapter";

import {

  findRegionKeyForCategory,

  formatArchiveStats,

  regionPageIndex,

  regionTypeLabel,

} from "@/lib/provenanceUtils";



type Region = {

  type?: string;

  regionType?: string;

  pageIndex?: number | null;

  bbox?: { x: number; y: number; w: number; h: number } | null;

  text?: string;

  excerpt?: string;

};



type ProvenanceView = "financial" | "archive";



type Props = {

  payload: HeliosStatementPayload;

  pdfUrl?: string | null;

  highlightCategory?: string | null;

};



export default function DocumentProvenance({

  payload,

  pdfUrl,

  highlightCategory,

}: Props) {

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [activeRegion, setActiveRegion] = useState<string | null>(null);

  const [view, setView] = useState<ProvenanceView>("financial");



  const analysis = payload.data?.statement?.analysis;

  const documentMap = analysis?.documentMap;

  const contextArchive = analysis?.contextArchive;



  const regions = documentMap?.regions ?? {};

  const regionList = Object.entries(regions).filter(([, r]) => r?.text?.length);



  const archiveEntries = useMemo(() => {

    if (contextArchive?.entries?.length) {

      return contextArchive.entries.map((e) => ({

        key: e.id ?? e.regionType ?? "entry",

        region: {

          regionType: e.regionType,

          pageIndex: e.pageIndex,

          text: e.excerpt,

        } as Region,

      }));

    }

    const ignored = documentMap?.ignoredRegions ?? [];

    return ignored.map((r, idx) => ({

      key: r.id ?? `ignored_${idx}`,

      region: {

        regionType: r.regionType ?? r.type,

        pageIndex: r.pageIndex,

        text: r.text,

      } as Region,

    }));

  }, [contextArchive, documentMap?.ignoredRegions]);



  const archiveStatsLine = formatArchiveStats(contextArchive?.stats ?? null);



  const scrollToRegion = useCallback((key: string, region: Region) => {

    setActiveRegion(key);

    const pageIndex = regionPageIndex(region);

    if (pageIndex != null && iframeRef.current?.contentWindow) {

      iframeRef.current.contentWindow.postMessage(

        {

          type: "helios-scroll-page",

          pageIndex,

          regionKey: key,

          bbox: region.bbox ?? null,

        },

        "*"

      );

    }

  }, []);



  const scrollToCategory = useCallback(

    (category: string) => {

      const key = findRegionKeyForCategory(regions, category);

      if (key && regions[key]) scrollToRegion(key, regions[key] as Region);

    },

    [regions, scrollToRegion]

  );



  useEffect(() => {

    if (highlightCategory && view === "financial") scrollToCategory(highlightCategory);

  }, [highlightCategory, scrollToCategory, view]);



  return (

    <section className="helios-card overflow-hidden">

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">

        <div>

          <h2 className="text-lg font-semibold text-slate-900">Document provenance</h2>

          {highlightCategory && view === "financial" && (

            <p className="text-xs text-slate-500">Highlighting: {highlightCategory}</p>

          )}

          {view === "archive" && archiveStatsLine && (

            <p className="text-xs text-amber-700">{archiveStatsLine}</p>

          )}

        </div>

        <div

          className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm"

          role="tablist"

          aria-label="Provenance view"

        >

          <button

            type="button"

            role="tab"

            aria-selected={view === "financial"}

            className={`rounded-md px-3 py-1.5 ${

              view === "financial"

                ? "bg-slate-900 text-white"

                : "text-slate-600 hover:bg-slate-50"

            }`}

            onClick={() => setView("financial")}

          >

            Financial regions

          </button>

          <button

            type="button"

            role="tab"

            aria-selected={view === "archive"}

            className={`rounded-md px-3 py-1.5 ${

              view === "archive"

                ? "bg-amber-600 text-white"

                : "text-slate-600 hover:bg-slate-50"

            }`}

            onClick={() => setView("archive")}

          >

            Context archive

          </button>

        </div>

      </div>

      <div className="grid gap-0 lg:grid-cols-2">

        <div className="max-h-[360px] overflow-y-auto border-r p-4">

          {view === "financial" ? (

            regionList.length === 0 ? (

              <p className="text-sm text-slate-500">

                No document map regions on this analysis. Run layout-first pipeline to populate.

              </p>

            ) : (

              <ul className="space-y-2">

                {regionList.map(([key, region]) => (

                  <li key={key}>

                    <button

                      type="button"

                      onClick={() => scrollToRegion(key, region as Region)}

                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${

                        activeRegion === key

                          ? "border-blue-400 bg-blue-50"

                          : "border-slate-200 hover:bg-slate-50"

                      }`}

                    >

                      <span className="font-medium capitalize">{key.replace(/_/g, " ")}</span>

                      {region.pageIndex != null && (

                        <span className="ml-2 text-xs text-slate-400">

                          p.{region.pageIndex + 1}

                        </span>

                      )}

                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">

                        {region.text?.slice(0, 120)}

                      </p>

                    </button>

                  </li>

                ))}

              </ul>

            )

          ) : archiveEntries.length === 0 ? (

            <p className="text-sm text-slate-500">

              No ignored regions archived for this statement. Negative-space mapping runs during

              layout-first parse.

            </p>

          ) : (

            <ul className="space-y-2">

              {archiveEntries.map(({ key, region }) => (

                <li key={key}>

                  <button

                    type="button"

                    onClick={() => scrollToRegion(key, region)}

                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${

                      activeRegion === key

                        ? "border-amber-400 bg-amber-50"

                        : "border-slate-200 hover:bg-slate-50"

                    }`}

                  >

                    <span className="inline-flex items-center gap-2">

                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">

                        {regionTypeLabel(region.regionType ?? region.type)}

                      </span>

                      {region.pageIndex != null && (

                        <span className="text-xs text-slate-400">p.{region.pageIndex + 1}</span>

                      )}

                    </span>

                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">

                      {(region.text ?? region.excerpt ?? "").slice(0, 120)}

                    </p>

                  </button>

                </li>

              ))}

            </ul>

          )}

        </div>

        <div className="min-h-[280px] bg-slate-100">

          {pdfUrl ? (

            <iframe

              ref={iframeRef}

              src={pdfUrl}

              title="Source PDF"

              className="h-[360px] w-full border-0"

            />

          ) : (

            <p className="flex h-full items-center justify-center p-6 text-sm text-slate-500">

              PDF preview unavailable — use Vera HITL signed URL when queued.

            </p>

          )}

        </div>

      </div>

    </section>

  );

}


