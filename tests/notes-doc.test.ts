import { describe, expect, it } from "vitest";
import { noteFromDoc } from "../briefing/lib/notes";
import { fromFirestoreDocument } from "../src/team/firestore";

const doc = {
  fields: {
    doc_id: { stringValue: "doc-1" },
    source_id: { stringValue: "kofic-1" },
    title: { stringValue: "제목" },
    team_shared: { booleanValue: false },
    briefing_public: { booleanValue: true },
  },
};

describe("note documents", () => {
  it("reads team_shared from the stored field", () => {
    expect(noteFromDoc(doc)?.team_shared).toBe(false);
    expect(noteFromDoc(doc)?.briefing_public).toBe(true);
    expect(fromFirestoreDocument(doc)?.team_shared).toBe(false);
    const named = fromFirestoreDocument({
      name: "projects/demo/databases/(default)/documents/research_notes/old-doc",
      fields: { source_id: { stringValue: "kofic-1" } },
    });
    expect(named?.doc_id).toBe("old-doc");
  });
});
