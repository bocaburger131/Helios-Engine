"use client";

import HitlReviewGrid from "./HitlReviewGrid";
import HitlMissingBalance from "./HitlMissingBalance";
import HitlMultiAccount from "./HitlMultiAccount";
import HitlDateFix from "./HitlDateFix";
import HitlFraudReview from "./HitlFraudReview";

export type ReviewPayload = {
  checksumDelta: number;
  extractedRows: Array<Record<string, unknown>>;
  runId?: string;
  anomalies?: string[];
};

export type ChatMessage = {
  id: string;
  html: string;
  variant:
    | "system"
    | "success"
    | "warning"
    | "error"
    | "deal"
    | "hitl"
    | "hitl-missing-balance"
    | "hitl-multi-account"
    | "hitl-date-fix"
    | "hitl-fraud-review";
  reviewPayload?: ReviewPayload;
};

const VARIANT_CLASS: Record<ChatMessage["variant"], string> = {
  system: "chat-bubble chat-bubble--system",
  success: "chat-bubble chat-bubble--success",
  warning: "chat-bubble chat-bubble--warning",
  error: "chat-bubble chat-bubble--error",
  deal: "chat-bubble chat-bubble--deal",
  hitl: "chat-bubble chat-bubble--hitl",
  "hitl-missing-balance": "chat-bubble chat-bubble--hitl-missing-balance",
  "hitl-multi-account": "chat-bubble chat-bubble--hitl-multi-account",
  "hitl-date-fix": "chat-bubble chat-bubble--hitl-date-fix",
  "hitl-fraud-review": "chat-bubble chat-bubble--hitl-fraud-review",
};

type Props = {
  messages: ChatMessage[];
};

function renderHitlContent(
  variant: ChatMessage["variant"],
  payload: NonNullable<ChatMessage["reviewPayload"]>
) {
  switch (variant) {
    case "hitl":
      return <HitlReviewGrid payload={payload} />;
    case "hitl-missing-balance":
      return <HitlMissingBalance payload={payload} />;
    case "hitl-multi-account":
      return <HitlMultiAccount payload={payload} />;
    case "hitl-date-fix":
      return <HitlDateFix payload={payload} />;
    case "hitl-fraud-review":
      return <HitlFraudReview payload={payload} />;
    default:
      return null;
  }
}

export default function UploadChatLog({ messages }: Props) {
  return (
    <div
      className="flex min-h-[200px] max-h-[420px] flex-col gap-3 overflow-y-auto rounded-xl border border-[var(--helios-border)] bg-white p-4"
      aria-live="polite"
    >
      {messages.length === 0 && (
        <p className="text-sm text-slate-500">
          Drop bank statement PDFs to begin. Files are auto-classified before
          analysis.
        </p>
      )}
      {messages.map((msg) => {
        if (
          msg.reviewPayload &&
          msg.variant !== "system" &&
          msg.variant !== "success" &&
          msg.variant !== "warning" &&
          msg.variant !== "error" &&
          msg.variant !== "deal"
        ) {
          return (
            <div key={msg.id} className={VARIANT_CLASS[msg.variant]}>
              {renderHitlContent(msg.variant, msg.reviewPayload)}
            </div>
          );
        }
        return (
          <div
            key={msg.id}
            className={VARIANT_CLASS[msg.variant]}
            dangerouslySetInnerHTML={{ __html: msg.html }}
          />
        );
      })}
    </div>
  );
}

export function createMessage(
  html: string,
  variant: ChatMessage["variant"] = "system",
  reviewPayload?: ReviewPayload
): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    html,
    variant,
    reviewPayload,
  };
}
