"use client";

export type ChatMessage = {
  id: string;
  html: string;
  variant: "system" | "success" | "warning" | "error" | "deal";
};

const VARIANT_CLASS: Record<ChatMessage["variant"], string> = {
  system: "chat-bubble chat-bubble--system",
  success: "chat-bubble chat-bubble--success",
  warning: "chat-bubble chat-bubble--warning",
  error: "chat-bubble chat-bubble--error",
  deal: "chat-bubble chat-bubble--deal",
};

type Props = {
  messages: ChatMessage[];
};

export default function UploadChatLog({ messages }: Props) {
  return (
    <div
      className="flex min-h-[200px] max-h-[420px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--helios-border)] bg-white p-4"
      aria-live="polite"
    >
      {messages.length === 0 && (
        <p className="text-sm text-slate-500">
          Drop bank statement PDFs to begin. Files are auto-classified before analysis.
        </p>
      )}
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={VARIANT_CLASS[msg.variant]}
          dangerouslySetInnerHTML={{ __html: msg.html }}
        />
      ))}
    </div>
  );
}

export function createMessage(
  html: string,
  variant: ChatMessage["variant"] = "system"
): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    html,
    variant,
  };
}
