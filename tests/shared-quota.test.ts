import { describe, expect, it, vi, afterEach } from 'vitest';
import { sharedAvailability } from '../src/lib/server/quotas';
afterEach(()=>vi.unstubAllEnvs());
describe('shared capacity by operation',()=>{
  it('exhausted evaluations do not disable conversations',()=>{
    vi.stubEnv('AI_MODE','demo');
    expect(sharedAvailability([{scope:'GLOBAL',operation:'evaluation',used:600,reserved:0}])).toEqual({chat:true,evaluation:false});
  });
  it('provider ceiling applies to both operations only in live mode',()=>{
    vi.stubEnv('AI_MODE','live');
    const buckets=[{scope:'GLOBAL',operation:'provider',used:10000,reserved:0}];
    expect(sharedAvailability(buckets)).toEqual({chat:false,evaluation:false});
    vi.stubEnv('AI_MODE','demo');
    expect(sharedAvailability(buckets)).toEqual({chat:true,evaluation:true});
  });
});
