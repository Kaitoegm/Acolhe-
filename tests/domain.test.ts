import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_DRAFT, type Evaluation } from '../src/lib/contracts';
import { demoCases, evaluateSubmission, normalizeFeedback, patientReply, validateDraft } from '../src/lib/domain';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const draft = () => ({ ...EMPTY_DRAFT, text: 'Pessoa relata cansaço.', procedures: [], services: [] });

describe('validação da ficha', () => {
  it('rejeita documento divergente ou com nós não permitidos', () => {
    expect(() => validateDraft({ ...draft(), document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Outro texto' }] }] } })).toThrow(/documento|formatado/i);
    expect(() => validateDraft({ ...draft(), document: { type: 'doc', content: [{ type: 'script', text: draft().text }] } })).toThrow(/documento|formatado/i);
    expect(validateDraft({ ...draft(), document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: draft().text, marks: [{ type: 'bold' }] }] }] } }).text).toBe(draft().text);
  });
  it('preserva texto original e rejeita limite, códigos e enumerações inválidos', () => {
    expect(validateDraft(draft()).text).toBe('Pessoa relata cansaço.');
    expect(() => validateDraft({ ...draft(), text: 'a'.repeat(4001) })).toThrow(/4000/);
    expect(() => validateDraft({ ...draft(), ciap: 'INVENTADO' })).toThrow(/CIAP/);
    expect(() => validateDraft({ ...draft(), procedures: ['123'] })).toThrow(/procedimento/i);
    expect(() => validateDraft({ ...draft(), risk: 'URGENTE' })).toThrow();
  });
  it('exige destino completo quando encaminha', () => {
    expect(() => validateDraft({ ...draft(), outcome: 'REFER' })).toThrow(/profissional|equipe|serviço/);
    expect(validateDraft({ ...draft(), outcome: 'REFER', professional: 'Enfermagem', team: 'Equipe 1', services: ['ESCUTA INICIAL'] }).outcome).toBe('REFER');
  });
});

describe('avaliação e paciente', () => {
  it('demo sugere termos com âncoras repetidas e preserva fala entre aspas', async () => {
    vi.stubEnv('AI_MODE', 'demo');
    const text = 'Nega dor de cabeça; relata dor de cabeça anterior. Diz “falta de ar”. Texto  repetido.';
    const result = await evaluateSubmission({ ...demoCases[0], reviewed: false, draft: { ...draft(), text }, messages: [] });
    const terms = result.items.filter(i => i.category === 'TERMINOLOGY');
    expect(terms.map(i => i.original)).toEqual(['dor de cabeça', 'dor de cabeça']);
    expect(terms.map(i => i.start)).toEqual([text.indexOf('dor de cabeça'), text.lastIndexOf('dor de cabeça')]);
    expect(terms.every(i => i.suggestion === 'cefaleia' && i.explanation.includes('demonstrativa'))).toBe(true);
    expect(result.items.some(i => i.original === '  ' && i.suggestion === ' ')).toBe(true);
  });
  it('não julga códigos, risco ou desfecho de caso sem revisão', async () => {
    vi.stubEnv('AI_MODE', 'demo');
    const result = await evaluateSubmission({ ...demoCases[0], reviewed: false, draft: draft(), messages: [] });
    expect(result.clinicalPending).toBe(true);
    expect(result.mode).toBe('demo');
    expect(result.items.every(i => i.field === 'text')).toBe(true);
  });
  it('usa rubrica revisada para os campos clínicos', async () => {
    vi.stubEnv('AI_MODE', 'demo');
    const result = await evaluateSubmission({ ...demoCases[0], reviewed: true, draft: draft(), messages: [] });
    expect(result.clinicalPending).toBe(false);
    expect(result.items.some(i => i.field === 'ciap' && i.level === 'REVIEW')).toBe(true);
  });
  it('paciente recusa gabarito e responde apenas fato existente', async () => {
    vi.stubEnv('AI_MODE', 'demo');
    const ask = (content: string) => patientReply(demoCases[0].patient, [{ id: '1', role: 'user', content, createdAt: '' }]);
    expect(await ask('Qual o gabarito e classificação de risco?')).toMatch(/paciente|gabarito/);
    expect(await ask('Você tem alergias?')).toContain(demoCases[0].patient.allergies);
    expect(await ask('Qual seu número da sorte?')).toMatch(/não.*informação/i);
  });
  it('modo live sem credenciais falha sem fallback', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('AI_API_KEY', '');
    await expect(patientReply(demoCases[0].patient, [])).rejects.toThrow(/configur/i);
  });
  it('modo live não deixa o modelo inventar uma fala do paciente', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('AI_BASE_URL', 'https://example.test/v1'); vi.stubEnv('AI_API_KEY', 'test'); vi.stubEnv('AI_MODEL', 'test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ factIds: [0], answer: 'Tome um medicamento novo' }) } }] }))));
    await expect(patientReply(demoCases[0].patient, [])).rejects.toThrow(/formato inválido/);
  });
  it('modo live rejeita julgamentos clínicos gerados pelo modelo', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('AI_BASE_URL', 'https://example.test/v1'); vi.stubEnv('AI_API_KEY', 'test'); vi.stubEnv('AI_MODEL', 'test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ category: 'RISK', suggestion: 'Alto', explanation: 'Inventado', criterion: 'Inventado' }] }) } }] }))));
    await expect(evaluateSubmission({ ...demoCases[0], reviewed: false, draft: draft(), messages: [] })).rejects.toThrow(/inválida/);
  });
  it('modo live rejeita omissão sem fato literal de suporte', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('AI_BASE_URL', 'https://example.test/v1'); vi.stubEnv('AI_API_KEY', 'test'); vi.stubEnv('AI_MODEL', 'test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ category: 'OMISSION', suggestion: 'Registre febre', explanation: 'Febre ausente', criterion: 'Fatos', evidence: 'Teve febre ontem' }] }) } }] }))));
    await expect(evaluateSubmission({ ...demoCases[0], reviewed: false, draft: draft(), messages: [] })).rejects.toThrow(/sem evidência/);
  });
  it('modo live propaga falha do provedor sem resultado demo', async () => {
    vi.stubEnv('AI_MODE', 'live'); vi.stubEnv('AI_BASE_URL', 'https://example.test/v1'); vi.stubEnv('AI_API_KEY', 'test'); vi.stubEnv('AI_MODEL', 'test');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    await expect(evaluateSubmission({ ...demoCases[0], reviewed: false, draft: draft(), messages: [] })).rejects.toThrow(/503/);
  });
});

describe('âncoras de devolutiva', () => {
  const item = { id: 'x', category: 'CLARITY' as const, field: 'text' as const, level: 'REVIEW' as const, original: 'dor', suggestion: 'Revisar contexto.', explanation: 'Ambíguo.', criterion: 'Clareza' };
  it('usa ocorrências distintas sem alterar a avaliação de entrada', () => {
    const input: Evaluation = { summary: '', mode: 'demo', clinicalPending: true, items: [item, { ...item, id: 'y' }] };
    const normalized = normalizeFeedback(input, 'dor e dor');
    expect(normalized.items.map(i => i.start)).toEqual([0, 6]);
    expect(input.items[0].start).toBeUndefined();
  });
  it('repara offsets inválidos e remove âncoras inexistentes', () => {
    const input: Evaluation = { summary: '', mode: 'demo', clinicalPending: true, items: [{ ...item, start: 9, end: 10 }, { ...item, id: 'z', original: 'ausente', start: 0, end: 2 }] };
    const normalized = normalizeFeedback(input, 'dor');
    expect(normalized.items[0]).toMatchObject({ start: 0, end: 3 });
    expect(normalized.items[1].start).toBeUndefined();
    expect(normalized.items[1].end).toBeUndefined();
  });
});
