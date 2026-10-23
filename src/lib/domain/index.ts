import { z } from "zod";
import { getSchema, getText, getTextSerializersFromSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  SERVICES,
  type Draft,
  type Evaluation,
  type FeedbackItem,
  type MessageView,
  type PatientFacts,
  type Rubric,
} from "../contracts";
import { ciapCatalog, sigtapCatalog } from "./catalogs";
export { ciapCatalog, sigtapCatalog, catalogMetadata } from "./catalogs";
export { demoCases } from "./cases";

const draftSchema = z
  .object({
    ciap: z.string().max(12),
    text: z
      .string()
      .max(4000, "O registro deve ter no máximo 4000 caracteres."),
    document: z.record(z.string(), z.unknown()).nullable(),
    procedures: z.array(z.string()).max(30),
    risk: z.enum(["", "NON_ACUTE", "LOW", "MEDIUM", "HIGH"]),
    outcome: z.enum(["", "RELEASE", "REFER"]),
    professional: z.string().max(150),
    team: z.string().max(150),
    services: z.array(z.string().max(80)).max(20),
  })
  .strict();

export function validateDraft(
  input: unknown,
  options: { requireReferral?: boolean } = {},
): Draft {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Ficha inválida: confira ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}. O registro aceita no máximo 4000 caracteres.`,
    );
  const draft = parsed.data;
  if (draft.ciap && !ciapCatalog.some((i) => i.code === draft.ciap))
    throw new Error("Código CIAP fora do catálogo demonstrativo.");
  if (
    draft.procedures.some((code) => !sigtapCatalog.some((i) => i.code === code))
  )
    throw new Error("Código de procedimento fora do catálogo demonstrativo.");
  if (draft.services.some((service) => !SERVICES.includes(service)))
    throw new Error("Serviço inválido.");
  if (
    options.requireReferral !== false &&
    draft.outcome === "REFER" &&
    (!draft.professional.trim() || !draft.team.trim() || !draft.services.length)
  )
    throw new Error(
      "Para encaminhar, informe profissional, equipe e pelo menos um serviço.",
    );
  if (
    new Set(draft.procedures).size !== draft.procedures.length ||
    new Set(draft.services).size !== draft.services.length
  )
    throw new Error("Remova procedimentos ou serviços duplicados.");
  if (draft.document && JSON.stringify(draft.document).length > 100_000)
    throw new Error("Documento excede o limite permitido.");
  if (draft.document) validateDocument(draft.document, draft.text);
  return draft;
}

export function validateDraftStorage(input: unknown): Draft {
  return validateDraft(input, { requireReferral: false });
}

export function validateSubmissionDraft(input: unknown): Draft {
  const draft = validateDraft(input);
  if (!draft.ciap || !draft.text.trim() || !draft.risk || !draft.outcome)
    throw new Error(
      "Preencha os campos obrigatórios: CIAP-2, descrição, classificação e desfecho.",
    );
  return draft;
}

/** Completeness and consistency checks, not a substitute for clinical review. */
export function validatePublicationRubric(
  rubric: Rubric,
  patient: PatientFacts,
): void {
  if (
    !rubric.rationale.trim() ||
    !rubric.references.length ||
    rubric.references.some((r) => !r.trim())
  )
    throw new Error("Informe fundamentação e referências antes de publicar.");
  if (
    !rubric.acceptedCiap.length ||
    !rubric.acceptedRisks.length ||
    !rubric.acceptedOutcomes.length
  )
    throw new Error(
      "Defina os critérios de CIAP-2, classificação e desfecho antes de publicar.",
    );
  if (
    rubric.acceptedCiap.some(
      (code) => !ciapCatalog.some((c) => c.code === code),
    ) ||
    [...rubric.expectedProcedures, ...patient.performedProcedures].some(
      (code) => !sigtapCatalog.some((c) => c.code === code),
    )
  )
    throw new Error(
      "Os códigos do caso devem pertencer ao catálogo disponível.",
    );
  if (
    rubric.expectedProcedures.some(
      (code) => !patient.performedProcedures.includes(code),
    )
  )
    throw new Error(
      "Um procedimento esperado não consta como realizado no caso.",
    );
  if (
    rubric.requiredTopics.some(
      (t) =>
        !t.label.trim() ||
        !t.keywords.length ||
        t.keywords.some((k) => !k.trim()),
    )
  )
    throw new Error(
      "Cada tópico obrigatório precisa de descrição e palavras-chave válidas.",
    );
}

function validateDocument(
  document: Record<string, unknown>,
  text: string,
): void {
  const allowed = new Set([
    "doc",
    "paragraph",
    "text",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "codeBlock",
    "hardBreak",
    "horizontalRule",
  ]);
  function inspect(value: unknown, depth: number): void {
    if (
      depth > 20 ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      throw new Error("Documento formatado inválido.");
    const node = value as Record<string, unknown>;
    if (
      typeof node.type !== "string" ||
      !allowed.has(node.type) ||
      Object.keys(node).some(
        (k) => !["type", "content", "marks", "attrs", "text"].includes(k),
      )
    )
      throw new Error("Documento contém estrutura não permitida.");
    if (
      node.text !== undefined &&
      (node.type !== "text" || typeof node.text !== "string")
    )
      throw new Error("Texto do documento inválido.");
    if (node.attrs !== undefined) {
      if (
        !node.attrs ||
        typeof node.attrs !== "object" ||
        Array.isArray(node.attrs)
      )
        throw new Error("Atributos do documento inválidos.");
      const attrs = node.attrs as Record<string, unknown>;
      const keys =
        node.type === "heading"
          ? ["level"]
          : node.type === "orderedList"
            ? ["start", "type"]
            : node.type === "codeBlock"
              ? ["language"]
              : [];
      if (
        Object.keys(attrs).some((k) => !keys.includes(k)) ||
        Object.values(attrs).some(
          (v) => v !== null && typeof v !== "string" && typeof v !== "number",
        )
      )
        throw new Error("Atributos do documento não permitidos.");
    }
    if (
      node.marks !== undefined &&
      (!Array.isArray(node.marks) ||
        node.marks.some(
          (m) =>
            !m ||
            typeof m !== "object" ||
            !["bold", "italic", "strike", "code", "underline"].includes(
              m.type,
            ) ||
            Object.keys(m).some((k) => k !== "type"),
        ))
    )
      throw new Error("Formatação do documento não permitida.");
    if (node.content !== undefined) {
      if (!Array.isArray(node.content))
        throw new Error("Conteúdo do documento inválido.");
      for (const child of node.content) inspect(child, depth + 1);
    }
  }
  inspect(document, 0);
  try {
    if (document.type !== "doc") throw new Error();
    const schema = getSchema([StarterKit]);
    const node = schema.nodeFromJSON(document);
    node.check();
    if (
      getText(node, {
        blockSeparator: "\n",
        textSerializers: getTextSerializersFromSchema(schema),
      }) !== text
    )
      throw new Error();
  } catch {
    throw new Error(
      "O documento formatado não corresponde ao texto do registro ou possui estrutura inválida.",
    );
  }
}
