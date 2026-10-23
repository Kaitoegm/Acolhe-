import type { PatientFacts, Rubric } from "../contracts";
import { ciapCatalog, sigtapCatalog } from "../domain/catalogs";
import { evaluationBundleSchema, type EvaluationBundle } from "./contracts";

export interface PublicationIssue {
  code: string;
  target: string;
  message: string;
}
export const dimensionNames: Record<string, string> = {
  CIAP: "Motivo da consulta",
  PROCEDURE: "Procedimentos",
  RISK: "Prioridade",
  OUTCOME: "Encaminhamento",
  OMISSION: "Registro",
};
export function criteriaIssues(
  bundle: EvaluationBundle,
  performed: string[] = [],
): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  const add = (code: string, target: string, message: string) =>
    issues.push({ code, target, message });
  if (!bundle.criteria.length)
    add("CRITERIA", "criteria", "Adicione pelo menos um item para avaliar.");
  const sourceIds = new Set(bundle.sources.map((s) => s.id));
  if (
    sourceIds.size !== bundle.sources.length ||
    new Set(bundle.criteria.map((c) => c.id)).size !== bundle.criteria.length
  )
    add(
      "DUPLICATE",
      "criteria",
      "Existem identificadores repetidos. Confira as configurações avançadas.",
    );
  const used = new Set(bundle.criteria.flatMap((c) => c.sourceRefs));
  bundle.sources.forEach((s) => {
    if (!used.has(s.id)) return;
    if (!s.verified || s.excerpt.trim().length < 10 || !s.section.trim())
      add(
        "SOURCE_REVIEW",
        "source-" + s.id,
        `Confira o trecho, a localização e a confirmação da referência “${s.title || s.id}”.`,
      );
    try {
      const host = new URL(s.url).hostname;
      if (
        s.origin === "MS" &&
        !host.endsWith(".saude.gov.br") &&
        !["gov.br", "www.gov.br"].includes(host)
      )
        add(
          "SOURCE_URL",
          "source-" + s.id,
          `Use o endereço oficial do Ministério da Saúde na referência “${s.title || s.id}”.`,
        );
    } catch {
      add(
        "SOURCE_URL",
        "source-" + s.id,
        "Informe um endereço válido para a referência.",
      );
    }
  });
  bundle.criteria.forEach((c, i) => {
    const target = "criterion-" + c.id,
      name = `${dimensionNames[c.dimension]} (item ${i + 1})`;
    if (c.applicability === "UNKNOWN")
      add(
        "APPLICABILITY",
        target,
        `Decida se ${name} deve ser avaliado neste caso.`,
      );
    if (c.sourceRefs.some((id) => !sourceIds.has(id)))
      add(
        "SOURCE_LINK",
        target,
        `Selecione uma referência válida para ${name}.`,
      );
    if (
      c.origin === "MS" &&
      c.sourceRefs.some(
        (id) => bundle.sources.find((s) => s.id === id)?.origin !== "MS",
      )
    )
      add(
        "SOURCE_ORIGIN",
        target,
        `${name} exige referência do Ministério da Saúde.`,
      );
    const fields = {
      CIAP: "ciap",
      PROCEDURE: "procedures",
      RISK: "risk",
      OUTCOME: "outcome",
      OMISSION: "text",
    };
    if (fields[c.dimension] !== c.field)
      add("FIELD", target, `Confira o tipo de avaliação de ${name}.`);
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
      add("CATALOG", target, `Selecione respostas válidas para ${name}.`);
    if (
      c.operator === "PERFORMED_ONLY" &&
      c.applicability === "APPLIES" &&
      c.acceptedAnswers.some((v) => !performed.includes(v))
    )
      add(
        "PERFORMED",
        target,
        `${name} exige procedimentos que não constam como realizados no caso.`,
      );
    if (
      (c.operator === "ONE_OF" &&
        (!c.acceptedAnswers.length ||
          ["text", "procedures"].includes(c.field))) ||
      (c.operator === "PERFORMED_ONLY" && c.field !== "procedures") ||
      (c.operator === "RECORD_EVIDENCE" && c.field !== "text")
    )
      add(
        "OPERATOR",
        target,
        `Confira as respostas e o tipo de avaliação de ${name}.`,
      );
  });
  return issues;
}
export function publicationIssues(
  patient: PatientFacts,
  rubric: Rubric,
): PublicationIssue[] {
  const issues: PublicationIssue[] = [];
  const add = (code: string, target: string, message: string) =>
    issues.push({ code, target, message });
  if (!patient.name.trim() || !patient.chiefComplaint.trim())
    add(
      "PATIENT",
      "patient",
      "Preencha o nome fictício e a queixa do paciente.",
    );
  if (!rubric.rationale.trim())
    add("RATIONALE", "rationale", "Explique a fundamentação do caso.");
  if (!rubric.references.length || rubric.references.some((v) => !v.trim()))
    add("REFERENCES", "references", "Informe as referências utilizadas.");
  if (
    !rubric.acceptedCiap.length ||
    !rubric.acceptedRisks.length ||
    !rubric.acceptedOutcomes.length
  )
    add(
      "ANSWERS",
      "criteria",
      "Defina as respostas esperadas para motivo da consulta, prioridade e encaminhamento.",
    );
  if (
    rubric.acceptedCiap.some((v) => !ciapCatalog.some((c) => c.code === v)) ||
    [...rubric.expectedProcedures, ...patient.performedProcedures].some(
      (v) => !sigtapCatalog.some((c) => c.code === v),
    )
  )
    add("CATALOG", "criteria", "Escolha códigos disponíveis no catálogo.");
  if (
    rubric.expectedProcedures.some(
      (v) => !patient.performedProcedures.includes(v),
    )
  )
    add(
      "PERFORMED",
      "patient",
      "Um procedimento esperado ainda não consta como realizado na ficha.",
    );
  if (
    rubric.requiredTopics.some(
      (t) =>
        !t.label.trim() ||
        !t.keywords.length ||
        t.keywords.some((v) => !v.trim()),
    )
  )
    add(
      "TOPICS",
      "topics",
      "Preencha o assunto e as palavras de cada tópico do registro.",
    );
  if (rubric.evaluation) {
    const bundle = rubric.evaluation,
      parsed = evaluationBundleSchema.safeParse(bundle);
    if (!parsed.success)
      for (const error of parsed.error.issues) {
        const [group, index] = error.path;
        const target =
          group === "sources" && typeof index === "number"
            ? "source-" + bundle.sources?.[index]?.id
            : group === "criteria" && typeof index === "number"
              ? "criterion-" + bundle.criteria?.[index]?.id
              : "criteria";
        if (!issues.some((i) => i.code === "FORMAT" && i.target === target))
          add(
            "FORMAT",
            target,
            "Complete os campos obrigatórios deste item antes de publicar.",
          );
      }
    const shape =
      Array.isArray(bundle.sources) &&
      Array.isArray(bundle.criteria) &&
      bundle.sources.every(
        (s) =>
          s &&
          ["id", "title", "url", "section", "excerpt"].every(
            (k) => typeof s[k as keyof typeof s] === "string",
          ),
      ) &&
      bundle.criteria.every(
        (c) =>
          c &&
          typeof c.id === "string" &&
          c.dimension in dimensionNames &&
          Array.isArray(c.sourceRefs) &&
          Array.isArray(c.acceptedAnswers),
      );
    if (shape)
      issues.push(...criteriaIssues(bundle, patient.performedProcedures));
  }
  return issues;
}
