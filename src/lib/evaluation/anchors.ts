import { getSchema, getText, getTextSerializersFromSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { TextAnchor } from "./contracts";
export const evaluationSchema = getSchema([StarterKit]);
export const plainDocument = (text: string): Record<string, unknown> => ({
  type: "doc",
  content: text.split("\n").map((t) => ({
    type: "paragraph",
    content: t ? [{ type: "text", text: t }] : [],
  })),
});
export interface TextMap {
  text: string;
  positions: Array<number | undefined>;
  blocks: string[];
  document: Record<string, unknown>;
}
export function buildTextMap(document: Record<string, unknown>): TextMap {
  const node = evaluationSchema.nodeFromJSON(document);
  const text = getText(node, {
    blockSeparator: "\n",
    textSerializers: getTextSerializersFromSchema(evaluationSchema),
  });
  const positions: Array<number | undefined> = [];
  const blocks: string[] = [];
  // Match each textblock to the canonical Tiptap serialization, retaining structural separators.
  let cursor = 0;
  node.descendants((block, pos) => {
    if (!block.isTextblock) return;
    const value = block.textBetween(0, block.content.size, "", "\n");
    const start = text.indexOf(value, cursor);
    if (start < 0) return false;
    let offset = start;
    block.descendants((child, childPos) => {
      if (child.isText) {
        for (let i = 0; i < (child.text?.length ?? 0); i++) {
          positions[offset] = pos + 1 + childPos + i;
          blocks[offset++] = String(pos);
        }
      } else if (child.type.name === "hardBreak") {
        positions[offset] = pos + 1 + childPos;
        blocks[offset++] = String(pos);
      }
    });
    cursor = start + value.length;
    return false;
  });
  return { text, positions, blocks, document };
}
export function resolveAnchor(
  map: TextMap,
  anchor: TextAnchor,
):
  | (TextAnchor & { start: number; end: number; from: number; to: number })
  | null {
  const candidates: number[] = [];
  let i = map.text.indexOf(anchor.exact);
  while (i >= 0) {
    const end = i + anchor.exact.length;
    if (
      (anchor.prefix === undefined ||
        map.text.slice(Math.max(0, i - anchor.prefix.length), i) ===
          anchor.prefix) &&
      (anchor.suffix === undefined ||
        map.text.slice(end, end + anchor.suffix.length) === anchor.suffix)
    )
      candidates.push(i);
    i = map.text.indexOf(anchor.exact, i + 1);
  }
  let start = anchor.start;
  if (
    start === undefined ||
    anchor.end !== start + anchor.exact.length ||
    !candidates.includes(start)
  ) {
    if (candidates.length !== 1) return null;
    start = candidates[0];
  }
  const end = start + anchor.exact.length;
  const from = map.positions[start],
    last = map.positions[end - 1];
  if (
    from === undefined ||
    last === undefined ||
    map.blocks[start] !== map.blocks[end - 1] ||
    anchor.exact.length === 0
  )
    return null;
  return {
    ...anchor,
    start,
    end,
    from,
    to: last + 1,
    blockId: map.blocks[start],
  };
}
