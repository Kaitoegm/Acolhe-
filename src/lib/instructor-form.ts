import type { Rubric, Risk, Outcome } from "./contracts";
import type { EvaluationBundle } from "./evaluation/contracts";
export function isCaseFormShape(patient: unknown, rubric: unknown): boolean {
  if (
    !patient ||
    !rubric ||
    typeof patient !== "object" ||
    typeof rubric !== "object"
  )
    return false;
  const p = patient as Record<string, unknown>,
    r = rubric as Record<string, unknown>;
  if (
    ![
      "name",
      "age",
      "sex",
      "birthDate",
      "mother",
      "chiefComplaint",
      "history",
      "allergies",
      "medications",
    ].every((k) => typeof p[k] === "string") ||
    typeof r.rationale !== "string"
  )
    return false;
  const strings = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  if (
    !strings(p.performedProcedures) ||
    ![
      "acceptedCiap",
      "expectedProcedures",
      "acceptedRisks",
      "acceptedOutcomes",
      "references",
    ].every((k) => strings(r[k]))
  )
    return false;
  if (
    !Array.isArray(p.vitals) ||
    !p.vitals.every(
      (v) => v && typeof v.label === "string" && typeof v.value === "string",
    ) ||
    !Array.isArray(p.facts) ||
    !p.facts.every(
      (f) => f && strings(f.keywords) && typeof f.answer === "string",
    ) ||
    !Array.isArray(r.requiredTopics) ||
    !r.requiredTopics.every(
      (t) => t && typeof t.label === "string" && strings(t.keywords),
    )
  )
    return false;
  const e = r.evaluation as EvaluationBundle | undefined;
  return (
    !e ||
    (Array.isArray(e.sources) &&
      e.sources.every(
        (s) =>
          s &&
          [
            "id",
            "title",
            "institution",
            "version",
            "url",
            "section",
            "excerpt",
            "origin",
          ].every((k) => typeof s[k as keyof typeof s] === "string"),
      ) &&
      Array.isArray(e.criteria) &&
      e.criteria.every(
        (c) =>
          c &&
          [
            "id",
            "dimension",
            "field",
            "operator",
            "origin",
            "rationale",
            "applicability",
          ].every((k) => typeof c[k as keyof typeof c] === "string") &&
          strings(c.sourceRefs) &&
          strings(c.acceptedAnswers),
      ))
  );
}
// Keep every criterion and its metadata; only derive compatibility fields used by legacy readers.
export function withEvaluation(
  rubric: Rubric,
  evaluation: EvaluationBundle | undefined,
  align = false,
): Rubric {
  if (!evaluation) return { ...rubric, evaluation };
  const answers = (dimension: string, fallback: string[]) => {
    const criteria = evaluation.criteria.filter(
      (c) => c.dimension === dimension,
    );
    const next = [...new Set(criteria.flatMap((c) => c.acceptedAnswers))];
    const previous = [
      ...new Set(
        (rubric.evaluation?.criteria || [])
          .filter((c) => c.dimension === dimension)
          .flatMap((c) => c.acceptedAnswers),
      ),
    ];
    const changed =
      JSON.stringify([...previous].sort()) !== JSON.stringify([...next].sort());
    return criteria.length && (align || changed) ? next : fallback;
  };
  return {
    ...rubric,
    evaluation,
    acceptedCiap: answers("CIAP", rubric.acceptedCiap),
    expectedProcedures: answers("PROCEDURE", rubric.expectedProcedures),
    acceptedRisks: answers("RISK", rubric.acceptedRisks) as Risk[],
    acceptedOutcomes: answers("OUTCOME", rubric.acceptedOutcomes) as Outcome[],
    references: [
      ...new Set([
        ...rubric.references,
        ...evaluation.sources.map((s) => s.url).filter(Boolean),
      ]),
    ],
  };
}
export function evaluationConflicts(rubric: Rubric): string[] {
  if (!rubric.evaluation) return [];
  const pairs = [
    ["CIAP", rubric.acceptedCiap],
    ["PROCEDURE", rubric.expectedProcedures],
    ["RISK", rubric.acceptedRisks],
    ["OUTCOME", rubric.acceptedOutcomes],
  ] as const;
  return pairs
    .filter(([dimension, values]) => {
      const criteria = rubric.evaluation!.criteria.filter(
        (c) => c.dimension === dimension,
      );
      return (
        criteria.length &&
        JSON.stringify(
          [...new Set(criteria.flatMap((c) => c.acceptedAnswers))].sort(),
        ) !== JSON.stringify([...values].sort())
      );
    })
    .map(([dimension]) => dimension);
}
