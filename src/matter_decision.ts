export type Intake = {
  matterId: string;
  documentId: string;
  deliveredAt: string;
  followUpDueAt: string;
};

export function decideFollowUp(intake: Intake, now: Date): "due" | "scheduled" {
  return Date.parse(intake.followUpDueAt) <= now.getTime() ? "due" : "scheduled";
}

export function chunkDocument(text: string, maxLength = 1200): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    for (let start = 0; start < paragraph.length; start += maxLength) {
      const segment = paragraph.slice(start, start + maxLength);
      if (current && current.length + segment.length + 2 > maxLength) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current}\n\n${segment}` : segment;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
