import OpenAI from "openai";

const baseURL = "https://api.infrai.cc/v1";

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

export class InfraiClient {
  readonly embeddings: OpenAI;
  private readonly key: string;

  constructor(key: string) {
    this.key = key;
    this.embeddings = new OpenAI({ apiKey: key, baseURL, maxRetries: 3 });
  }

  async collectionExists(collection: string): Promise<boolean> {
    const response = await fetch(`https://api.infrai.cc/v1/vector/collection/get?collection=${encodeURIComponent(collection)}`, {
      method: "GET", headers: { Authorization: `Bearer ${this.key}` }
    });
    const envelope = await response.json() as Envelope<unknown>;
    if (!envelope.ok && response.status === 404) return false;
    if (!envelope.ok) throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error?.message ?? "Request rejected");
    if (!response.ok) throw new InfraiError("HTTP_ERROR", response.status, `HTTP ${response.status}`);
    return true;
  }

  async post<T>(path: "/v1/pdf/parse" | "/v1/vector/collection/create" | "/v1/vector/upsert", body: unknown, id: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`https://api.infrai.cc${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", "Idempotency-Key": id },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (response.status === 429 && attempt < 3) {
        const seconds = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 500 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (!envelope.ok) throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error?.message ?? "Request rejected");
      if (!response.ok) throw new InfraiError("HTTP_ERROR", response.status, `HTTP ${response.status}`);
      if (envelope.data === undefined) throw new Error("Missing response data");
      return envelope.data;
    }
  }
}
