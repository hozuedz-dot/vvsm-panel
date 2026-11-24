// Translatable server messages. The server stores/returns tokens like ⟦key|{"node":"IRAN"}⟧ and the
// client renders them in the admin's language (see components/Msg.tsx). Plain text passes through.
export function M(key: string, params: Record<string, string | number> = {}): string {
  return `⟦${key}|${JSON.stringify(params).replace(/⟧/g, "]")}⟧`;
}

const RE = /⟦([\w.-]+)\|(\{.*?\})⟧/g;

export function renderMsg(t: (k: string, v?: Record<string, string | number>) => string, text: string): string {
  if (!text || !text.includes("⟦")) return text || "";
  return text.replace(RE, (_m, key: string, json: string) => {
    try {
      return t(`msg.${key}`, JSON.parse(json));
    } catch {
      return key;
    }
  });
}
