export type Role = 'STUDENT' | 'INSTRUCTOR';
export type Risk = 'NON_ACUTE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type Outcome = 'RELEASE' | 'REFER';
export type Level = 'ADEQUATE' | 'REVIEW' | 'ATTENTION';
export interface UserView { id: string; name: string; email: string; role: Role }
export interface PatientFacts {
  name: string; age: string; sex: string; birthDate: string; mother: string;
  chiefComplaint: string; history: string; allergies: string; medications: string;
  vitals: { label: string; value: string }[]; facts: { keywords: string[]; answer: string }[];
  performedProcedures: string[];
}
export interface Rubric {
  requiredTopics: { label: string; keywords: string[] }[];
  acceptedCiap: string[]; expectedProcedures: string[]; acceptedRisks: Risk[]; acceptedOutcomes: Outcome[];
  rationale: string; references: string[];
}
export interface CasePublic { id: string; title: string; version: number; status: string; patient: PatientFacts; description: string }
export interface CasePrivate extends CasePublic { rubric: Rubric; reviewedAt: string | null; reviewedBy: string | null }
export interface Draft {
  ciap: string; text: string; document: Record<string, unknown> | null; procedures: string[];
  risk: Risk | ''; outcome: Outcome | ''; professional: string; team: string; services: string[];
}
export interface FeedbackItem {
  id: string; category: 'TERMINOLOGY' | 'CLARITY' | 'ORDER' | 'OMISSION' | 'CIAP' | 'PROCEDURE' | 'RISK' | 'OUTCOME';
  field: 'text' | 'ciap' | 'procedures' | 'risk' | 'outcome'; level: Level;
  original?: string; start?: number; end?: number; suggestion: string; explanation: string; criterion: string;
}
export interface Evaluation { summary: string; items: FeedbackItem[]; clinicalPending: boolean; mode: 'demo' | 'live' }
export interface MessageView { id: string; role: 'user' | 'assistant'; content: string; createdAt: string }
export interface AttemptView {
  id: string; number: number; snapshot: Draft; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  feedback: Evaluation | null; error: string | null; createdAt: string;
  reviews: { id: string; comment: string; author: string; createdAt: string }[];
}
export interface SimulationView {
  id: string; case: CasePublic; draft: Draft; revision: number; status: string; createdAt: string; updatedAt: string;
  messages: MessageView[]; attempts: AttemptView[];
}
export interface QueueItem { id: string; caseId: string; name: string; age: string; status: string; risk: string; createdAt: string; updatedAt: string; attempts: number }
export interface CatalogItem { code: string; label: string }
export const SERVICES = ['ADM. MEDICAMENTO', 'ARBOVIROSES', 'CURATIVO', 'DEMANDA ESPONTÂNEA', 'ESCUTA INICIAL', 'EXAMES', 'NEBULIZAÇÃO', 'ODONTOLOGIA', 'PROCEDIMENTOS', 'VACINA'];
export const EMPTY_DRAFT: Draft = { ciap: '', text: '', document: null, procedures: [], risk: '', outcome: '', professional: '', team: '', services: ['DEMANDA ESPONTÂNEA'] };
