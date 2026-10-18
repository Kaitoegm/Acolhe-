import type { Prisma } from '@prisma/client';
import type { AttemptView, CasePrivate, CasePublic, Draft, Evaluation, PatientFacts, Rubric, SimulationView, QueueItem } from '../contracts';

export const simulationInclude={caseVersion:true,messages:{orderBy:[{createdAt:'asc' as const},{id:'asc' as const}]},attempts:{orderBy:{number:'desc' as const},include:{reviews:{include:{author:{select:{name:true}}},orderBy:{createdAt:'asc' as const}}}}} satisfies Prisma.SimulationInclude;
type FullSimulation=Prisma.SimulationGetPayload<{include:typeof simulationInclude}>;
export type FullAttempt=FullSimulation['attempts'][number];
type Version=FullSimulation['caseVersion'];
export function casePublic(v:Version):CasePublic {
  return {id:v.caseId,title:v.title,description:v.description,version:v.version,status:v.status,patient:v.patient as unknown as PatientFacts};
}
export function casePrivate(v:Version):CasePrivate {
  return {...casePublic(v),rubric:v.rubric as unknown as Rubric,reviewedAt:v.reviewedAt?.toISOString()??null,reviewedBy:v.reviewedBy};
}
export function attemptView(a:FullAttempt):AttemptView {
  return {id:a.id,number:a.number,snapshot:a.snapshot as unknown as Draft,status:a.status as AttemptView['status'],feedback:a.feedback as unknown as Evaluation|null,error:a.error,createdAt:a.createdAt.toISOString(),reviews:a.reviews.map(r=>({id:r.id,comment:r.comment,author:r.author.name,createdAt:r.createdAt.toISOString()}))};
}
export function simulationView(s:FullSimulation):SimulationView {
  return {id:s.id,case:casePublic(s.caseVersion),draft:s.draft as unknown as Draft,revision:s.revision,status:s.status,createdAt:s.createdAt.toISOString(),updatedAt:s.updatedAt.toISOString(),messages:s.messages.map(m=>({id:m.id,role:m.role as 'user'|'assistant',content:m.content,createdAt:m.createdAt.toISOString()})),attempts:s.attempts.map(attemptView)};
}
export function queueView(s:FullSimulation):QueueItem {
  const p=s.caseVersion.patient as unknown as PatientFacts;
  return {id:s.id,caseId:s.caseId,name:p.name,age:p.age,status:s.status,risk:(s.draft as unknown as Draft).risk,createdAt:s.createdAt.toISOString(),updatedAt:s.updatedAt.toISOString(),attempts:s.attempts.length};
}
export function json(value:unknown):Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
