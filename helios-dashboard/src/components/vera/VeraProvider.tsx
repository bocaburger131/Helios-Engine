"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_BASE, authHeaders } from "@/lib/apiClient";
import { useDealContextOptional } from "@/components/shell/DealContext";

export type VeraChatRole = "user" | "assistant";

export type VeraChatMessage = {
  id: string;
  role: VeraChatRole;
  content: string;
  grounding?: {
    used: boolean;
    sources: { title?: string; uri?: string }[];
  };
};

export type VeraContextValue = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  messages: VeraChatMessage[];
  dealContext: Record<string, unknown> | null;
  setDealContext: (ctx: Record<string, unknown> | null) => void;
  sendMessage: (text: string) => Promise<void>;
  isSending: boolean;
  error: string | null;
  clearError: () => void;
};

const VeraContext = createContext<VeraContextValue | null>(null);

const VERA_ACCENT = "#3366a9";

function newId() {
  return `vera-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function VeraProvider({ children }: { children: ReactNode }) {
  const deal = useDealContextOptional();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<VeraChatMessage[]>([]);
  const [dealContext, setDealContext] = useState<Record<string, unknown> | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deal) return;
    setDealContext((prev) => {
      const next = {
        ...(prev || {}),
        dealId: deal.dealId,
        companyName: deal.companyName,
        statedRevenue: deal.statedRevenue,
      };
      return next;
    });
  }, [deal?.dealId, deal?.companyName, deal?.statedRevenue]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || isSending) return;

      const userMsg: VeraChatMessage = {
        id: newId(),
        role: "user",
        content: message,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);
      setError(null);

      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch(`${API_BASE}/api/vera/chat`, {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            dealContext,
            history: history.slice(0, -1),
          }),
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            json?.error || json?.details || `Vera chat failed (${res.status})`
          );
        }

        const answer =
          json?.data?.answer || json?.answer || "No response from Vera.";
        const grounding = json?.data?.grounding;

        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: String(answer),
            grounding: grounding
              ? {
                  used: Boolean(grounding.used),
                  sources: Array.isArray(grounding.sources)
                    ? grounding.sources
                    : [],
                }
              : undefined,
          },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Chat failed";
        setError(msg);
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: `Sorry — ${msg}`,
          },
        ]);
      } finally {
        setIsSending(false);
      }
    },
    [dealContext, isSending, messages]
  );

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
      messages,
      dealContext,
      setDealContext,
      sendMessage,
      isSending,
      error,
      clearError,
    }),
    [
      isOpen,
      open,
      close,
      toggle,
      messages,
      dealContext,
      sendMessage,
      isSending,
      error,
      clearError,
    ]
  );

  return <VeraContext.Provider value={value}>{children}</VeraContext.Provider>;
}

export function useVera(): VeraContextValue {
  const ctx = useContext(VeraContext);
  if (!ctx) {
    throw new Error("useVera must be used within VeraProvider");
  }
  return ctx;
}

export function useVeraOptional(): VeraContextValue | null {
  return useContext(VeraContext);
}

export { VERA_ACCENT };
