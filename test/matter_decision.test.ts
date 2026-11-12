import assert from "node:assert/strict";
import test from "node:test";
import { chunkDocument, decideFollowUp } from "../src/matter_decision.ts";

test("a delivered signed document past its follow-up date needs action", () => {
  const intake = { matterId: "m-1", documentId: "signed-1", deliveredAt: "2026-09-01T10:00:00Z", followUpDueAt: "2026-09-10T10:00:00Z" };
  assert.equal(decideFollowUp(intake, new Date("2026-09-11T00:00:00Z")), "due");
  assert.equal(decideFollowUp(intake, new Date("2026-09-09T00:00:00Z")), "scheduled");
  assert.deepEqual(chunkDocument("Consent\n\nDelivery receipt"), ["Consent\n\nDelivery receipt"]);
});
