"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useVera, VERA_ACCENT, VERA_RESULTS_BLUE } from "@/components/vera/VeraProvider";

/**
 * Vera results co-pilot — dark process chrome, anchored above Vera Decision dock.
 */
export default function VeraDrawer() {
  const { isOpen, close, messages, sendMessage, isSending, error, clearError } =
    useVera();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isSending, isOpen]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await sendMessage(text);
  }

  if (!isOpen) return null;

  return (
    <aside
      className="fixed bottom-[9.5rem] right-6 z-50 flex h-[min(480px,55vh)] w-[min(100vw-1.5rem,380px)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Vera results co-pilot"
    >
      <header
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundColor: VERA_ACCENT }}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
            V
          </span>
          <div>
            <p className="text-sm font-semibold tracking-wide">
              Vera Underwriter Co-Pilot
            </p>
            <p className="text-[10px] uppercase tracking-wider text-white/75">
              Results only · dark process chrome
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded-md px-2 py-1 text-sm text-white/90 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label="Close Vera"
        >
          ✕
        </button>
      </header>

      <div
        ref={listRef}
        className="flex-1 space-y-3 overflow-y-auto bg-slate-950 px-4 py-4 text-sm text-slate-100"
      >
        {messages.length === 0 && (
          <p className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-400">
            Ask about this deal&apos;s{" "}
            <span style={{ color: VERA_RESULTS_BLUE }}>results</span>
            {" — "}decision, ADB, NSF, cash flow, checksum outcome. Pipeline /
            telemetry questions are out of scope for now.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-8 rounded-lg bg-slate-800 px-3 py-2 text-slate-100"
                : "mr-2 rounded-lg border bg-[#3366a9]/20 px-3 py-2 text-slate-50"
            }
            style={
              m.role === "assistant"
                ? { borderColor: `${VERA_RESULTS_BLUE}55` }
                : undefined
            }
          >
            <p
              className="mb-1 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                color: m.role === "assistant" ? VERA_RESULTS_BLUE : "#94a3b8",
              }}
            >
              {m.role === "user" ? "You" : "Vera · results"}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
          </div>
        ))}
        {isSending && (
          <p className="text-xs text-slate-500">Vera is reading results…</p>
        )}
        {error && (
          <p className="rounded border border-rose-800 bg-rose-950/50 px-2 py-1.5 text-xs text-rose-300">
            {error}{" "}
            <button type="button" className="underline" onClick={clearError}>
              dismiss
            </button>
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-slate-800 bg-slate-900 p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about results…"
            disabled={isSending}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-[#3366a9] focus:outline-none focus:ring-1 focus:ring-[#3366a9] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || !draft.trim()}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: VERA_ACCENT }}
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}
