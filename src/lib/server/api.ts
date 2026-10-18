import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { after } from 'next/server';
import { db } from './db';
import { authenticated, currentUser, login, publicUser, session } from './auth';
import { assertOrigin, HttpError, requireRole, simulationScope } from './security';
import { caseSchema, credentialsSchema, draftSchema, studentSchema } from './validation';
import { attemptView, casePrivate, casePublic, json, queueView, simulationInclude, simulationView } from './views';
import { ciapCatalog, sigtapCatalog, patientReply, validateDraft } from '../domain';
import { EMPTY_DRAFT, type PatientFacts } from '../contracts';
import { drainJobs } from './jobs';

type User=Awaited<ReturnType<typeof authenticated>>;
const attemptInclude={reviews:{include:{author:{select:{name:true}}},orderBy:{createdAt:'asc' as const}}};
const mode=()=>process.env.AI_MODE==='live'?'live':'demo';
const demoEnabled=()=>process.env.ALLOW_DEMO_CASES==='true' && mode()==='demo' && process.env.NODE_ENV!=='production';
function kick(){ after(async()=>{await drainJobs().catch(e=>console.error('Worker dispatch failed',e));}); }
async function body(request:Request){
  if(!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415,'Envie JSON.');
  const raw=await request.text();
  if(raw.length>150000) throw new HttpError(413,'Solicitação muito grande.');
  try{return JSON.parse(raw) as unknown;}catch{throw new HttpError(400,'JSON inválido.');}
}
async function ownSimulation(id:string,user:User){
  const s=await db.simulation.findFirst({where:{id,...simulationScope(user)},include:simulationInclude});
  if(!s) throw new HttpError(404,'Atendimento não encontrado.');
  return s;
}
async function ownedClass(id:string,user:User){
  const c=await db.class.findFirst({where:{id,instructorId:user.id}});
  if(!c)throw new HttpError(404,'Turma não encontrada.');
  return c;
}
async function visibleCases(user:User){
  const items=await db.clinicalCase.findMany({where:user.role==='INSTRUCTOR'?{ownerId:user.id}:{assignments:{some:{class:{memberships:{some:{userId:user.id}}}}}},include:{versions:{orderBy:{version:'desc'},take:1}}});
  return items.filter(c=>c.versions[0] && (user.role==='INSTRUCTOR' || c.versions[0].status==='PUBLISHED' || (c.demo && demoEnabled())));
}

export async function dispatch(request:Request,parts:string[]) {
  const method=request.method;
  if(method!=='GET')assertOrigin(request);
  const path=parts.join('/');
  if(path==='session'&&method==='GET'){
    const u=await currentUser(); return {user:u?publicUser(u):null,mode:mode()};
  }
  if(path==='login'&&method==='POST'){
    const b=credentialsSchema.parse(await body(request));return {user:await login(b.email,b.password)};
  }
  if(path==='logout'&&method==='POST'){(await session()).destroy();return {ok:true};}
  const user=await authenticated();
  if(path==='catalogs'&&method==='GET')return {ciap:ciapCatalog,sigtap:sigtapCatalog};
  if(path==='cases'&&method==='GET')return {cases:(await visibleCases(user)).map(c=>casePublic(c.versions[0]))};
  if(path==='simulations'&&method==='GET'){
    const rows=await db.simulation.findMany({where:simulationScope(user),include:simulationInclude,orderBy:{updatedAt:'desc'}});
    return {simulations:rows.map(queueView)};
  }
  if(path==='simulations'&&method==='POST'){
    requireRole(user,'STUDENT');
    const {caseId}=z.object({caseId:z.string().min(1)}).parse(await body(request));
    const item=(await visibleCases(user)).find(c=>c.id===caseId);
    if(!item)throw new HttpError(404,'Caso não disponível para sua turma.');
    const assignment=await db.assignment.findFirst({where:{caseId,class:{memberships:{some:{userId:user.id}}}},orderBy:{classId:'asc'}});
    if(!assignment)throw new HttpError(404,'Caso não atribuído.');
    const s=await db.simulation.upsert({where:{studentId_caseId:{studentId:user.id,caseId}},update:{},create:{studentId:user.id,classId:assignment.classId,caseId,caseVersionId:item.versions[0].id,draft:json(EMPTY_DRAFT)},include:simulationInclude});
    return {simulation:simulationView(s)};
  }
  if(parts[0]==='simulations'&&parts[1]){
    const id=parts[1];
    const s=await ownSimulation(id,user);
    if(parts.length===2&&method==='GET'){
      if(s.attempts.some(a=>a.status==='QUEUED'||a.status==='RUNNING'))kick();
      return {simulation:simulationView(s)};
    }
    requireRole(user,'STUDENT');
    if(parts.length===2&&method==='PUT'){
      const b=z.object({draft:draftSchema,revision:z.number().int().nonnegative()}).parse(await body(request));
      const result=await db.simulation.updateMany({where:{id,studentId:user.id,revision:b.revision},data:{draft:json(b.draft),revision:{increment:1},status:'DRAFT'}});
      if(!result.count)throw new HttpError(409,'O rascunho foi atualizado em outra janela. Recarregue antes de salvar.');
      return {revision:b.revision+1};
    }
    if(parts[2]==='messages'&&method==='POST'){
      const b=z.object({content:z.string().trim().min(1).max(3000)}).parse(await body(request));
      if(s.messages.length>=100)throw new HttpError(400,'Limite de 50 trocas por atendimento atingido.');
      const incoming={id:crypto.randomUUID(),role:'user' as const,content:b.content,createdAt:new Date().toISOString()};
      const history=simulationView(s).messages;
      const reply=await patientReply(s.caseVersion.patient as unknown as PatientFacts,[...history,incoming]);
      // Conversation updates also advance revision, preventing submission of stale conversations.
      await db.$transaction(async tx=>{
        const updated=await tx.simulation.updateMany({where:{id,studentId:user.id,revision:s.revision},data:{revision:{increment:1}}});
        if(!updated.count)throw new HttpError(409,'Atendimento atualizado. Recarregue e envie a mensagem novamente.');
        await tx.message.create({data:{id:incoming.id,simulationId:id,role:'user',content:b.content,createdAt:new Date(incoming.createdAt)}});
        await tx.message.create({data:{simulationId:id,role:'assistant',content:reply,createdAt:new Date(Date.now()+1)}});
      });
      const updated=await ownSimulation(id,user);
      return {messages:simulationView(updated).messages,revision:updated.revision};
    }
    if(parts[2]==='submit'&&method==='POST'){
      const b=z.object({revision:z.number().int().nonnegative(),idempotencyKey:z.string().min(8).max(150)}).parse(await body(request));
      const existing=await db.attempt.findFirst({where:{simulationId:id,OR:[{idempotencyKey:b.idempotencyKey},{revision:b.revision}]},include:attemptInclude});
      if(existing){kick();return {attempt:attemptView(existing)};}
      if(s.revision!==b.revision)throw new HttpError(409,'Há alterações mais recentes. Salve e envie novamente.');
      let draft;
      try{draft=validateDraft(s.draft);}catch(error){throw new HttpError(400,error instanceof Error?error.message:'Registro inválido.');}
      const attempt=await db.$transaction(async tx=>{
        const locked=await tx.simulation.updateMany({where:{id,studentId:user.id,revision:b.revision},data:{status:'QUEUED'}});
        if(!locked.count)throw new HttpError(409,'Registro atualizado. Recarregue antes de enviar.');
        const last=await tx.attempt.findFirst({where:{simulationId:id},orderBy:{number:'desc'}});
        return tx.attempt.create({data:{simulationId:id,number:(last?.number??0)+1,revision:b.revision,idempotencyKey:b.idempotencyKey,snapshot:json(draft),conversation:json(simulationView(s).messages),caseSnapshot:json({caseId:s.caseId,version:s.caseVersion.version,patient:s.caseVersion.patient,rubric:s.caseVersion.rubric,reviewed:!!s.caseVersion.reviewedAt}),job:{create:{}}},include:attemptInclude});
      }).catch(async error=>{
        if(error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2034'].includes(error.code)){
          const winner=await db.attempt.findFirst({where:{simulationId:id,OR:[{idempotencyKey:b.idempotencyKey},{revision:b.revision}]},include:attemptInclude});
          if(winner)return winner;
        }
        throw error;
      });
      kick();return {attempt:attemptView(attempt)};
    }
  }
  if(parts[0]==='attempts'&&parts[1]&&method==='POST'){
    const a=await db.attempt.findFirst({where:{id:parts[1],simulation:simulationScope(user)},include:{...attemptInclude,simulation:true}});
    if(!a)throw new HttpError(404,'Tentativa não encontrada.');
    if(parts[2]==='retry'){
      requireRole(user,'STUDENT');
      if(a.status!=='FAILED')throw new HttpError(409,'Somente avaliações com falha podem ser repetidas.');
      await db.$transaction(async tx=>{
        const changed=await tx.attempt.updateMany({where:{id:a.id,status:'FAILED'},data:{status:'QUEUED',error:null}});
        if(!changed.count)throw new HttpError(409,'Tentativa já está em processamento.');
        await tx.job.update({where:{attemptId:a.id},data:{state:'QUEUED',tries:0,availableAt:new Date(),leaseToken:null,leaseUntil:null}});
        const latest=await tx.attempt.findFirst({where:{simulationId:a.simulationId},orderBy:{number:'desc'}});
        if(latest?.id===a.id)await tx.simulation.update({where:{id:a.simulationId},data:{status:'QUEUED'}});
      });
      kick();return {attempt:attemptView(await db.attempt.findUniqueOrThrow({where:{id:a.id},include:attemptInclude}))};
    }
    if(parts[2]==='reviews'){
      requireRole(user,'INSTRUCTOR');
      const {comment}=z.object({comment:z.string().trim().min(3).max(10000)}).parse(await body(request));
      await db.review.create({data:{attemptId:a.id,authorId:user.id,comment}});return {ok:true};
    }
  }
  if(parts[0]==='instructor'){
    requireRole(user,'INSTRUCTOR');
    if(parts.length===1&&method==='GET'){
      const [classes,students,cases,simulations]=await Promise.all([
        db.class.findMany({where:{instructorId:user.id},include:{_count:{select:{memberships:true}}},orderBy:{createdAt:'asc'}}),
        db.user.findMany({where:{role:'STUDENT',memberships:{some:{class:{instructorId:user.id}}}},select:{id:true,name:true,email:true,memberships:{where:{class:{instructorId:user.id}},select:{classId:true}}}}),
        visibleCases(user),
        db.simulation.findMany({where:simulationScope(user),include:{...simulationInclude,student:{select:{name:true}},class:{select:{name:true}}},orderBy:{updatedAt:'desc'}}),
      ]);
      return {classes:classes.map(c=>({id:c.id,name:c.name,studentCount:c._count.memberships})),students:students.map(s=>({id:s.id,name:s.name,email:s.email,classIds:s.memberships.map(m=>m.classId)})),cases:cases.map(c=>casePrivate(c.versions[0])),simulations:simulations.map(s=>({...queueView(s),studentName:s.student.name,studentId:s.studentId,className:s.class.name}))};
    }
    if(parts[1]==='classes'&&method==='POST'){
      const {name}=z.object({name:z.string().trim().min(2).max(150)}).parse(await body(request));
      const c=await db.class.create({data:{name,instructorId:user.id}});return {id:c.id};
    }
    if(parts[1]==='students'&&method==='POST'){
      const b=studentSchema.parse(await body(request));await ownedClass(b.classId,user);
      const u=await db.user.create({data:{name:b.name,email:b.email.toLowerCase(),passwordHash:await hash(b.password,12),role:'STUDENT',memberships:{create:{classId:b.classId}}}});return {id:u.id};
    }
    if(parts[1]==='cases'&&parts.length===2&&method==='POST'){
      const b=caseSchema.parse(await body(request));
      const c=await db.clinicalCase.create({data:{ownerId:user.id,versions:{create:{...b,patient:json(b.patient),rubric:json(b.rubric),version:1}}}});return {id:c.id};
    }
    if(parts[1]==='cases'&&parts[2]){
      const c=await db.clinicalCase.findFirst({where:{id:parts[2],ownerId:user.id},include:{versions:{orderBy:{version:'desc'},take:1}}});
      if(!c)throw new HttpError(404,'Caso não encontrado.');
      if(parts.length===3&&method==='PUT'){
        const b=caseSchema.parse(await body(request));
        await db.$transaction(async tx=>{
          const updated=await tx.clinicalCase.updateMany({where:{id:c.id,ownerId:user.id,currentVersion:c.currentVersion},data:{currentVersion:{increment:1}}});
          if(!updated.count)throw new HttpError(409,'Caso atualizado por outra janela.');
          await tx.caseVersion.create({data:{...b,patient:json(b.patient),rubric:json(b.rubric),caseId:c.id,version:c.currentVersion+1}});
        });return {id:c.id};
      }
      if(parts[3]==='publish'&&method==='POST'){
        const b=z.object({classIds:z.array(z.string()).min(1).max(100),reviewed:z.literal(true)}).parse(await body(request));
        const ids=[...new Set(b.classIds)];
        const count=await db.class.count({where:{id:{in:ids},instructorId:user.id}});
        if(count!==ids.length)throw new HttpError(403,'Uma das turmas não pertence a você.');
        const version=c.versions[0];const rubric=caseSchema.shape.rubric.parse(version.rubric);
        if(!rubric.rationale.trim()||!rubric.references.length||rubric.references.some(r=>!r.trim()))throw new HttpError(400,'Informe justificativa e referências antes de publicar.');
        await db.$transaction(async tx=>{
          // Publishing stamps a new immutable version; existing simulations keep their original clinical review state.
          const updated=await tx.clinicalCase.updateMany({where:{id:c.id,ownerId:user.id,currentVersion:c.currentVersion},data:{currentVersion:{increment:1}}});
          if(!updated.count)throw new HttpError(409,'Caso atualizado. Recarregue.');
          await tx.caseVersion.create({data:{caseId:c.id,version:c.currentVersion+1,title:version.title,description:version.description,patient:json(version.patient),rubric:json(version.rubric),status:'PUBLISHED',reviewedAt:new Date(),reviewedBy:user.id}});
          await tx.assignment.deleteMany({where:{caseId:c.id,class:{instructorId:user.id}}});
          for(const classId of ids)await tx.assignment.create({data:{caseId:c.id,classId}});
        });return {ok:true};
      }
    }
  }
  throw new HttpError(404,'Recurso não encontrado.');
}

export async function handle(request:Request,context:{params:Promise<{path:string[]}>}) {
  try {return Response.json(await dispatch(request,(await context.params).path),{headers:{'Cache-Control':'no-store'}});}
  catch(error){
    if(error instanceof HttpError)return Response.json({error:error.message},{status:error.status});
    if(error instanceof z.ZodError)return Response.json({error:'Dados inválidos. Verifique os campos preenchidos.'},{status:400});
    if(error instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2034'].includes(error.code))return Response.json({error:'Registro já existente ou atualizado simultaneamente. Recarregue e tente novamente.'},{status:409});
    console.error('API failure',error);
    return Response.json({error:'Não foi possível concluir a solicitação.'},{status:500});
  }
}
