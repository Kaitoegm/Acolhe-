import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { db } from "../src/lib/server/db";
import { json } from "../src/lib/server/views";
import { caseSchema } from "../src/lib/server/validation";
import { validationCases } from "../src/lib/domain/validation-cases";
import {
  validatePublicationRubric,
  ciapCatalog,
  sigtapCatalog,
} from "../src/lib/domain";
import type { Rubric } from "../src/lib/contracts";
import type { EvaluationBundle } from "../src/lib/evaluation/contracts";
const genericReference =
  "https://bvsms.saude.gov.br/bvs/publicacoes/acolhimento_demanda_espontanea_queixas_comuns_cab28v2.pdf";
const riskNames: Record<string, string> = {
  NON_ACUTE: "Não aguda",
  LOW: "Baixa",
  MEDIUM: "Intermediária",
  HIGH: "Alta",
};
const outcomeNames: Record<string, string> = {
  RELEASE: "Liberar cidadão",
  REFER: "Adicionar à lista para avaliação da equipe",
};
const riskText = (values: string[]) =>
  values.map((v) => riskNames[v] ?? v).join(" / ");
const codeText = (values: string[], catalog: typeof ciapCatalog) =>
  values
    .map(
      (code) =>
        `${code} — ${catalog.find((c) => c.code === code)?.label ?? "conferir catálogo"}`,
    )
    .join("; ");
function draftBundle(rubric: Rubric): EvaluationBundle {
  const url =
    rubric.references.find((r) => r.startsWith("https://")) ?? genericReference;
  const source = {
    id: "referencia-base",
    title: "Referência candidata — conferir edição e trecho pertinente",
    institution: "Ministério da Saúde",
    version: "Edição a confirmar pelo responsável",
    url,
    section: "Localizar a seção aplicável ao cenário",
    excerpt:
      "Campo pendente: registrar o trecho verificado, sua seção e a aplicabilidade antes de aprovar este caso. Este texto é uma orientação de revisão, não uma citação do documento.",
    origin: "MS" as const,
    verified: false,
    hash: "",
  };
  const base = {
    version: 1,
    origin: "LOCAL" as const,
    severity: "REVIEW" as const,
    sourceRefs: [source.id],
    applicability: "UNKNOWN" as const,
  };
  return {
    sources: [source],
    criteria: [
      {
        ...base,
        id: "ciap-proposto",
        dimension: "CIAP",
        field: "ciap",
        operator: "ONE_OF",
        acceptedAnswers: rubric.acceptedCiap,
        rationale:
          "Alternativas propostas para o motivo de consulta. Validar códigos e equivalências sem converter sintomas em diagnóstico não estabelecido.",
      },
      {
        ...base,
        id: "procedimentos-realizados",
        dimension: "PROCEDURE",
        field: "procedures",
        operator: "PERFORMED_ONLY",
        acceptedAnswers: rubric.expectedProcedures,
        rationale:
          "Conferir os procedimentos explicitamente realizados, distinguindo indicação de execução e medidas atuais de informações históricas.",
      },
      {
        ...base,
        id: "alertas-direcionamento",
        dimension: "RISK",
        field: "risk",
        operator: "ONE_OF",
        acceptedAnswers: rubric.acceptedRisks,
        severity: rubric.acceptedRisks.includes("HIGH")
          ? "ATTENTION"
          : "REVIEW",
        rationale:
          "Proposta para raciocínio supervisionado. O técnico reconhece e comunica sinais; validar priorização com enfermeiro e protocolo local antes de publicar.",
      },
      {
        ...base,
        id: "desfecho-proposto",
        dimension: "OUTCOME",
        field: "outcome",
        operator: "ONE_OF",
        acceptedAnswers: rubric.acceptedOutcomes,
        rationale:
          "Conferir necessidade e momento de avaliação pela equipe, destino, continuidade e privacidade conforme os fatos do cenário.",
      },
      {
        ...base,
        id: "registro-e-entrevista",
        dimension: "OMISSION",
        field: "text",
        operator: "RECORD_EVIDENCE",
        acceptedAnswers: [],
        rationale: rubric.requiredTopics
          .map((t) => t.label)
          .join("; ")
          .slice(0, 1450),
      },
    ],
  };
}
async function main() {
  if (!process.env.DATABASE_URL?.startsWith("file:"))
    throw new Error("Importador de validação destinado ao banco SQLite local.");
  const index = process.argv.indexOf("--owner");
  const email = index >= 0 ? process.argv[index + 1] : "instrutor@acolhe.local";
  const owner = await db.user.findFirst({
    where: { email, role: "INSTRUCTOR", active: true },
    select: { id: true, email: true },
  });
  if (!owner)
    throw new Error("Instrutor ativo não encontrado. Informe --owner email.");
  if (validationCases.length !== 40)
    throw new Error("Banco de validação incompleto.");
  let created = 0,
    preserved = 0;
  const prepared = [...validationCases].reverse().map((c) => {
    const slug = "validation-v1-" + c.slug;
    const notes = [
      c.rubric.rationale,
      "\nProposta para validação; não representa protocolo municipal aprovado.",
      `Módulo: ${c.review.module}. Complexidade: ${c.review.difficulty}.`,
      "Competências: " + c.review.competencies.join("; "),
      "Alertas do cenário: " +
        (c.review.redFlags.join("; ") ||
          "Sem sinais de alarme descritos; confirmar investigação pertinente."),
      "Exemplo de registro baseado nos dados disponíveis:\n" +
        c.review.expectedRecord,
      "Erros a discutir: " + c.review.commonErrors.join("; "),
      "Validar: " + c.review.questionsForReviewer.join("; "),
    ].join("\n\n");
    const rubric = {
      ...c.rubric,
      rationale: notes,
      evaluation: draftBundle(c.rubric),
    };
    const checked = caseSchema.parse({
      title: c.title,
      description: c.description,
      patient: c.patient,
      rubric,
    });
    validatePublicationRubric(checked.rubric, checked.patient);
    return { slug, checked };
  });
  await db.$transaction(
    async (tx) => {
      for (const { slug, checked } of prepared) {
        const existing = await tx.clinicalCase.findUnique({
          where: { slug },
          select: { id: true, ownerId: true },
        });
        if (existing) {
          if (existing.ownerId !== owner.id)
            throw new Error(
              "Identificador de caso pertence a outro instrutor.",
            );
          preserved++;
          continue;
        }
        await tx.clinicalCase.create({
          data: {
            slug,
            ownerId: owner.id,
            demo: false,
            currentStatus: "PENDING_REVIEW",
            versions: {
              create: {
                version: 1,
                title: checked.title,
                description: checked.description,
                patient: json(checked.patient),
                rubric: json(checked.rubric),
                status: "PENDING_REVIEW",
              },
            },
          },
        });
        created++;
      }
    },
    { timeout: 30000 },
  );
  const intro =
    "# Banco de casos para validação — Acolhe+\n\n40 cenários originais e inteiramente fictícios para treinamento de acolhimento nas UBSs. **Todos pendentes de revisão clínica e pedagógica.** Risco, CIAP e desfecho são propostas de discussão. Sem publicação ou atribuição automática a alunos. A classificação formal de risco cabe ao enfermeiro.\n\nNo painel do instrutor, abra **Casos → Editar** para revisar ficha, tópicos, fundamentação e fontes. A publicação exige completar os trechos e conferir aplicabilidade. Nenhum documento foi marcado como aprovado automaticamente.\n\n## Matriz de cobertura\n\n| Caso | Módulo | Complexidade | Risco proposto |\n|---|---|---|---|\n";
  const rows = validationCases
    .map(
      (c) =>
        `| ${c.title} | ${c.review.module} | ${c.review.difficulty} | ${riskText(c.rubric.acceptedRisks)} |`,
    )
    .join("\n");
  const details = validationCases
    .map(
      (c) =>
        `## ${c.title}\n\n**Paciente:** ${c.patient.name}; ${c.patient.age}; ${c.patient.sex}; nascimento ${c.patient.birthDate}.\n\n**Queixa:** ${c.patient.chiefComplaint}\n\n**História:** ${c.patient.history}\n\n**Medicamentos:** ${c.patient.medications}\n\n**Alergias:** ${c.patient.allergies}\n\n**Dados atuais:** ${c.patient.vitals.map((v) => `${v.label}: ${v.value}`).join("; ") || "Não aferidos no cenário."}\n\n**Entrevista simulada:**\n\n${c.patient.facts.map((f) => "- " + f.answer).join("\n")}\n\n**Competências:** ${c.review.competencies.join("; ")}.\n\n**Sinais e pontos de atenção para revisão:** ${c.review.redFlags.join("; ") || "Nenhum explicitado; revisar investigação pertinente."}\n\n**Registro de referência proposto:**\n\n> ${c.review.expectedRecord}\n\n**Erros a discutir:**\n\n${c.review.commonErrors.map((e) => "- " + e).join("\n")}\n\n**Critérios propostos:** CIAP ${codeText(c.rubric.acceptedCiap, ciapCatalog)}; risco ${riskText(c.rubric.acceptedRisks)}; desfecho ${c.rubric.acceptedOutcomes.map((v) => outcomeNames[v] ?? v).join(" / ")}; procedimentos já realizados ${codeText(c.patient.performedProcedures, sigtapCatalog) || "nenhum codificado no cenário"}.\n\n**Pontos para validar:**\n\n${c.review.questionsForReviewer.map((q) => "- " + q).join("\n")}\n\n**Referências candidatas:** ${c.rubric.references.map((url, i) => `[Referência ${i + 1}](${url})`).join(" · ")}\n`,
    )
    .join("\n");
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/casos-para-validacao.md",
    intro + rows + "\n\n" + details,
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        created,
        preserved,
        pending: await db.clinicalCase.count({
          where: {
            ownerId: owner.id,
            slug: { startsWith: "validation-v1-" },
            currentStatus: "PENDING_REVIEW",
          },
        }),
        assigned: await db.assignment.count({
          where: { case: { slug: { startsWith: "validation-v1-" } } },
        }),
        guide: "docs/casos-para-validacao.md",
      },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
