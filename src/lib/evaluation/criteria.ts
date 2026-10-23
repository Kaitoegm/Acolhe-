import type { Draft } from "../contracts";
import {
  evaluationBundleSchema,
  type EvaluationBundle,
  type FindingV2,
} from "./contracts";
import { ciapCatalog, sigtapCatalog } from "../domain/catalogs";
export function validatePublishableCriteria(
  value: unknown,
  performed?: string[],
): EvaluationBundle {
  const bundle = evaluationBundleSchema.parse(value);
  if (!bundle.criteria.length)
    throw new Error("Cadastre ao menos um critério fundamentado.");
  const ids = new Set(bundle.sources.map((s) => s.id));
  for (const c of bundle.criteria) {
    if (
      c.operator === "PERFORMED_ONLY" &&
      c.applicability === "APPLIES" &&
      c.acceptedAnswers.some((code) => !performed?.includes(code))
    )
      throw new Error(
        "O critério exige procedimentos que não constam como realizados no caso.",
      );
    const fields = {
      CIAP: "ciap",
      PROCEDURE: "procedures",
      RISK: "risk",
      OUTCOME: "outcome",
      OMISSION: "text",
    };
    if (fields[c.dimension] !== c.field)
      throw new Error("Dimensão e campo do critério incompatíveis.");
    const allowed =
      c.field === "ciap"
        ? ciapCatalog.map((v) => v.code)
        : c.field === "procedures"
          ? sigtapCatalog.map((v) => v.code)
          : c.field === "risk"
            ? ["NON_ACUTE", "LOW", "MEDIUM", "HIGH"]
            : c.field === "outcome"
              ? ["RELEASE", "REFER"]
              : null;
    if (allowed && c.acceptedAnswers.some((v) => !allowed.includes(v)))
      throw new Error(
        "Critério contém alternativa fora do catálogo permitido.",
      );
    if (
      c.origin === "MS" &&
      c.sourceRefs.some(
        (id) => bundle.sources.find((s) => s.id === id)?.origin !== "MS",
      )
    )
      throw new Error("Critério ministerial exige fonte ministerial.");
  }
  if (
    ids.size !== bundle.sources.length ||
    new Set(bundle.criteria.map((c) => c.id)).size !== bundle.criteria.length
  )
    throw new Error("Identificadores repetidos.");
  for (const c of bundle.criteria) {
    if (c.applicability === "UNKNOWN")
      throw new Error("Resolva a aplicabilidade antes de publicar.");
    if (c.sourceRefs.some((id) => !ids.has(id)))
      throw new Error("Critério sem referência válida.");
    for (const id of c.sourceRefs) {
      const s = bundle.sources.find((s) => s.id === id)!;
      if (!s.verified || s.excerpt.trim().length < 10 || !s.section.trim())
        throw new Error(
          "Confira o trecho e a seção da fonte antes de publicar.",
        );
      if (
        s.origin === "MS" &&
        !new URL(s.url).hostname.endsWith(".saude.gov.br") &&
        new URL(s.url).hostname !== "gov.br" &&
        new URL(s.url).hostname !== "www.gov.br"
      )
        throw new Error("Use endereço oficial do Ministério da Saúde.");
    }
    if (
      c.operator === "ONE_OF" &&
      (!c.acceptedAnswers.length ||
        c.field === "text" ||
        c.field === "procedures")
    )
      throw new Error("Alternativas do critério incompatíveis.");
    if (c.operator === "PERFORMED_ONLY" && c.field !== "procedures")
      throw new Error("Critério de procedimento incompatível.");
    if (c.operator === "RECORD_EVIDENCE" && c.field !== "text")
      throw new Error("Critério de registro incompatível.");
  }
  return bundle;
}
export function evaluateCriteria(
  draft: Draft,
  bundle: EvaluationBundle,
  reviewed: boolean,
  performed: string[] = [],
): FindingV2[] {
  if (!reviewed) return [];
  return bundle.criteria
    .filter((c) => c.applicability !== "NOT_APPLICABLE")
    .map((c) => {
      const uncertain =
        c.applicability === "UNKNOWN" ||
        c.operator === "RECORD_EVIDENCE" ||
        (c.operator === "PERFORMED_ONLY" &&
          c.acceptedAnswers.some((code) => !performed.includes(code)));
      const value = draft[c.field];
      const valid =
        !uncertain &&
        (c.operator === "ONE_OF"
          ? c.acceptedAnswers.includes(String(value))
          : draft.procedures.every((code) => performed.includes(code)) &&
            c.acceptedAnswers.every((code) => draft.procedures.includes(code)));
      return {
        id: `criterion-${c.id}`,
        category: c.dimension,
        field: c.field,
        kind: uncertain ? "UNCERTAIN" : valid ? "IMPROVEMENT" : "ERROR",
        level: uncertain ? "REVIEW" : valid ? "ADEQUATE" : c.severity,
        suggestion: uncertain
          ? "Confira o registro com o instrutor."
          : valid
            ? "Registro compatível com o critério revisado."
            : "Revise sua resposta à luz do fundamento deste caso.",
        explanation: c.rationale,
        criterion: c.id,
        evidenceIds: [],
        sourceRefs: c.sourceRefs,
        applicabilityStatus: c.applicability,
      };
    });
}
