export type Role = "STUDENT" | "INSTRUCTOR";
export type Risk = "NON_ACUTE" | "LOW" | "MEDIUM" | "HIGH";
export type Outcome = "RELEASE" | "REFER";
export type Level = "ADEQUATE" | "REVIEW" | "ATTENTION";
export interface UserView {
  id: string;
  name: string;
  email: string;
  role: Role;
}
export interface PatientFacts {
  name: string;
  age: string;
  sex: string;
  birthDate: string;
  mother: string;
  chiefComplaint: string;
  history: string;
  allergies: string;
  medications: string;
  vitals: { label: string; value: string }[];
  facts: { keywords: string[]; answer: string }[];
  performedProcedures: string[];
}
export interface Rubric {
  evaluation?: import("./evaluation/contracts").EvaluationBundle;
  requiredTopics: { label: string; keywords: string[] }[];
  acceptedCiap: string[];
  expectedProcedures: string[];
  acceptedRisks: Risk[];
  acceptedOutcomes: Outcome[];
  rationale: string;
  references: string[];
}
export interface CasePublic {
  id: string;
  title: string;
  version: number;
  status: string;
  patient: PatientFacts;
  description: string;
}
export interface CasePrivate extends CasePublic {
  classIds?: string[];
  classes?: { id: string; name: string }[];
  rubric: Rubric;
  reviewedAt: string | null;
  reviewedBy: string | null;
}
export interface Draft {
  ciap: string;
  text: string;
  document: Record<string, unknown> | null;
  procedures: string[];
  risk: Risk | "";
  outcome: Outcome | "";
  professional: string;
  team: string;
  services: string[];
}
export interface FeedbackItem {
  id: string;
  category:
    | "TERMINOLOGY"
    | "CLARITY"
    | "ORDER"
    | "OMISSION"
    | "CIAP"
    | "PROCEDURE"
    | "RISK"
    | "OUTCOME";
  field: "text" | "ciap" | "procedures" | "risk" | "outcome";
  level: Level;
  original?: string;
  start?: number;
  end?: number;
  suggestion: string;
  explanation: string;
  criterion: string;
}
export interface Evaluation {
  summary: string;
  items: FeedbackItem[];
  clinicalPending: boolean;
  mode: "demo" | "live";
}
export interface MessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
export interface AttemptView {
  progress?: { stage: string; version: number; generation: number };
  id: string;
  number: number;
  snapshot: Draft;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  feedback: Evaluation | null;
  error: string | null;
  createdAt: string;
  reviews: { id: string; comment: string; author: string; createdAt: string }[];
}
export interface SimulationView {
  id: string;
  case: CasePublic;
  draft: Draft;
  revision: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: MessageView[];
  attempts: AttemptView[];
  conversationRevision: number;
  latestAttempt: AttemptSummary | null;
}
export interface QueueItem {
  id: string;
  caseId: string;
  name: string;
  age: string;
  status: string;
  risk: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
}
export interface CatalogItem {
  code: string;
  label: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
export interface CaseSummary {
  classes?: { id: string; name: string }[];
  id: string;
  title: string;
  description: string;
  version: number;
  status: string;
  patientName: string;
  age: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}
export type AttemptSummary = Pick<
  AttemptView,
  "id" | "number" | "status" | "error" | "createdAt" | "progress"
>;
export type ReviewView = AttemptView["reviews"][number];
export interface WorkerHealth {
  healthy: boolean;
  lastSeen: string | null;
}
export interface TurnSummary {
  id: string;
  status: string;
  error: string | null;
}
export interface SimulationStatus {
  revision: number;
  conversationRevision: number;
  status: string;
  latestAttempt: AttemptSummary | null;
  pendingChat: TurnSummary | null;
  latestTurn: TurnSummary | null;
  worker: WorkerHealth;
}
export interface UsageCounter {
  used: number;
  reserved: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}
export interface UsageView {
  chat: UsageCounter;
  evaluation: UsageCounter;
  shared: { chat: boolean; evaluation: boolean };
  sharedAvailable: boolean;
  worker: WorkerHealth;
}
export interface EnqueuedWork {
  jobId: string;
  resourceId: string;
  status: string;
  conversationRevision?: number;
}
export const SERVICES = [
  "ADM. MEDICAMENTO",
  "ARBOVIROSES",
  "CURATIVO",
  "DEMANDA ESPONTÂNEA",
  "ESCUTA INICIAL",
  "EXAMES",
  "NEBULIZAÇÃO",
  "ODONTOLOGIA",
  "PROCEDIMENTOS",
  "VACINA",
];
export const EMPTY_DRAFT: Draft = {
  ciap: "",
  text: "",
  document: null,
  procedures: [],
  risk: "",
  outcome: "",
  professional: "",
  team: "",
  services: ["DEMANDA ESPONTÂNEA"],
};
