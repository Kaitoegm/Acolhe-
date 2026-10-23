import { describe,it,expect,beforeEach } from 'vitest';
import { pagination,keyset,type Keys } from '../src/lib/server/pagination';
const req=(query='')=>new Request(`http://localhost/api/simulations${query}`);
describe('signed keyset pagination',()=>{
 beforeEach(()=>{process.env.SESSION_SECRET='pagination-tests-secret-at-least-32-characters';});
 it('defaults to25 and rejects invalid parameters',()=>{expect(pagination(req(),['a']).limit).toBe(25);for(const query of ['?limit=101','?limit=0','?limit=2.5','?limit=1&limit=2','?unknown=x','?cursor='])expect(()=>pagination(req(query),['a'])).toThrow();expect(pagination(req('?limit=100'),['a']).limit).toBe(100);});
 it('binds cursor to principal route filters and ordering and detects tampering',()=>{
  const p=pagination(req('?q=ana&order=risk'),['user1','simulations'],['q','order']);const rows=[{id:'a',createdAt:'2026-10-20T00:00:00.000Z',riskRank:0},{id:'b',createdAt:'2026-10-20T00:00:00.000Z',riskRank:0}];
  const token=pagination(req('?limit=1&q=ana&order=risk'),['user1','simulations'],['q','order']).page(rows,r=>r).nextCursor!;
  expect(pagination(req(`?cursor=${token}&q=ana&order=risk`),['user1','simulations'],['q','order']).after).toEqual(rows[0]);
  for(const [query,scope] of [[`?cursor=${token}&q=bia&order=risk`,['user1','simulations']],[`?cursor=${token}&q=ana&order=risk`,['user2','simulations']],[`?cursor=${token}&q=ana&order=risk`,['user1','cases']],[`?cursor=${token.slice(0,-1)}x&q=ana&order=risk`,['user1','simulations']]] as const)expect(()=>pagination(req(query),scope,['q','order'])).toThrow();
  expect(p.limit).toBe(25);
 });
 it('walks250 tied records without duplication or omission using generated database predicates',()=>{
  const rows=Array.from({length:250},(_,i)=>({id:String(i).padStart(4,'0'),createdAt:new Date('2026-10-20T00:00:00.000Z')})).reverse();let cursor:string|null=null;const seen:string[]=[];
  do{const p=pagination(req(`?limit=25${cursor?'&cursor='+cursor:''}`),['owner','simulations']);const where=keyset(p.after) as {OR?:({id?:{lt:string}})[]};const remaining=where.OR?rows.filter(r=>r.id<where.OR![1].id!.lt):rows;const page=p.page(remaining.slice(0,p.limit+1),r=>({id:r.id,createdAt:r.createdAt.toISOString()}));seen.push(...page.items.map(r=>r.id));cursor=page.nextCursor;}while(cursor);
  expect(seen).toEqual(rows.map(r=>r.id));expect(new Set(seen).size).toBe(250);
 });
 it('uses composite predicates for risk and attempt ordering',()=>{const keys:Keys={id:'z',createdAt:'2026-10-20T00:00:00Z',riskRank:1};expect(keyset(keys,false,true)).toEqual({OR:[{riskRank:{gt:1}},{riskRank:1,OR:[{createdAt:{lt:new Date(keys.createdAt!)}},{createdAt:new Date(keys.createdAt!),id:{lt:'z'}}]}]});expect(keyset({id:'a',number:3},false,false,true)).toEqual({OR:[{number:{lt:3}},{number:3,id:{lt:'a'}}]});});
});
