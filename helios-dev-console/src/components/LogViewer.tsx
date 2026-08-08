"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LogPayload, ServiceId } from "../helios-api";

const SOURCES: ServiceId[] = ["helios", "ngrok", "docker"];
const LABELS: Record<ServiceId, string> = {
  helios: "Node",
  ngrok: "Ngrok",
  docker: "Docker",
};
const COLORS: Record<ServiceId, string> = {
  helios: "text-emerald-400",
  ngrok: "text-amber-400",
  docker: "text-sky-400",
};

const MAX_LINES = 2000;

export default function LogViewer() {
  const [lines, setLines] = useState<LogPayload[]>([]);
  const [filter, setFilter] = useState<ServiceId | "all" | "nuke">("all");
  const [stick, setStick] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        if (window.helios?.getLogHistory) {
          const hist = await window.helios.getLogHistory({ maxLines: 500 });
          if (!cancelled && hist?.ok && Array.isArray(hist.lines)) {
            setLines(hist.lines.slice(-MAX_LINES));
          }
        }
      } catch {
        /* ignore */
      }
      if (cancelled || !window.helios?.subscribeLogs) return;
      unsub = window.helios.subscribeLogs((payload) => {
        setLines((prev) => {
          const next = [...prev, payload];
          return next.length > MAX_LINES * 3 ? next.slice(-MAX_LINES * 3) : next;
        });
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (stick) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, stick, filter]);

  const bySource = useMemo(() => {
    const map: Record<string, LogPayload[]> = {
      helios: [],
      ngrok: [],
      docker: [],
      nuke: [],
      system: [],
    };
    for (const line of lines) {
      const key = line.source in map ? line.source : "system";
      map[key].push(line);
      if (map[key].length > MAX_LINES) map[key] = map[key].slice(-MAX_LINES);
    }
    return map;
  }, [lines]);

  const clearSource = (id: ServiceId | "all") => {
    if (id === "all") {
      setLines([]);
      return;
    }
    setLines((prev) => prev.filter((l) => l.source !== id));
  };

  const Pane = ({ id }: { id: ServiceId }) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className={`text-xs font-semibold uppercase tracking-wide ${COLORS[id]}`}>
          {LABELS[id]}
        </span>
        <button
          type="button"
          className="text-[10px] text-zinc-500 hover:text-zinc-300"
          onClick={() => clearSource(id)}
        >
          Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-5 text-zinc-300">
        {(bySource[id] || []).map((l, i) => (
          <div
            key={`${id}-${i}-${l.ts}`}
            className={l.stream === "stderr" ? "text-rose-400" : undefined}
          >
            <span className="text-zinc-600">{l.stream === "system" ? "· " : ""}</span>
            {l.line}
          </div>
        ))}
        <div ref={id === "helios" ? bottomRef : undefined} />
      </div>
    </div>
  );

  if (filter !== "all") {
    const list =
      filter === "nuke"
        ? [...(bySource.nuke || []), ...(bySource.system || [])]
        : bySource[filter] || [];
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Toolbar
          filter={filter}
          setFilter={setFilter}
          stick={stick}
          setStick={setStick}
          clearAll={() => clearSource("all")}
        />
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-300">
          {list.map((l, i) => (
            <div key={i} className={l.stream === "stderr" ? "text-rose-400" : undefined}>
              <span className={`${COLORS[l.source as ServiceId] || "text-zinc-500"} mr-2`}>
                [{l.source}]
              </span>
              {l.line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Toolbar
        filter={filter}
        setFilter={setFilter}
        stick={stick}
        setStick={setStick}
        clearAll={() => clearSource("all")}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        {SOURCES.map((id) => (
          <Pane key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

function Toolbar({
  filter,
  setFilter,
  stick,
  setStick,
  clearAll,
}: {
  filter: ServiceId | "all" | "nuke";
  setFilter: (v: ServiceId | "all" | "nuke") => void;
  stick: boolean;
  setStick: (v: boolean) => void;
  clearAll: () => void;
}) {
  const chips: Array<ServiceId | "all" | "nuke"> = [
    "all",
    "helios",
    "ngrok",
    "docker",
    "nuke",
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setFilter(c)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            filter === c
              ? "bg-primary text-white"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          {c === "helios" ? "Node" : c}
        </button>
      ))}
      <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={stick}
          onChange={(e) => setStick(e.target.checked)}
        />
        Stick to bottom
      </label>
      <button
        type="button"
        onClick={clearAll}
        className="text-xs text-zinc-500 hover:text-zinc-300"
      >
        Clear all
      </button>
    </div>
  );
}
