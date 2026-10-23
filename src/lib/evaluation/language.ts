import type { FindingV2 } from "./contracts";
const pairs: [RegExp, string][] = [
  [/\bcoc[oô] endurecido\b/giu, "fezes endurecidas"],
  [/\bcoc[oô] mole\b/giu, "fezes amolecidas"],
  [/(?<!\p{L})coc[oô](?!\p{L})/giu, "fezes"],
  [/\bxixi\b/giu, "urina"],
  [/\bdor de cabe[çc]a\b/giu, "cefaleia"],
  [/\bfalta de ar\b/giu, "dispneia"],
  [/\bdor na barriga\b/giu, "dor abdominal"],
  [/\bdor ao urinar\b/giu, "disúria"],
  [/\bcoceira\b/giu, "prurido"],
];
function quotes(text: string) {
  const ranges: [number, number][] = [];
  let start = -1,
    close = "";
  for (let i = 0; i < text.length; i++) {
    if (
      text[i] === "'" &&
      /\p{L}/u.test(text[i - 1] ?? "") &&
      /\p{L}/u.test(text[i + 1] ?? "")
    )
      continue;
    if (start >= 0 && text[i] === close) {
      ranges.push([start, i + 1]);
      start = -1;
    } else if (start < 0 && ['"', "“", "‘", "'"].includes(text[i])) {
      start = i;
      close = text[i] === "“" ? "”" : text[i] === "‘" ? "’" : text[i];
    }
  }
  if (start >= 0) ranges.push([start, text.length]);
  return ranges;
}
export function reviewDemoLanguage(text: string): FindingV2[] {
  const found: FindingV2[] = [];
  const quoted = quotes(text);
  for (const [regex, replacement] of pairs)
    for (const match of text.matchAll(regex)) {
      const start = match.index!,
        end = start + match[0].length;
      if (
        quoted.some(([a, b]) => start < b && end > a) ||
        found.some((f) => start < f.end! && end > f.start!)
      )
        continue;
      found.push({
        id: `language-${start}-${end}`,
        category: "TERMINOLOGY",
        field: "text",
        level: "REVIEW",
        kind: "IMPROVEMENT",
        original: match[0],
        start,
        end,
        replacement,
        suggestion: replacement,
        explanation:
          "Sugestão de redação profissional para o mesmo conteúdo. O termo simples também pode ser adequado; preserve falas literais do paciente.",
        criterion: "Rubrica pedagógica de linguagem",
        evidenceIds: [],
        sourceRefs: [],
        anchor: {
          start,
          end,
          exact: match[0],
          prefix: text.slice(Math.max(0, start - 24), start),
          suffix: text.slice(end, end + 24),
        },
      });
    }
  return found.sort((a, b) => a.start! - b.start!);
}
interface Proposal {
  original?: string;
  replacement?: string;
  suggestion?: string;
  category?: string;
  explanation?: string;
  start?: number;
  end?: number;
  evidenceIds?: string[];
}
export function validateLanguage(
  proposals: Proposal[],
  text: string,
): FindingV2[] {
  const safe = reviewDemoLanguage(text);
  const used = new Set<string>();
  const quoted = quotes(text);
  return proposals.flatMap((p, index) => {
    if (!p.original) return [];
    const occurrences = [
      ...text.matchAll(
        new RegExp(p.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      ),
    ].map((m) => m.index!);
    const start =
      Number.isInteger(p.start) && text.slice(p.start, p.end) === p.original
        ? p.start!
        : occurrences.length === 1
          ? occurrences[0]
          : -1;
    const end = start + p.original.length;
    if (
      start < 0 ||
      quoted.some(([a, b]) => start < b && end > a) ||
      used.has(`${start}:${end}`)
    )
      return [];
    const replacement = p.replacement ?? p.suggestion;
    if (!replacement) return [];
    const known = safe.find(
      (f) =>
        f.start === start && f.end === end && f.replacement === replacement,
    );
    // Preserve every clinical symbol, operator and numeric separator. Only spacing can vary.
    const spacing = (s: string) => s.replace(/\s+/gu, " ").trim();
    if (!known && spacing(p.original) !== spacing(replacement)) return [];
    used.add(`${start}:${end}`);
    return [
      {
        ...(known ?? {
          id: `language-${index}`,
          category: "CLARITY" as const,
          field: "text" as const,
          level: "REVIEW" as const,
          kind: "IMPROVEMENT" as const,
          criterion: "Rubrica pedagógica de linguagem",
          evidenceIds: [],
          sourceRefs: [],
        }),
        id: `language-${start}-${end}`,
        original: p.original,
        start,
        end,
        replacement,
        suggestion: replacement,
        explanation:
          p.explanation ||
          known?.explanation ||
          "Melhoria de legibilidade com conteúdo preservado.",
        anchor: {
          start,
          end,
          exact: p.original,
          prefix: text.slice(Math.max(0, start - 24), start),
          suffix: text.slice(end, end + 24),
        },
      },
    ];
  });
}
