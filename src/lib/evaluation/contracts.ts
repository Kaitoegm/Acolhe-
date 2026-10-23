import { z } from "zod";
import type { Evaluation, FeedbackItem } from "../contracts";

export const sourceSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().min(3).max(250),
    institution: z.string().min(2).max(150),
    version: z.string().min(1).max(80),
    url: z.url().refine((v) => v.startsWith("https://"), "Use HTTPS"),
    section: z.string().min(1).max(250),
    printedPage: z.string().max(30).optional(),
    pdfPage: z.number().int().positive().optional(),
    excerpt: z.string().min(10).max(2000),
    origin: z.enum(["MS", "LOCAL", "PEDAGOGICAL"]),
    verified: z.boolean(),
    hash: z.string().max(128).default(""),
  })
  .strict();
export const criterionSchema = z
  .object({
    id: z.string().min(1).max(100),
    version: z.number().int().positive(),
    dimension: z.enum(["CIAP", "PROCEDURE", "RISK", "OUTCOME", "OMISSION"]),
    origin: z.enum(["MS", "LOCAL", "PEDAGOGICAL"]),
    field: z.enum(["ciap", "procedures", "risk", "outcome", "text"]),
    operator: z.enum(["ONE_OF", "PERFORMED_ONLY", "RECORD_EVIDENCE"]),
    acceptedAnswers: z.array(z.string().max(500)).max(30),
    severity: z.enum(["REVIEW", "ATTENTION"]),
    rationale: z.string().min(3).max(1500),
    sourceRefs: z.array(z.string().max(100)).min(1).max(10),
    applicability: z.enum(["APPLIES", "UNKNOWN", "NOT_APPLICABLE"]),
    approvedBy: z.string().optional(),
    approvedAt: z.string().datetime().optional(),
  })
  .strict();
export const evaluationBundleSchema = z
  .object({
    sources: z.array(sourceSchema).max(20),
    criteria: z.array(criterionSchema).max(20),
  })
  .strict();
export type ProtocolSource = z.infer<typeof sourceSchema>;
export type CriterionV2 = z.infer<typeof criterionSchema>;
export type EvaluationBundle = z.infer<typeof evaluationBundleSchema>;
export interface TextAnchor {
  start?: number;
  end?: number;
  exact: string;
  prefix?: string;
  suffix?: string;
  blockId?: string;
}
export interface FindingV2 extends FeedbackItem {
  kind: "ERROR" | "IMPROVEMENT" | "UNCERTAIN";
  replacement?: string;
  anchor?: TextAnchor;
  evidenceIds: string[];
  evidenceQuotes?: Array<{ id: string; text: string }>;
  sourceRefs: string[];
  applicabilityStatus?: string;
}
export interface EvaluationV2 extends Evaluation {
  schemaVersion: 2;
  items: FindingV2[];
  sources: ProtocolSource[];
  criterionVersion: string;
  promptVersion: string;
  model: string;
  snapshotHash: string;
  coverage: "COMPLETE" | "PARTIAL";
}
export type EvaluationStage =
  "QUEUED" | "CRITERIA" | "LANGUAGE" | "VALIDATING" | "COMPLETED" | "FAILED";
export function isEvaluationV2(
  value: Evaluation | null | undefined,
): value is EvaluationV2 {
  return !!value && "schemaVersion" in value && value.schemaVersion === 2;
}
export function parseEvaluation(value: unknown): Evaluation | EvaluationV2 {
  const legacy = z
    .object({
      summary: z.string(),
      items: z.array(
        z
          .object({
            id: z.string(),
            category: z.string(),
            field: z.string(),
            level: z.enum(["ADEQUATE", "REVIEW", "ATTENTION"]),
            suggestion: z.string(),
            explanation: z.string(),
            criterion: z.string(),
          })
          .passthrough(),
      ),
      clinicalPending: z.boolean(),
      mode: z.enum(["demo", "live"]),
    })
    .passthrough();
  const parsed = legacy.parse(value);
  if ("schemaVersion" in parsed && parsed.schemaVersion !== 2)
    throw new Error("Versão de avaliação não suportada");
  if (parsed.schemaVersion === 2) {
    const finding = legacy.shape.items.element
      .extend({
        kind: z.enum(["ERROR", "IMPROVEMENT", "UNCERTAIN"]),
        replacement: z.string().optional(),
        original: z.string().optional(),
        start: z.number().int().optional(),
        end: z.number().int().optional(),
        anchor: z
          .object({
            start: z.number().int().optional(),
            end: z.number().int().optional(),
            exact: z.string(),
            prefix: z.string().optional(),
            suffix: z.string().optional(),
            blockId: z.string().optional(),
          })
          .strict()
          .optional(),
        evidenceIds: z.array(z.string()),
        evidenceQuotes: z
          .array(z.object({ id: z.string(), text: z.string() }).strict())
          .optional(),
        sourceRefs: z.array(z.string()),
        applicabilityStatus: z.string().optional(),
      })
      .strict();
    return legacy
      .extend({
        schemaVersion: z.literal(2),
        items: z
          .array(finding)
          .max(30)
          .refine(
            (items) => new Set(items.map((i) => i.id)).size === items.length,
            "Identificadores de sugestão duplicados.",
          ),
        sources: z.array(sourceSchema),
        criterionVersion: z.string(),
        promptVersion: z.string(),
        model: z.string(),
        snapshotHash: z.string().length(64),
        coverage: z.enum(["COMPLETE", "PARTIAL"]),
      })
      .strict()
      .parse(value) as unknown as EvaluationV2;
  }
  return parsed as unknown as Evaluation | EvaluationV2;
}
