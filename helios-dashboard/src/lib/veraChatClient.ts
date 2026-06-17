import { API_BASE, authHeaders } from "@/lib/apiClient";

export type VeraChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type VeraChatResponse = {
  success?: boolean;
  data?: {
    answer?: string;
    response?: string;
    ai?: { fallback?: boolean };
    error?: string;
  };
  error?: string;
};

/** Normalize API chat payload — server may return `answer` or legacy `response`. */
export function extractVeraChatAnswer(
  res: VeraChatResponse | null | undefined
): string {
  const text = res?.data?.answer ?? res?.data?.response;
  return typeof text === "string" ? text.trim() : "";
}

export async function sendVeraChatMessage(
  statementId: string,
  message: string
): Promise<VeraChatResponse> {
  const res = await fetch(`${API_BASE}/api/statements/analysis/chat`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ statementId, message }),
  });

  const json = (await res.json().catch(() => ({}))) as VeraChatResponse;
  if (!res.ok || json.success === false) {
    throw new Error(
      json.error || json.data?.error || `Vera chat failed (${res.status})`
    );
  }
  return json;
}
