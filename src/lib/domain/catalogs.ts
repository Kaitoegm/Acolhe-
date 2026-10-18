import type { CatalogItem } from '../contracts';

// This is a manually checked training subset, not a complete SIGTAP competence import.
export const ciapCatalog: CatalogItem[] = [
  { code: 'A04', label: 'Debilidade/cansaço geral/fadiga' },
  { code: 'K86', label: 'Hipertensão sem complicações' },
  { code: 'W78', label: 'Gravidez' },
];
export const sigtapCatalog: CatalogItem[] = [{ code: '0301100039', label: 'Aferição de pressão arterial' }];
export const catalogMetadata = {
  version: 'training-subset-2026-10-17.1', importedAt: '2026-10-17', subset: true,
  description: 'Subconjunto manual para demonstração. Não representa a tabela completa nem uma competência SIGTAP vigente; sem regras de faturamento ou habilitação.',
  ciap: { version: 'CIAP-2; publicação REDS GO 1.0.3', source: 'https://fhir.saude.go.gov.br/r4/reds-go/CodeSystem-BRCIAP2.html' },
  sigtap: { version: 'Código conferido na Portaria SAES/MS nº 15 de 13/01/2022; competência não importada', source: 'https://bvsms.saude.gov.br/bvs/saudelegis/saes/2022/prt0015_13_01_2022.html' },
};
