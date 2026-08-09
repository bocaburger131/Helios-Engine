"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useVera, VERA_ACCENT } from "@/components/vera/VeraProvider";

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

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity dark:bg-black/50 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!isOpen}
        onClick={close}
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-slate-700 dark:bg-slate-900 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Vera underwriter chat"
        hidden={!isOpen}
      >
        <header
          className="flex items-center justify-between px-4 py-3 text-white"
          style={{ backgroundColor: VERA_ACCENT }}
        >
          <div>
            <p className="text-sm font-semibold tracking-wide">Vera AI</p>
            <p className="text-xs text-white/80">Senior Commercial Underwriter</p>
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
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm text-slate-900 dark:text-slate-100"
        >
          {messages.length === 0 && (
            <p className="text-slate-500 dark:text-slate-400">
              Ask Vera about deal cash flow, risk, or to verify a business entity /
              address on the live web.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg px-3 py-2 ${
                m.role === "user"
                  ? "ml-8 bg-slate-100 dark:bg-slate-800"
                  : "mr-4 border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800/80"
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {m.role === "user" ? "You" : "Vera"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              {m.grounding?.used && m.grounding.sources?.length ? (
                <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  {m.grounding.sources.slice(0, 4).map((s, i) => (
                    <li key={`${m.id}-src-${i}`}>
                      {s.uri ? (
                        <a
                          href={s.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline decoration-slate-400 hover:text-[#3366a9]"
                        >
                          {s.title || s.uri}
                        </a>
                      ) : (
                        <span>{s.title || "Source"}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {isSending && (
            <p className="text-xs text-slate-500 dark:text-slate-400">Vera is thinking…</p>
          )}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {error}{" "}
              <button type="button" className="underline" onClick={clearError}>
                dismiss
              </button>
            </p>
          )}
        </div>

        <form
          onSubmit={onSubmit}
          className="border-t border-slate-200 p-3 dark:border-slate-700"
        >
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask Vera…"
              disabled={isSending}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#3366a9] focus:outline-none focus:ring-1 focus:ring-[#3366a9] disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
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
    </>
  );
}
