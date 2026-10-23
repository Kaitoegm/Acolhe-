import type { CatalogItem } from "../contracts";

// This is a manually checked training subset, not a complete SIGTAP competence import.
export const ciapCatalog: CatalogItem[] = [
  { code: "A03", label: "Febre" },
  { code: "A04", label: "Debilidade/cansaço geral/fadiga" },
  { code: "A09", label: "Problemas de sudorese" },
  { code: "A11", label: "Dores torácicas não especificadas" },
  { code: "A29", label: "Outros sinais/sintomas gerais" },
  { code: "A80", label: "Lesão traumática/acidente não especificado" },
  { code: "A98", label: "Medicina preventiva/manutenção da saúde" },
  { code: "D01", label: "Dor abdominal generalizada/cólicas" },
  { code: "D10", label: "Vômito" },
  { code: "D11", label: "Diarreia" },
  { code: "D12", label: "Obstipação" },
  { code: "D19", label: "Sinais/sintomas dos dentes/gengivas" },
  { code: "H01", label: "Dor de ouvidos" },
  { code: "K86", label: "Hipertensão sem complicações" },
  { code: "L03", label: "Sinais/sintomas da região lombar" },
  { code: "N01", label: "Cefaleia" },
  { code: "N17", label: "Vertigens/tonturas" },
  { code: "N18", label: "Paralisia/fraqueza" },
  { code: "N19", label: "Perturbações da fala" },
  { code: "P01", label: "Sensação de ansiedade/nervosismo/tensão" },
  { code: "P03", label: "Tristeza/sensação de depressão" },
  { code: "R02", label: "Dificuldade respiratória/dispneia" },
  { code: "R03", label: "Respiração ruidosa" },
  { code: "R05", label: "Tosse" },
  { code: "R21", label: "Sinais/sintomas da garganta" },
  { code: "S18", label: "Laceração/corte" },
  { code: "S97", label: "Úlcera crônica da pele" },
  { code: "T01", label: "Sede excessiva" },
  { code: "T87", label: "Hipoglicemia" },
  { code: "U01", label: "Disúria/micção dolorosa" },
  { code: "U02", label: "Micção frequente/urgência urinária/polaciúria" },
  { code: "W03", label: "Hemorragia antes do parto" },
  { code: "W10", label: "Contracepção pós-coital" },
  { code: "W18", label: "Sinais/sintomas pós-parto" },
  { code: "W78", label: "Gravidez" },
  { code: "Z01", label: "Pobreza/problemas econômicos" },
  { code: "Z25", label: "Ato ou acontecimento violento" },
];
export const sigtapCatalog: CatalogItem[] = [
  { code: "0301100039", label: "Aferição de pressão arterial" },
  { code: "0214010015", label: "Glicemia capilar" },
  {
    code: "0401010023",
    label: "Curativo grau I com ou sem debridamento (por paciente)",
  },
];
export const catalogMetadata = {
  version: "training-subset-2026-10-20.2",
  importedAt: "2026-10-20",
  subset: true,
  description:
    "Subconjunto manual para demonstração. Não representa a tabela completa nem uma competência SIGTAP vigente; sem regras de faturamento ou habilitação.",
  ciap: {
    version: "CIAP-2; publicação REDS GO 1.0.3",
    source: "https://fhir.saude.go.gov.br/r4/reds-go/CodeSystem-BRCIAP2.html",
  },
  sigtap: {
    version:
      "Subconjunto educativo; códigos conferidos nos atos MS referenciados; competência vigente não importada",
    source:
      "https://bvsms.saude.gov.br/bvs/saudelegis/saes/2022/prt0015_13_01_2022.html",
    additionalSources: [
      "https://bvsms.saude.gov.br/bvs/saudelegis/sas/2019/pr2045_07_02_2019.html",
      "https://bvsms.saude.gov.br/bvs/saudelegis/saes/2020/prt0526_02_07_2020.html",
    ],
  },
};
