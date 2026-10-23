import { Transform } from "@tiptap/pm/transform";
import {
  buildTextMap,
  evaluationSchema,
  resolveAnchor,
  plainDocument,
} from "./anchors";
import type { FindingV2 } from "./contracts";
import type { Draft } from "../contracts";
export function canTransferRevision(
  draft: Draft,
  original: Draft,
  revisionDocument: Record<string, unknown>,
  lastApplied?: Record<string, unknown> | null,
): boolean {
  const canonical = (doc: Record<string, unknown>) =>
    JSON.stringify(evaluationSchema.nodeFromJSON(doc).toJSON());
  const current = canonical(draft.document ?? plainDocument(draft.text));
  return [
    original.document ?? plainDocument(original.text),
    revisionDocument,
    ...(lastApplied ? [lastApplied] : []),
  ].some((doc) => canonical(doc) === current);
}
export type Decision = "pending" | "accepted" | "rejected";
export interface Revision {
  base: Record<string, unknown>;
  document: Record<string, unknown>;
  items: FindingV2[];
  decisions: Record<string, Decision>;
  conflicts: string[];
}
export function createRevision(
  base: Record<string, unknown>,
  items: FindingV2[],
): Revision {
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error("Identificadores de sugestão duplicados.");
  return { base, document: base, items, decisions: {}, conflicts: [] };
}
export function decideRevision(
  revision: Revision,
  id: string,
  state: Decision,
): Revision {
  if (!revision.items.some((f) => f.id === id))
    throw new Error("Sugestão inexistente.");
  const decisions = { ...revision.decisions, [id]: state };
  const map = buildTextMap(revision.base);
  const transform = new Transform(evaluationSchema.nodeFromJSON(revision.base));
  const conflicts: string[] = [];
  let previousStart = Infinity;
  const patches = revision.items
    .filter((f) => decisions[f.id] === "accepted")
    .map((f) => ({
      f,
      a: f.replacement && f.anchor ? resolveAnchor(map, f.anchor) : null,
    }))
    .sort((a, b) => (b.a?.start ?? -1) - (a.a?.start ?? -1));
  for (const { f, a } of patches) {
    if (!a || a.end > previousStart) {
      conflicts.push(f.id);
      continue;
    }
    const marks =
      transform.doc.nodeAt(a.from)?.marks ??
      transform.doc.resolve(a.from).marks();
    transform.replaceWith(
      a.from,
      a.to,
      evaluationSchema.text(f.replacement!, marks),
    );
    previousStart = a.start;
  }
  const document = transform.doc.toJSON() as Record<string, unknown>;
  if (buildTextMap(document).text.length > 4000)
    throw new Error("A revisão excede 4.000 caracteres.");
  return { ...revision, document, decisions, conflicts };
}
