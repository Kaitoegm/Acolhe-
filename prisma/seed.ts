import 'dotenv/config';
import { hash } from 'bcryptjs';
import { db } from '../src/lib/server/db';
import { demoCases } from '../src/lib/domain';
import { json } from '../src/lib/server/views';
async function main(){
  if(process.env.NODE_ENV==='production' || process.env.AI_MODE!=='demo' || process.env.ALLOW_DEMO_CASES!=='true') throw new Error('Seed permitido somente em demonstração local explícita.');
  const password=process.env.DEMO_PASSWORD;
  if(!password || password.length<4) throw new Error('Defina DEMO_PASSWORD com pelo menos 4 caracteres.');
  const passwordHash=await hash(password,12);
  const instructor=await db.user.upsert({where:{email:'instrutor@acolhe.local'},update:{passwordHash},create:{email:'instrutor@acolhe.local',name:'Instrutora demonstração',passwordHash,role:'INSTRUCTOR'}});
  const student=await db.user.upsert({where:{email:'aluno@acolhe.local'},update:{passwordHash},create:{email:'aluno@acolhe.local',name:'Aluno demonstração',passwordHash,role:'STUDENT'}});
  const classroom=await db.class.upsert({where:{id:'demo-class'},update:{},create:{id:'demo-class',name:'Turma demonstração',instructorId:instructor.id}});
  await db.membership.upsert({where:{userId_classId:{userId:student.id,classId:classroom.id}},update:{},create:{userId:student.id,classId:classroom.id}});
  for(const c of demoCases){
    const item=await db.clinicalCase.upsert({where:{slug:c.slug},update:{},create:{slug:c.slug,ownerId:instructor.id,demo:true,versions:{create:{version:1,title:c.title,description:c.description,patient:json(c.patient),rubric:json(c.rubric),status:'PENDING_REVIEW'}}}});
    await db.assignment.upsert({where:{caseId_classId:{caseId:item.id,classId:classroom.id}},update:{},create:{caseId:item.id,classId:classroom.id}});
  }
  console.log('Demonstração criada: instrutor@acolhe.local / aluno@acolhe.local. Senha: valor de DEMO_PASSWORD. Casos aguardam revisão clínica.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
