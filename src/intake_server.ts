import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { z } from "zod";
import { chunkDocument, decideFollowUp } from "./matter_decision.ts";
import type { Intake } from "./matter_decision.ts";
import { InfraiClient, InfraiError } from "./infrai_client.ts";

type IntakePayload = Intake & { signedPdf: string };

const intakeSchema = z.object({
  matterId: z.string().min(1),
  documentId: z.string().min(1),
  signedPdf: z.string().min(1),
  deliveredAt: z.string().datetime({ offset: true }),
  followUpDueAt: z.string().datetime({ offset: true })
}).strict().refine((value) => Date.parse(value.followUpDueAt) >= Date.parse(value.deliveredAt), {
  message: "Follow-up must be on or after delivery", path: ["followUpDueAt"]
});

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY");
const client = new InfraiClient(key);
const collection = "legal-matter-intake";
const dimension = 1536;
const model = process.env.INFRAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

createServer(async (request, response) => {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method !== "POST" || request.url !== "/intake") return send(404, { error: "Not found" });
  try {
    let raw = "";
    for await (const part of request) {
      raw += part;
      if (raw.length > 12_000_000) return send(413, { error: "PDF payload too large" });
    }
    const parsed = intakeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return send(400, { error: parsed.error.flatten() });
    const intake = parsed.data as IntakePayload;
    const fingerprint = createHash("sha256").update(intake.signedPdf).digest("hex");
    const documentKey = `${intake.matterId}:${intake.documentId}:${fingerprint}`;
    const pdf = await client.post<{ text?: string; markdown?: string }>("/v1/pdf/parse", { pdf: intake.signedPdf }, `${documentKey}:parse`);
    const chunks = chunkDocument(pdf.markdown ?? pdf.text ?? "");
    if (!chunks.length) return send(422, { error: "Document contains no extractable text" });
    const embeddings = await client.embeddings.embeddings.create({ model, input: chunks });
    if (!await client.collectionExists(collection)) {
      await client.post("/v1/vector/collection/create", { collection, dimension, metric: "cosine" }, `${collection}:create`);
    }
    const vectors = embeddings.data.map(({ embedding }, index) => ({
      id: createHash("sha256").update(`${documentKey}:${index}`).digest("hex"),
      embedding,
      metadata: { matterId: intake.matterId, documentId: intake.documentId, deliveredAt: intake.deliveredAt, followUpDueAt: intake.followUpDueAt, chunk: index, text: chunks[index] }
    }));
    await client.post("/v1/vector/upsert", { collection, vectors }, `${documentKey}:upsert`);
    return send(200, { matterId: intake.matterId, documentId: intake.documentId, delivery: "signed-document-delivered", followUp: decideFollowUp(intake, new Date()), chunksIndexed: vectors.length });
  } catch (error) {
    if (error instanceof InfraiError) return send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.message, code: error.code });
    if (error instanceof SyntaxError) return send(400, { error: "Invalid JSON" });
    console.error(error);
    return send(502, { error: "Intake processing failed" });
  }
}).listen(Number(process.env.PORT ?? 3000), () => console.log("Intake service listening"));
