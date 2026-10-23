import { describe,it,expect } from 'vitest';
import { checkPayload } from '../src/lib/server/enqueue';
import { quotaLimit,windowUTC } from '../src/lib/server/quotas';
describe('queue budgets',()=>{
 it('uses UTC day and minute boundaries',()=>{const d=new Date('2026-10-20T23:59:58.123Z');expect(windowUTC(d).toISOString()).toBe('2026-10-20T00:00:00.000Z');expect(windowUTC(d,true).toISOString()).toBe('2026-10-20T23:59:00.000Z');});
 it('rejects UTF8 payload beyond budget without silently truncating',()=>{expect(()=>checkPayload({text:'á'.repeat(17000)})).toThrow(/32.000/);expect(()=>checkPayload({text:'x'.repeat(31000)})).not.toThrow();});
 it('keeps provider calls and operation units separate',()=>{expect(quotaLimit('GLOBAL','provider')).toBe(10000);expect(quotaLimit('STUDENT','evaluation')).toBe(20);expect(quotaLimit('MINUTE','chat')).toBe(10);});
});
