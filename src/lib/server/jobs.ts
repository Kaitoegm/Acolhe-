import { randomUUID } from 'node:crypto';
import { db } from './db';
import { evaluateSubmission } from '../domain';
import type { Draft, MessageView, PatientFacts, Rubric } from '../contracts';
import { json } from './views';

const LEASE_MS=120_000;
const MAX_TRIES=3;
/** Database compare-and-swap: concurrent workers can never own the same lease. */
export async function runNextJob():Promise<boolean> {
  const now=new Date();
  const eligible={OR:[{state:'QUEUED',availableAt:{lte:now}},{state:'RUNNING',leaseUntil:{lt:now}}]};
  const job=await db.job.findFirst({where:eligible,orderBy:{availableAt:'asc'}});
  if(!job) return false;
  const token=randomUUID();
  const claim=await db.job.updateMany({where:{id:job.id,...eligible},data:{state:'RUNNING',leaseToken:token,leaseUntil:new Date(now.getTime()+LEASE_MS),tries:{increment:1}}});
  if(!claim.count) return true;
  const attempt=await db.attempt.findUniqueOrThrow({where:{id:job.attemptId}});
  await db.attempt.update({where:{id:attempt.id},data:{status:'RUNNING',error:null}});
  try {
    const snapshot=attempt.caseSnapshot as unknown as {patient:PatientFacts;rubric:Rubric;reviewed:boolean};
    const feedback=await evaluateSubmission({...snapshot,draft:attempt.snapshot as unknown as Draft,messages:attempt.conversation as unknown as MessageView[]});
    await db.$transaction(async tx=>{
      const held=await tx.job.updateMany({where:{id:job.id,leaseToken:token,state:'RUNNING'},data:{state:'COMPLETED',leaseToken:null,leaseUntil:null}});
      if(!held.count) return;
      await tx.attempt.update({where:{id:attempt.id},data:{status:'COMPLETED',feedback:json(feedback),error:null}});
      // An older worker must not replace a more recent simulation status.
      const latest=await tx.attempt.findFirst({where:{simulationId:attempt.simulationId},orderBy:{number:'desc'}});
      if(latest?.id===attempt.id) await tx.simulation.updateMany({where:{id:attempt.simulationId,revision:attempt.revision},data:{status:'COMPLETED'}});
    });
  } catch(error) {
    const failed=job.tries+1>=MAX_TRIES;
    console.error('Evaluation job failed',job.id,error instanceof Error?error.message:'unknown error');
    await db.$transaction(async tx=>{
      const held=await tx.job.updateMany({where:{id:job.id,leaseToken:token,state:'RUNNING'},data:{state:failed?'FAILED':'QUEUED',leaseToken:null,leaseUntil:null,availableAt:new Date(Date.now()+5000*(job.tries+1))}});
      if(!held.count) return;
      await tx.attempt.update({where:{id:attempt.id},data:{status:failed?'FAILED':'QUEUED',error:failed?'Não foi possível gerar a devolutiva. Tente novamente.':null}});
      const latest=await tx.attempt.findFirst({where:{simulationId:attempt.simulationId},orderBy:{number:'desc'}});
      if(latest?.id===attempt.id) await tx.simulation.updateMany({where:{id:attempt.simulationId,revision:attempt.revision},data:{status:failed?'FAILED':'QUEUED'}});
    });
  }
  return true;
}
export async function drainJobs(max=10) { for(let i=0;i<max;i++) if(!await runNextJob()) break; }
