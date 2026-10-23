import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/server/db';
import { demoCases } from '../src/lib/domain';
import { EMPTY_DRAFT } from '../src/lib/contracts';
import { json } from '../src/lib/server/views';
import { runNextJob } from '../src/lib/server/jobs';

const auth=vi.hoisted(()=>({user:{id:'',name:'Teste',email:'test@example.test',role:'STUDENT'}}));
vi.mock('../src/lib/server/auth',()=>({authenticated:async()=>auth.user,currentUser:async()=>auth.user,publicUser:(u:unknown)=>u}));
vi.mock('next/server',()=>({after:()=>{}}));
import { dispatch } from '../src/lib/server/api';

const prefix=`integration-${randomUUID()}`;
const studentId=`${prefix}-student`,otherId=`${prefix}-other`,instructorId=`${prefix}-teacher`,foreignId=`${prefix}-foreign`;
let classId='',caseId='',simulationId='',attemptId='';
function call(path:string,method='GET',data?:unknown){
  return dispatch(new Request(`http://localhost:3000/api/${path}`,{method,headers:{origin:process.env.APP_URL||'http://localhost:3000','content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),path.split('/')) as Promise<any>;
}
describe('server database integration',()=>{
  beforeAll(async()=>{
    process.env.AI_MODE='demo';process.env.ALLOW_DEMO_CASES='true';
    for(const [id,role] of [[studentId,'STUDENT'],[otherId,'STUDENT'],[instructorId,'INSTRUCTOR'],[foreignId,'INSTRUCTOR']])await db.user.create({data:{id,email:`${id}@example.test`,name:id,passwordHash:'unused',role}});
    const classroom=await db.class.create({data:{name:prefix,instructorId,memberships:{create:[{userId:studentId},{userId:otherId}]}}});classId=classroom.id;
    const c=demoCases[0];
    const record=await db.clinicalCase.create({data:{ownerId:instructorId,demo:true,versions:{create:{version:1,title:c.title,description:c.description,patient:json(c.patient),rubric:json(c.rubric),status:'PENDING_REVIEW'}},assignments:{create:{classId}}}});caseId=record.id;
    auth.user.id=studentId;
  });
  afterAll(async()=>{
    const simulations=await db.simulation.findMany({where:{studentId:{in:[studentId,otherId]}},select:{id:true}});
    const ids=simulations.map(s=>s.id);
    await db.review.deleteMany({where:{attempt:{simulationId:{in:ids}}}});
    await db.reservationBucket.deleteMany({where:{reservation:{job:{attempt:{simulationId:{in:ids}}}}}});
    await db.usageReservation.deleteMany({where:{job:{attempt:{simulationId:{in:ids}}}}});
    await db.job.deleteMany({where:{attempt:{simulationId:{in:ids}}}});
    await db.attempt.deleteMany({where:{simulationId:{in:ids}}});
    await db.message.deleteMany({where:{simulationId:{in:ids}}});
    await db.simulation.deleteMany({where:{id:{in:ids}}});
    await db.assignment.deleteMany({where:{caseId}});await db.caseVersion.deleteMany({where:{caseId}});await db.clinicalCase.deleteMany({where:{id:caseId}});
    await db.membership.deleteMany({where:{classId}});await db.class.deleteMany({where:{id:classId}});
    await db.user.deleteMany({where:{id:{in:[studentId,otherId,instructorId,foreignId]}}});await db.$disconnect();
  });
  it('creates one simulation and never exposes rubric to the student',async()=>{
    const first=await call('simulations','POST',{caseId});simulationId=first.simulation.id;
    const again=await call('simulations','POST',{caseId});
    expect(again.simulation.id).toBe(simulationId);expect(first.simulation.case).not.toHaveProperty('rubric');
  });
  it('denies another student and another instructor even with a known simulation ID',async()=>{
    auth.user.id=otherId;await expect(call(`simulations/${simulationId}`)).rejects.toMatchObject({status:404});
    auth.user.id=foreignId;auth.user.role='INSTRUCTOR';await expect(call(`simulations/${simulationId}`)).rejects.toMatchObject({status:404});
    auth.user.id=instructorId;expect((await call(`simulations/${simulationId}`)).simulation.id).toBe(simulationId);
    await expect(call(`simulations/${simulationId}`,'PUT',{draft:EMPTY_DRAFT,revision:0})).rejects.toMatchObject({status:403});
    auth.user.id=studentId;auth.user.role='STUDENT';
  });
  it('saves incomplete referrals but rejects sending them and rejects stale saves',async()=>{
    expect(await call(`simulations/${simulationId}`,'PUT',{draft:{...EMPTY_DRAFT,outcome:'REFER'},revision:0})).toEqual({revision:1});
    await expect(call(`simulations/${simulationId}/submit`,'POST',{revision:1,conversationRevision:0,idempotencyKey:'incomplete-draft'})).rejects.toMatchObject({status:400});
    await expect(call(`simulations/${simulationId}`,'PUT',{draft:EMPTY_DRAFT,revision:0})).rejects.toMatchObject({status:409});
  });
  it('snapshots once per revision and reuses idempotent submissions',async()=>{
    await call(`simulations/${simulationId}`,'PUT',{draft:{...EMPTY_DRAFT,text:'Pessoa relata dor de cabeça. Sem alergias conhecidas.',ciap:'W78',risk:'NON_ACUTE',outcome:'RELEASE'},revision:1});
    const first=await call(`simulations/${simulationId}/submit`,'POST',{revision:2,conversationRevision:0,idempotencyKey:'submission-one'});attemptId=first.resourceId;
    const again=await call(`simulations/${simulationId}/submit`,'POST',{revision:2,conversationRevision:0,idempotencyKey:'submission-two'});
    expect(again.resourceId).toBe(attemptId);
    await call(`simulations/${simulationId}`,'PUT',{draft:{...EMPTY_DRAFT,text:'Revisão posterior'},revision:2});
    expect((await db.attempt.findUniqueOrThrow({where:{id:attemptId}})).snapshot).toMatchObject({text:'Pessoa relata dor de cabeça. Sem alergias conhecidas.'});
  });
  it('finishes a job without replacing a newer draft status',async()=>{
    for(let i=0;i<10;i++){
      await runNextJob();
      if((await db.attempt.findUniqueOrThrow({where:{id:attemptId}})).status==='COMPLETED')break;
    }
    const attempt=await db.attempt.findUniqueOrThrow({where:{id:attemptId}});expect(attempt.status).toBe('COMPLETED');
    expect(attempt.feedback).toMatchObject({clinicalPending:true,mode:'demo'});
    expect((await db.simulation.findUniqueOrThrow({where:{id:simulationId}})).status).toBe('DRAFT');
  });
  it('recovers an expired worker lease without producing another attempt',async()=>{
    await call(`simulations/${simulationId}`,'PUT',{draft:{...EMPTY_DRAFT,text:'Paciente relata cefaleia. Nega alergias.',ciap:demoCases[0].rubric.acceptedCiap[0],risk:demoCases[0].rubric.acceptedRisks[0],outcome:'RELEASE'},revision:3});
    const result=await call(`simulations/${simulationId}/submit`,'POST',{revision:4,conversationRevision:0,idempotencyKey:'recover-worker'});
    await db.job.update({where:{attemptId:result.resourceId},data:{state:'RUNNING',tries:1,leaseToken:'abandoned-worker',leaseUntil:new Date(Date.now()-1000)}});
    await runNextJob();
    const job=await db.job.findUniqueOrThrow({where:{attemptId:result.resourceId}});
    expect(job.state).toBe('COMPLETED');expect(job.tries).toBe(2);expect(job.leaseToken).toBeNull();
    expect(await db.attempt.count({where:{simulationId,revision:4}})).toBe(1);
  });
  it('returns the same attempt for concurrent duplicate submissions',async()=>{
    await call(`simulations/${simulationId}`,'PUT',{draft:{...EMPTY_DRAFT,text:'Paciente relata cefaleia. Nega alergias.',ciap:demoCases[0].rubric.acceptedCiap[0],risk:demoCases[0].rubric.acceptedRisks[0],outcome:'RELEASE'},revision:4});
    const attempts=await Promise.all([call(`simulations/${simulationId}/submit`,'POST',{revision:5,conversationRevision:0,idempotencyKey:'concurrent-send-one'}),call(`simulations/${simulationId}/submit`,'POST',{revision:5,conversationRevision:0,idempotencyKey:'concurrent-send-two'})]);
    expect(attempts[0].resourceId).toBe(attempts[1].resourceId);
  });
  it('permits comments only for the owning instructor',async()=>{
    await expect(call(`attempts/${attemptId}/reviews`,'POST',{comment:'Revisão'})).rejects.toMatchObject({status:403});
    auth.user.id=foreignId;auth.user.role='INSTRUCTOR';await expect(call(`attempts/${attemptId}/reviews`,'POST',{comment:'Revisão'})).rejects.toMatchObject({status:404});
    auth.user.id=instructorId;expect(await call(`attempts/${attemptId}/reviews`,'POST',{comment:'Discussão formativa registrada.'})).toEqual({ok:true});
  });
  it('publishes a new reviewed version while preserving the simulation original',async()=>{
    const old=await db.caseVersion.findFirstOrThrow({where:{caseId,version:1}});
    expect(await call(`instructor/cases/${caseId}/publish`,'POST',{classIds:[classId],reviewed:true,expectedVersion:1})).toEqual({ok:true,version:2});
    await expect(call(`instructor/cases/${caseId}/publish`,'POST',{classIds:[classId],reviewed:true,expectedVersion:1})).rejects.toMatchObject({status:409});
    expect((await db.caseVersion.findUniqueOrThrow({where:{id:old.id}})).reviewedAt).toBeNull();
    const current=await db.caseVersion.findFirstOrThrow({where:{caseId,version:2}});expect(current.reviewedBy).toBe(instructorId);expect(current.status).toBe('PUBLISHED');
    expect((await db.simulation.findUniqueOrThrow({where:{id:simulationId}})).caseVersionId).toBe(old.id);
  });
  it('revoking enrollment also denies history reads and draft writes',async()=>{
    auth.user.id=studentId;auth.user.role='STUDENT';
    await db.membership.delete({where:{userId_classId:{userId:studentId,classId}}});
    try {
      await expect(call(`simulations/${simulationId}`)).rejects.toMatchObject({status:404});
      await expect(call(`simulations/${simulationId}/messages`)).rejects.toMatchObject({status:404});
      await expect(call(`attempts/${attemptId}`)).rejects.toMatchObject({status:404});
      await expect(call(`simulations/${simulationId}`,'PUT',{draft:EMPTY_DRAFT,revision:5})).rejects.toMatchObject({status:404});
    } finally { await db.membership.create({data:{userId:studentId,classId}}); }
  });
});
