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
  decision: string | null;
  score: number | null;
  registryHint?: string | null;
  registryPortalUrl?: string | null;
};

export default function VeraFloatingDock({ statementId, decision, score, registryHint, registryPortalUrl }: Props) {
  const [expanded, setExpanded] = useState(false);
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

  if (!expanded) {
    return (
      <div className="vera-dock">
        <button
          type="button"
          className="helios-card flex items-center gap-3 border-blue-200 bg-white px-4 py-3 shadow-lg transition hover:shadow-xl"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label="Open Vera chat"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            V
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold uppercase text-slate-500">
              {decision ? "Vera decision" : "Ask Vera"}
            </p>
            <p className="text-sm font-semibold text-slate-900">
              {decision ?? "Chat about this deal"}
              {decision && score != null ? ` · ${score}/10` : ""}
            </p>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="helios-vera-dock" role="dialog" aria-label="Vera chat">
      <header className="helios-vera-header">
        <div className="flex items-center gap-2">
          <span>Vera</span>
          {decision && (
            <span className="helios-vera-status text-white/90">
              {decision}
              {score != null ? ` · ${score}/10` : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded px-2 py-1 text-xs text-white/90 hover:bg-white/10"
          aria-expanded={true}
          aria-label="Collapse Vera chat"
        >
          Minimize
        </button>
      </header>

      <div className="helios-vera-body flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-slate-500">
            Ask about deposits, NSF, bankability, or gaps in this deal.
          </p>
        )}
        {registryHint && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p>{registryHint}</p>
            {registryPortalUrl && (
              <a
                href={registryPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-xs font-medium text-blue-700 underline"
              >
                Open state portal to add credits
              </a>
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-4 bg-sky-50 text-sky-950"
                : "mr-4 bg-slate-50 text-slate-800"
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
        {error && (
          <p className="text-xs text-rose-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="helios-vera-input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this deal…"
          disabled={busy}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
