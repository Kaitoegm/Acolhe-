import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {db} from '../src/lib/server/db';
import {readApi} from '../src/lib/server/reads';
import {EMPTY_DRAFT,type Page,type QueueItem} from '../src/lib/contracts';
import {demoCases} from '../src/lib/domain';
import {json} from '../src/lib/server/views';
const prefix='pagination-'+randomUUID();
const teacher=prefix+'-teacher',foreign=prefix+'-foreign',classId=prefix+'-class',caseId=prefix+'-case',versionId=prefix+'-version';
const ids=Array.from({length:250},(_,i)=>prefix+'-'+String(i).padStart(4,'0'));
function read(query='',user={id:teacher,role:'INSTRUCTOR'}){return readApi(new Request('http://localhost/api/simulations'+query),['simulations'],user) as Promise<Page<QueueItem>>;}
describe('database pagination with250 tied dates',()=>{
 beforeAll(async()=>{
  process.env.SESSION_SECRET??='pagination-db-test-secret-32-characters';
  await db.user.createMany({data:[teacher,foreign,...ids].map(id=>({id,email:id+'@example.test',name:id,passwordHash:'unused',role:id===teacher||id===foreign?'INSTRUCTOR':'STUDENT'}))});
  await db.class.create({data:{id:classId,name:prefix,instructorId:teacher}});
  await db.membership.createMany({data:ids.map(userId=>({userId,classId}))});
  const c=demoCases[0];await db.clinicalCase.create({data:{id:caseId,ownerId:teacher,currentStatus:'PUBLISHED',versions:{create:{id:versionId,version:1,title:c.title,description:c.description,patient:json(c.patient),rubric:json(c.rubric),status:'PUBLISHED'}}}});
  await db.simulation.createMany({data:ids.map((studentId,i)=>({id:prefix+'-sim-'+String(i).padStart(4,'0'),studentId,classId,caseId,caseVersionId:versionId,patientName:'Paciente '+i,patientNameSearch:('Paciente '+i).toLowerCase(),riskRank:i%5,draft:json(EMPTY_DRAFT),createdAt:new Date('2026-01-01T00:00:00Z')}))});
 },30000);
 afterAll(async()=>{await db.attempt.deleteMany({where:{simulation:{classId}}});await db.simulation.deleteMany({where:{classId}});await db.caseVersion.deleteMany({where:{caseId}});await db.clinicalCase.deleteMany({where:{id:caseId}});await db.membership.deleteMany({where:{classId}});await db.class.deleteMany({where:{id:classId}});await db.user.deleteMany({where:{id:{in:[teacher,foreign,...ids]}}});});
 for(const order of ['newest','arrival','risk'])it(`walks250 real rows in ${order} order without losses`,async()=>{
  const seen:string[]=[];let cursor:string|null=null;
  do{const page=await read(`?limit=25&order=${order}${cursor?'&cursor='+cursor:''}`);expect(page.items.length).toBeLessThanOrEqual(25);seen.push(...page.items.map(r=>r.id));cursor=page.nextCursor;}while(cursor);
  expect(seen.length).toBe(250);expect(new Set(seen).size).toBe(250);
 });
 it('rejects cross-principal cursor and preserves case-insensitive database filters',async()=>{
  const first=await read('?limit=1');await expect(read('?limit=1&cursor='+first.nextCursor,{id:foreign,role:'INSTRUCTOR'})).rejects.toMatchObject({status:400});
  expect((await read('',{id:foreign,role:'INSTRUCTOR'})).items).toEqual([]);
  const result=await read('?q=PACIENTE%20249');expect(result.items).toHaveLength(1);expect(result.items[0].name).toBe('Paciente 249');
  expect((await read('',{id:ids[0],role:'STUDENT'})).items).toHaveLength(1);
 });
 it('finds accented names with the same normalization used in stored projections',async()=>{
  await db.simulation.update({where:{id:prefix+'-sim-0248'},data:{patientName:'João Exemplo',patientNameSearch:'joao exemplo'}});
  const result=await read('?q='+encodeURIComponent('JOÃO'));
  expect(result.items).toHaveLength(1);expect(result.items[0].name).toBe('João Exemplo');
 });
 it('status reads leave revisions and timestamps unchanged and progress only returns latest2 dimensions',async()=>{
  const simulationId=prefix+'-sim-0000';
  const feedback={summary:'Teste',clinicalPending:false,mode:'demo',items:[{id:'one',category:'RISK',field:'risk',level:'REVIEW',suggestion:'Revisar',explanation:'Teste',criterion:'Critério'}]};
  for(let number=1;number<=3;number++)await db.attempt.create({data:{simulationId,number,revision:number,idempotencyKey:prefix+'-attempt-'+number,snapshot:json(EMPTY_DRAFT),conversation:[],caseSnapshot:{},status:'COMPLETED',feedback:json(feedback)}});
  const before=await db.simulation.findUniqueOrThrow({where:{id:simulationId}});
  const route=['simulations',simulationId,'status'];const statuses=await Promise.all([readApi(new Request('http://localhost/api/'+route.join('/')),route,{id:teacher,role:'INSTRUCTOR'}),readApi(new Request('http://localhost/api/'+route.join('/')),route,{id:teacher,role:'INSTRUCTOR'})]);
  const after=await db.simulation.findUniqueOrThrow({where:{id:simulationId}});expect(after).toEqual(before);expect(statuses[0]).toMatchObject({revision:0,conversationRevision:0,latestAttempt:{number:3},pendingChat:null});
  const progressRoute=['instructor','simulations',simulationId,'progress'];const progress=await readApi(new Request('http://localhost/api/'+progressRoute.join('/')),progressRoute,{id:teacher,role:'INSTRUCTOR'}) as {totalAttempts:number;dimensions:unknown[];latest:{number:number;dimensions:unknown[]}[]};
  expect(progress.totalAttempts).toBe(3);expect(progress.dimensions).toEqual([{category:'RISK',ADEQUATE:0,REVIEW:3,ATTENTION:0}]);expect(progress.latest.map(a=>a.number)).toEqual([3,2]);expect(JSON.stringify(progress)).not.toContain('snapshot');
 });
});

