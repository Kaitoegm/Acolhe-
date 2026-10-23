import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT } from '../src/lib/contracts';
import { demoCases, validateDraftStorage, validateSubmissionDraft, validatePublicationRubric } from '../src/lib/domain';

describe('limites entre rascunho, envio e publicação', () => {
  it('salva encaminhamento parcial, mas impede concluir campos obrigatórios ausentes', () => {
    expect(validateDraftStorage({ ...EMPTY_DRAFT, outcome: 'REFER' }).outcome).toBe('REFER');
    expect(() => validateSubmissionDraft(EMPTY_DRAFT)).toThrow(/obrigatóri/i);
    expect(() => validateSubmissionDraft({ ...EMPTY_DRAFT, text: 'Relato', ciap: 'W78', risk: 'LOW', outcome: 'REFER' })).toThrow(/profissional/);
  });
  it('rejeita texto excessivo e documento divergente já no salvamento', () => {
    expect(() => validateDraftStorage({ ...EMPTY_DRAFT, text: 'a'.repeat(4001) })).toThrow();
    expect(() => validateDraftStorage({ ...EMPTY_DRAFT, text: 'Original', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Diferente' }] }] } })).toThrow(/corresponde/);
  });
  it('exige critérios completos e códigos revisados para publicar', () => {
    const { patient, rubric } = demoCases[0];
    expect(() => validatePublicationRubric(rubric, patient)).not.toThrow();
    expect(() => validatePublicationRubric({ ...rubric, acceptedRisks: [] }, patient)).toThrow(/classificação/);
    expect(() => validatePublicationRubric({ ...rubric, acceptedCiap: ['inventado'] }, patient)).toThrow(/catálogo/);
    expect(() => validatePublicationRubric({ ...rubric, references: [] }, patient)).toThrow(/referências/);
    expect(() => validatePublicationRubric({ ...rubric, expectedProcedures: ['0301100039'] }, { ...patient, performedProcedures: [] })).toThrow(/realizado/);
  });
});
