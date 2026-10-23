import { z } from "zod";
import {
  evaluationBundleSchema,
  sourceSchema,
  criterionSchema,
} from "../evaluation/contracts";
const draftEvaluationSchema = evaluationBundleSchema.extend({
  sources: z
    .array(
      sourceSchema.extend({
        title: z.string().max(250),
        institution: z.string().max(150),
        version: z.string().max(80),
        url: z.string().max(1000),
        section: z.string().max(250),
        excerpt: z.string().max(2000),
      }),
    )
    .max(20),
  criteria: z
    .array(
      criterionSchema.extend({
        rationale: z.string().max(1500),
        sourceRefs: z.array(z.string().max(100)).max(10),
      }),
    )
    .max(20),
});
export const draftSchema = z.object({
  ciap: z.string().max(32),
  text: z.string().max(4000),
  document: z.record(z.string(), z.unknown()).nullable(),
  procedures: z.array(z.string().max(40)).max(100),
  risk: z.enum(["", "NON_ACUTE", "LOW", "MEDIUM", "HIGH"]),
  outcome: z.enum(["", "RELEASE", "REFER"]),
  professional: z.string().max(200),
  team: z.string().max(200),
  services: z.array(z.string().max(100)).max(30),
});
const patientSchema = z.object({
  name: z.string().min(1).max(200),
  age: z.string().max(30),
  sex: z.string().max(60),
  birthDate: z.string().max(40),
  mother: z.string().max(200),
  chiefComplaint: z.string().min(1).max(3000),
  history: z.string().max(10000),
  allergies: z.string().max(3000),
  medications: z.string().max(3000),
  vitals: z
    .array(z.object({ label: z.string().max(100), value: z.string().max(100) }))
    .max(30),
  facts: z
    .array(
      z.object({
        keywords: z.array(z.string().max(100)).max(30),
        answer: z.string().max(3000),
      }),
    )
    .max(100),
  performedProcedures: z.array(z.string().max(40)).max(100),
});
const rubricSchema = z.object({
  evaluation: draftEvaluationSchema.optional(),
  requiredTopics: z
    .array(
      z.object({
        label: z.string().max(300),
        keywords: z.array(z.string().max(100)).max(30),
      }),
    )
    .max(100),
  acceptedCiap: z.array(z.string().max(30)).max(100),
  expectedProcedures: z.array(z.string().max(40)).max(100),
  acceptedRisks: z.array(z.enum(["NON_ACUTE", "LOW", "MEDIUM", "HIGH"])).max(4),
  acceptedOutcomes: z.array(z.enum(["RELEASE", "REFER"])).max(2),
  rationale: z.string().max(20000),
  references: z.array(z.string().max(1000)).max(50),
});
export const caseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(3000),
  patient: patientSchema,
  rubric: rubricSchema,
});
export const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
export const studentSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(150),
  password: z.string().min(12).max(200),
  classId: z.string().min(1),
});
