"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  extractVeraChatAnswer,
  sendVeraChatMessage,
  type VeraChatMessage,
} from "@/lib/veraChatClient";

type Props = {
  statementId: string;
};

export default function VeraChatPanel({ statementId }: Props) {
  const [messages, setMessages] = useState<VeraChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || busy) return;

      setInput("");
      setError(null);
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setBusy(true);

      try {
        const res = await sendVeraChatMessage(statementId, text);
        const answer =
          extractVeraChatAnswer(res) ||
          "Vera could not generate a response for this question.";
        setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Chat failed";
        setError(msg);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Sorry — ${msg}` },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [input, busy, statementId]
  );

  return (
    <section className="helios-card flex flex-col overflow-hidden">
      <header className="border-b border-[var(--helios-border)] px-4 py-3 sm:px-6">
        <h2 className="text-lg font-semibold text-slate-900">Ask Vera</h2>
        <p className="mt-1 text-sm text-slate-600">
          Underwriting Q&amp;A on this analysis — deposits, NSF, bankability, gaps.
        </p>
      </header>

      <div className="flex max-h-80 min-h-40 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500">
            Example: &quot;What is the average daily balance trend?&quot; or
            &quot;Are there NSF or stacking concerns?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-8 bg-sky-50 text-sky-950"
                : "mr-8 bg-slate-50 text-slate-800"
            }`}
          >
            {m.role === "assistant" ? (
              <div className="prose-vera max-w-none">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
          </div>
        ))}
        {busy && (
          <p className="text-sm text-slate-500" role="status">
            Vera is thinking…
          </p>
        )}
      </div>

      {error && (
        <p className="px-4 text-xs text-rose-600 sm:px-6" role="alert">
          {error}
        </p>
      )}

      <form
        onSubmit={onSubmit}
        className="flex gap-2 border-t border-[var(--helios-border)] px-4 py-3 sm:px-6"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this deal…"
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="helios-btn helios-btn-primary shrink-0 py-2 text-sm disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </section>
  );
}
