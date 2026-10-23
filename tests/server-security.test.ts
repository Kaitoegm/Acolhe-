import { describe, expect, it } from 'vitest';
import { assertOrigin, simulationScope, requireRole } from '../src/lib/server/security';

describe('server access boundaries', () => {
  it('rejects foreign and missing origins for mutations', () => {
    expect(() => assertOrigin(new Request('http://localhost:3000/api/login', {method:'POST', headers:{origin:'https://evil.example'}}))).toThrow();
    expect(() => assertOrigin(new Request('http://localhost:3000/api/login', {method:'POST'}))).toThrow();
    expect(() => assertOrigin(new Request('http://localhost:3000/api/login', {method:'POST', headers:{origin:'http://localhost:3000'}}))).not.toThrow();
  });
  it('scopes students to their own records and instructors to their own classes', () => {
    expect(simulationScope({id:'s1',role:'STUDENT'})).toEqual({studentId:'s1',class:{memberships:{some:{userId:'s1'}}}});
    expect(simulationScope({id:'i1',role:'INSTRUCTOR'})).toEqual({class:{instructorId:'i1'}});
  });
  it('never lets an instructor mutate a student simulation', () => {
    expect(() => requireRole({id:'i',role:'INSTRUCTOR'},'STUDENT')).toThrow();
    expect(() => requireRole({id:'s',role:'STUDENT'},'STUDENT')).not.toThrow();
  });
  it('rejects unknown roles rather than widening the database scope',()=>{
    expect(()=>simulationScope({id:'x',role:'ADMIN'})).toThrow();
  });
});
