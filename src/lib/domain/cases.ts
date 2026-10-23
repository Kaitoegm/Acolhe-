import type { PatientFacts, Rubric } from "../contracts";
import { catalogMetadata } from "./catalogs";

const rubric = (ciap: string): Rubric => ({
  requiredTopics: [
    { label: "Queixa e duração", keywords: ["dia", "semana", "mês", "meses"] },
    { label: "Alergias relatadas", keywords: ["alergia", "alérgic"] },
    { label: "Pressão arterial aferida", keywords: ["pressão", "pa ", "mmhg"] },
  ],
  acceptedCiap: [ciap],
  expectedProcedures: ["0301100039"],
  acceptedRisks: ["NON_ACUTE"],
  acceptedOutcomes: ["REFER"],
  rationale:
    "Critérios ilustrativos, sem validação clínica. O instrutor deve revisar todo o caso e ajustar risco, desfecho e códigos antes de aprovar a versão. Não constitui protocolo assistencial.",
  references: [catalogMetadata.ciap.source, catalogMetadata.sigtap.source],
});

const patient = (data: Partial<PatientFacts>): PatientFacts => ({
  name: "Pessoa fictícia",
  age: "",
  sex: "",
  birthDate: "",
  mother: "",
  chiefComplaint: "",
  history: "",
  allergies: "Não relata alergias conhecidas.",
  medications: "Não informado neste caso.",
  vitals: [],
  facts: [],
  performedProcedures: ["0301100039"],
  ...data,
});

export const demoCases: Array<{
  slug: string;
  title: string;
  description: string;
  patient: PatientFacts;
  rubric: Rubric;
}> = [
  {
    slug: "gestante",
    title: "Gestante — acolhimento inicial",
    description:
      "Caso fictício de pré-natal. Versão demonstrativa com revisão clínica pendente.",
    patient: patient({
      name: "Marina Exemplo",
      age: "28 anos",
      sex: "Feminino",
      birthDate: "1998-05-14",
      mother: "Lúcia Exemplo",
      chiefComplaint: "Estou grávida e quero começar o acompanhamento.",
      history:
        "Gestação referida de 10 semanas. Procura a unidade para iniciar o pré-natal; percebe náuseas leves há uma semana.",
      medications: "Relata uso de ácido fólico; dose não informada.",
      vitals: [
        { label: "Pressão arterial", value: "110/70 mmHg" },
        { label: "Frequência cardíaca", value: "78 bpm" },
        { label: "Temperatura", value: "36,5 °C" },
      ],
      facts: [
        {
          keywords: ["gesta", "grávida", "semanas"],
          answer:
            "Estou grávida de cerca de 10 semanas, é a minha primeira gestação.",
        },
        {
          keywords: ["náusea", "enjoo", "vomit"],
          answer: "Sinto um pouco de enjoo há uma semana. Não vomitei hoje.",
        },
        {
          keywords: ["sangra", "dor"],
          answer: "Não tive sangramento nem dor abdominal.",
        },
      ],
    }),
    rubric: rubric("W78"),
  },
  {
    slug: "hipertenso",
    title: "Pessoa com hipertensão — acompanhamento",
    description:
      "Caso fictício de acompanhamento. Versão demonstrativa com revisão clínica pendente.",
    patient: patient({
      name: "Paulo Exemplo",
      age: "56 anos",
      sex: "Masculino",
      birthDate: "1970-02-08",
      mother: "Rosa Exemplo",
      chiefComplaint: "Vim acompanhar a minha pressão.",
      history:
        "Relata diagnóstico de hipertensão há cinco anos e acompanhamento na unidade. Sem queixa aguda hoje.",
      medications:
        "Relata losartana; dose e horário não informados neste caso.",
      vitals: [
        { label: "Pressão arterial", value: "138/86 mmHg" },
        { label: "Frequência cardíaca", value: "76 bpm" },
        { label: "Temperatura", value: "36,4 °C" },
      ],
      facts: [
        {
          keywords: ["tempo", "diagnóstico", "história"],
          answer: "Soube da pressão alta há cinco anos.",
        },
        {
          keywords: ["dor", "falta de ar", "visão", "tontura"],
          answer:
            "Hoje não estou com dor, falta de ar, alteração na visão ou tontura.",
        },
        {
          keywords: ["remédio", "medica", "uso"],
          answer: "Tomo losartana. A dose não está informada neste caso.",
        },
      ],
    }),
    rubric: rubric("K86"),
  },
  {
    slug: "idoso",
    title: "Pessoa idosa — relato de cansaço",
    description:
      "Caso fictício de escuta da queixa. Versão demonstrativa com revisão clínica pendente.",
    patient: patient({
      name: "Helena Exemplo",
      age: "74 anos",
      sex: "Feminino",
      birthDate: "1952-07-22",
      mother: "Ana Exemplo",
      chiefComplaint: "Tenho me sentido cansada.",
      history:
        "Refere cansaço há duas semanas ao realizar tarefas habituais. Veio acompanhada pela filha.",
      medications:
        "Não recorda os nomes dos medicamentos; trouxe uma lista não disponível na simulação.",
      vitals: [
        { label: "Pressão arterial", value: "128/78 mmHg" },
        { label: "Frequência cardíaca", value: "80 bpm" },
        { label: "Temperatura", value: "36,6 °C" },
      ],
      facts: [
        {
          keywords: ["tempo", "começou", "cansa", "fadiga"],
          answer:
            "Comecei a me sentir cansada há duas semanas, principalmente nas tarefas de casa.",
        },
        {
          keywords: ["companhia", "acompanh", "mora", "família"],
          answer: "Minha filha veio comigo hoje. Moro com ela.",
        },
        { keywords: ["queda", "caiu"], answer: "Não caí recentemente." },
        {
          keywords: ["dor", "falta de ar"],
          answer: "Não sinto dor no peito nem falta de ar agora.",
        },
      ],
    }),
    rubric: rubric("A04"),
  },
];
