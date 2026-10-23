import type { PatientFacts, Rubric, Risk } from "../contracts";
export interface ValidationCase {
  slug: string;
  title: string;
  description: string;
  patient: PatientFacts;
  rubric: Rubric;
  review: {
    module: string;
    difficulty: "BÁSICO" | "INTERMEDIÁRIO" | "AVANÇADO";
    competencies: string[];
    redFlags: string[];
    expectedRecord: string;
    commonErrors: string[];
    questionsForReviewer: string[];
  };
}
const source =
  "https://bvsms.saude.gov.br/bvs/publicacoes/acolhimento_demanda_espontanea_queixas_comuns_cab28v2.pdf";
// Propostas educativas originais para revisão humana; referência candidata, sem atribuição de trechos.
type Seed = {
  slug: string;
  title: string;
  module: string;
  age: number;
  sex: string;
  complaint: string;
  history: string;
  answers: [string, string, string, string];
  topics: [string, string, string, string];
  vitals: string;
  medications: string;
  allergies: string;
  ciap: string;
  risk: Risk;
  flags: string;
  competency: string;
  error: string;
  question: string;
  procedures?: string[];
  birthDate?: string;
};
function build(s: Seed): ValidationCase {
  const performed = s.procedures ?? ["0301100039"];
  const facts = s.answers.map((answer, i) => ({
    keywords: s.topics[i].split("|"),
    answer,
  }));
  const patient: PatientFacts = {
    name: `Pessoa fictícia ${s.slug}`,
    age: `${s.age} anos`,
    sex: s.sex,
    birthDate: s.birthDate ?? `${2026 - s.age}-01-15`,
    mother: `Mãe fictícia de ${s.slug}`,
    chiefComplaint: s.complaint,
    history: `Atendimento em 21/10/2026. ${s.history}`,
    allergies: s.allergies,
    medications: s.medications,
    vitals: s.vitals.split(";").map((x) => {
      const [label, ...value] = x.split("=");
      return { label, value: value.join("=") };
    }),
    facts,
    performedProcedures: performed,
  };
  return {
    slug: s.slug,
    title: s.title,
    description: `Simulação fictícia de acolhimento na UBS em 21/10/2026: ${s.complaint.toLowerCase()}.`,
    patient,
    rubric: {
      requiredTopics: s.topics.map((x, i) => ({
        label: x.split("|")[0],
        keywords: x.split("|"),
      })),
      acceptedCiap: [s.ciap],
      expectedProcedures: [...performed],
      acceptedRisks: [s.risk],
      acceptedOutcomes: [
        s.risk === "NON_ACUTE" || s.risk === "LOW" ? "RELEASE" : "REFER",
      ],
      rationale: `Proposta para discussão: ${s.competency}. ${s.flags}. O técnico reconhece, registra e comunica os achados; a classificação formal cabe ao enfermeiro. Risco e desfecho sugeridos dependem da validação do responsável e do fluxo local.`,
      references: [source],
    },
    review: {
      module: s.module,
      difficulty:
        s.risk === "HIGH"
          ? "AVANÇADO"
          : s.risk === "MEDIUM"
            ? "INTERMEDIÁRIO"
            : "BÁSICO",
      competencies: [
        s.competency,
        "Distinguir fatos relatados de medidas atuais e de ações ainda não realizadas",
      ],
      redFlags: [s.flags],
      expectedRecord: `21/10/2026. ${s.complaint}. ${s.history} Relatos na entrevista: ${s.answers.join(" ")} Medicações: ${s.medications}. Alergias: ${s.allergies}. Medidas de hoje: ${s.vitals.replaceAll(";", "; ")}. Procedimentos realizados: ${performed.length ? performed.join(", ") : "nenhum dos procedimentos do catálogo"}.`,
      commonErrors: [
        s.error,
        "Registrar como concluído um encaminhamento que não consta no cenário",
      ],
      questionsForReviewer: [
        s.question,
        "A proposta de risco e desfecho é adequada ao fluxo e às atribuições da equipe local?",
      ],
    },
  };
}
const seeds: Seed[] = [
  {
    slug: "01-cefaleia-rotina",
    title: "Dor de cabeça ao final do turno",
    module: "Neurológico e cardiovascular",
    age: 34,
    sex: "Feminino",
    complaint: "Dor de cabeça desde ontem",
    history:
      "Dor gradual às 18h de ontem, semelhante a episódios mensais há um ano; chegou caminhando às 09h. Nenhum atendimento realizado antes da entrevista.",
    answers: [
      "Começou devagar ontem depois do trabalho.",
      "É igual às outras vezes, intensidade quatro de dez.",
      "Não tive desmaio, alteração da fala nem fraqueza.",
      "Durmo cerca de cinco horas por noite nesta semana.",
    ],
    topics: [
      "início|ontem",
      "padrão|habitual",
      "sinais associados|fraqueza",
      "sono|dormir",
    ],
    vitals: "PA atual=118/76 mmHg;Temperatura atual=36,6 °C;FC atual=76 bpm",
    medications:
      "Não usa medicação habitual; não tomou analgésico neste episódio",
    allergies: "Nega alergias conhecidas",
    ciap: "N01",
    risk: "LOW",
    flags: "Investigar mudança do padrão e sintomas neurológicos",
    competency: "Descrever padrão, intensidade e início da cefaleia",
    error: "Omitir comparação com episódios anteriores",
    question:
      "O registro permite distinguir episódio habitual de mudança recente? ",
  },
  {
    slug: "02-cefaleia-subita",
    title: "Dor de cabeça iniciada pela manhã",
    module: "Neurológico e cardiovascular",
    age: 48,
    sex: "Masculino",
    complaint: "Dor de cabeça forte há quarenta minutos",
    history:
      "Às 08h20 iniciou dor abrupta durante atividade doméstica, máxima no primeiro minuto; chegou acompanhado às 09h, antes de avaliação clínica.",
    answers: [
      "A dor apareceu de uma vez às oito e vinte.",
      "Foi a pior que já senti, dez de dez.",
      "Vomitei uma vez e estou incomodado com a luz.",
      "Não tive queda e não uso anticoagulante.",
    ],
    topics: [
      "início|súbita",
      "intensidade|pior",
      "vômito|luz",
      "trauma|anticoagulante",
    ],
    vitals: "PA atual=172/100 mmHg;FC atual=96 bpm;Temperatura atual=36,7 °C",
    medications: "Losartana habitual; dose não informada",
    allergies: "Não informadas",
    ciap: "N01",
    risk: "HIGH",
    flags: "Início abrupto com intensidade máxima em um minuto e vômito",
    competency:
      "Reconhecer apresentação temporal que exige comunicação imediata ao enfermeiro",
    error: "Atribuir a dor apenas à pressão arterial",
    question: "A cronologia e a intensidade justificam a prioridade proposta?",
  },
  {
    slug: "03-peito",
    title: "Desconforto no peito no caminho da UBS",
    module: "Neurológico e cardiovascular",
    age: 59,
    sex: "Masculino",
    complaint: "Aperto no peito há trinta minutos",
    history:
      "Começou às 08h30 ao caminhar; persistia às 09h mesmo sentado. Esposa o acompanhou. Não houve encaminhamento ou medicação na UBS até esta entrevista.",
    answers: [
      "Sinto um aperto no meio do peito desde a caminhada.",
      "A dor vai para o braço esquerdo.",
      "Estou com suor frio e enjoo.",
      "Tenho diabetes e meu pai teve infarto.",
    ],
    topics: [
      "início|esforço",
      "irradiação|braço",
      "suor|náusea",
      "antecedentes|diabetes",
    ],
    vitals:
      "PA atual=148/92 mmHg;FC atual=108 bpm;SpO2 atual=95% em ar ambiente",
    medications: "Metformina habitual; dose não informada",
    allergies: "Nega alergias conhecidas",
    ciap: "A11",
    risk: "HIGH",
    flags: "Dor persistente com irradiação e manifestações autonômicas",
    competency:
      "Documentar características da dor torácica e comunicar a equipe sem aguardar diagnóstico",
    error: "Classificar como ansiedade antes da avaliação",
    question: "O motivo de prioridade está explícito sem afirmar diagnóstico?",
  },
  {
    slug: "04-fala",
    title: "Mudança na fala percebida em casa",
    module: "Neurológico e cardiovascular",
    age: 67,
    sex: "Feminino",
    complaint: "Fala diferente e braço fraco",
    history:
      "Filha informa última vez sem alteração às 07h10 e início percebido às 07h30; chegada às 08h05, consciente, antes de avaliação do enfermeiro.",
    answers: [
      "Eu estava bem quando tomei café às sete e dez.",
      "Minha fala ficou enrolada às sete e meia.",
      "Meu braço direito ficou fraco junto com a fala.",
      "Não caí e não perdi a consciência.",
    ],
    topics: [
      "última vez bem|horário",
      "fala|enrolada",
      "lateralidade|direito",
      "consciência|queda",
    ],
    vitals: "PA atual=182/104 mmHg;Glicemia atual=112 mg/dL;FC atual=88 bpm",
    procedures: ["0301100039", "0214010015"],
    medications: "Losartana habitual; dose não informada",
    allergies: "Não informadas",
    ciap: "N18",
    risk: "HIGH",
    flags: "Alteração focal de instalação recente com horário conhecido",
    competency:
      "Registrar última vez sem sintomas, lateralidade e comunicação urgente",
    error: "Perder o horário de início no registro",
    question: "Devemos aceitar também N19 para a queixa principal deste caso?",
  },
  {
    slug: "05-acompanhamento-pa",
    title: "Visita para acompanhamento na UBS",
    module: "Neurológico e cardiovascular",
    age: 56,
    sex: "Feminino",
    complaint: "Veio acompanhar pressão arterial",
    history:
      "Hipertensão previamente diagnosticada; retorno combinado para hoje às 10h. Refere PA domiciliar de 150/90 há uma semana, sem comprovante. Medida atual realizada após repouso.",
    answers: [
      "Vim para meu acompanhamento combinado.",
      "Tomo a losartana todos os dias, mas não lembro a dose.",
      "Não estou com dor nem falta de ar.",
      "Medi em casa semana passada e deu quinze por nove.",
    ],
    topics: [
      "motivo|retorno",
      "adesão|losartana",
      "sintomas|dispneia",
      "medida histórica|domicílio",
    ],
    vitals: "PA atual após repouso=132/82 mmHg;FC atual=72 bpm",
    medications: "Losartana habitual; dose não informada",
    allergies: "Nega alergias conhecidas",
    ciap: "K86",
    risk: "NON_ACUTE",
    flags: "Diferenciar acompanhamento assintomático de sintomas novos",
    competency: "Separar valor domiciliar relatado da aferição atual",
    error: "Registrar 150/90 como medida da UBS",
    question:
      "O uso de K86 se sustenta pelo diagnóstico previamente informado?",
  },
  {
    slug: "06-pa-sintomas",
    title: "Mal-estar ao chegar do trabalho",
    module: "Neurológico e cardiovascular",
    age: 52,
    sex: "Masculino",
    complaint: "Dor de cabeça e visão borrada desde as 07h",
    history:
      "Chegou às 09h com sintomas persistentes. PA aferida e repetida após cinco minutos sentado, sem avaliação formal de risco até a entrevista.",
    answers: [
      "A dor e a visão borrada começaram às sete.",
      "Esqueci meu remédio nos últimos três dias.",
      "A visão continua borrada agora.",
      "Não estou com dor no peito nem falta de ar.",
    ],
    topics: [
      "início|horário",
      "adesão|esqueceu",
      "visual|visão",
      "associados|peito",
    ],
    vitals:
      "PA atual inicial=204/116 mmHg;PA atual repetida=200/114 mmHg;FC atual=94 bpm",
    medications:
      "Losartana habitual interrompida há três dias; dose não informada",
    allergies: "Não informadas",
    ciap: "N01",
    risk: "HIGH",
    flags: "Pressão muito elevada com alteração visual persistente",
    competency:
      "Associar aferição repetida aos sintomas e comunicar imediatamente",
    error: "Recomendar dose extra por iniciativa própria",
    question: "Como registrar os sintomas sem concluir lesão de órgão-alvo?",
  },
  {
    slug: "07-suor",
    title: "Sudorese durante a espera",
    module: "Neurológico e cardiovascular",
    age: 61,
    sex: "Feminino",
    complaint: "Tremor e suor há quinze minutos",
    history:
      "Diabetes conhecido. Estava na UBS às 08h quando surgiram sintomas; glicemia capilar medida antes de qualquer intervenção, ainda consciente e responsiva.",
    answers: [
      "Usei minha insulina habitual hoje cedo.",
      "Saí sem tomar café da manhã.",
      "Comecei a tremer e suar enquanto esperava.",
      "Ainda consigo falar, mas estou muito fraca.",
    ],
    topics: [
      "medicação|insulina",
      "alimentação|jejum",
      "início|tremor",
      "consciência|fraqueza",
    ],
    vitals: "Glicemia atual=49 mg/dL;PA atual=110/70 mmHg;FC atual=102 bpm",
    procedures: ["0301100039", "0214010015"],
    medications: "Insulina NPH habitual; dose não informada",
    allergies: "Nega alergias conhecidas",
    ciap: "T87",
    risk: "HIGH",
    flags: "Glicemia baixa acompanhada de sintomas atuais",
    competency:
      "Registrar valor, horário relativo e ingestão alimentar e acionar enfermeiro",
    error: "Registrar melhora ou correção que ainda não ocorreram",
    question:
      "O registro descreve o estado de consciência sem presumir segurança para ingestão?",
  },
  {
    slug: "08-sede",
    title: "Sede e idas frequentes ao banheiro",
    module: "Neurológico e cardiovascular",
    age: 46,
    sex: "Masculino",
    complaint: "Muita sede há cinco dias",
    history:
      "Diabetes conhecido; chegou às 11h após cinco dias de sede e poliúria, hoje com náusea. Glicemia medida na UBS antes de avaliação clínica.",
    answers: [
      "Tenho bebido água o tempo todo há cinco dias.",
      "Levanto quatro vezes por noite para urinar.",
      "Fiquei sem a metformina há duas semanas.",
      "Hoje estou enjoado, mas não vomitei.",
    ],
    topics: [
      "sede|duração",
      "urina|noite",
      "acesso|medicação",
      "náusea|vômito",
    ],
    vitals:
      "Glicemia atual=356 mg/dL;PA atual=108/68 mmHg;FC atual=104 bpm;FR atual=22 irpm",
    procedures: ["0301100039", "0214010015"],
    medications:
      "Metformina habitual indisponível há duas semanas; dose não informada",
    allergies: "Não informadas",
    ciap: "T01",
    risk: "MEDIUM",
    flags: "Hiperglicemia sintomática com náusea e taquicardia",
    competency:
      "Relacionar sintomas, interrupção e medida sem diagnosticar descompensação específica",
    error: "Confundir glicemia capilar com diagnóstico laboratorial definitivo",
    question: "Quais achados mudariam a prioridade durante a espera?",
  },
  {
    slug: "09-respiracao",
    title: "Cansaço para respirar desde a madrugada",
    module: "Respiratório",
    age: 63,
    sex: "Feminino",
    complaint: "Falta de ar desde as 04h",
    history:
      "Dispneia progressiva desde madrugada; chegou acompanhada às 08h, fala frases curtas e permanece sentada. Não recebeu nebulização até a entrevista.",
    answers: [
      "Começou de madrugada e está piorando.",
      "Tenho que parar para respirar quando falo.",
      "Tenho asma diagnosticada há anos.",
      "Usei meu inalador habitual e não percebi melhora.",
    ],
    topics: [
      "evolução|madrugada",
      "fala|frases",
      "antecedente|asma",
      "uso prévio|inalador",
    ],
    vitals:
      "SpO2 atual=89% em ar ambiente;FR atual=32 irpm;FC atual=118 bpm;PA atual=138/86 mmHg",
    medications:
      "Budesonida e salbutamol inalatórios habituais; doses não informadas",
    allergies: "Nega alergias conhecidas",
    ciap: "R02",
    risk: "HIGH",
    flags: "Baixa saturação, taquipneia e limitação da fala",
    competency:
      "Registrar sinais respiratórios observados e comunicar prioridade",
    error: "Lançar nebulização não realizada",
    question:
      "O cenário oferece elementos suficientes para comunicação imediata?",
  },
  {
    slug: "10-tosse-recente",
    title: "Tosse após contato familiar",
    module: "Respiratório",
    age: 29,
    sex: "Masculino",
    complaint: "Tosse há três dias",
    history:
      "Tosse seca começou em 18/10 após familiar com resfriado; chega caminhando às 14h, conversa em frases completas e sem avaliação clínica prévia hoje.",
    answers: [
      "Tossi pela primeira vez há três dias.",
      "Meu filho estava resfriado na semana passada.",
      "Não sinto falta de ar nem dor no peito.",
      "Consegui comer e beber normalmente hoje.",
    ],
    topics: [
      "duração|três dias",
      "contato|família",
      "associados|dispneia",
      "ingestão|água",
    ],
    vitals:
      "PA atual=116/74 mmHg;Temperatura atual=37,1 °C;SpO2 atual=98% em ar ambiente;FR atual=16 irpm",
    medications:
      "Não usa medicação habitual; não tomou remédio para este episódio",
    allergies: "Nega alergias conhecidas",
    ciap: "R05",
    risk: "LOW",
    flags: "Reavaliar surgimento de dispneia ou deterioração",
    competency:
      "Descrever duração e repercussão da tosse sem afirmar etiologia",
    error: "Registrar infecção bacteriana sem evidência",
    question:
      "Os dados negativos foram efetivamente perguntados e limitados ao relato?",
  },
];
seeds.push(
  {
    slug: "11-tosse-semanas",
    title: "Tosse que persiste há semanas",
    module: "Respiratório",
    age: 42,
    sex: "Masculino",
    complaint: "Tosse há cinco semanas",
    history:
      "Início em 16/09, sem consulta anterior; hoje chegou às 09h por persistência e perda de peso referida, não medida em comparação.",
    answers: [
      "Estou tossindo todos os dias há cinco semanas.",
      "Minha roupa ficou larga e acho que emagreci.",
      "Tenho suado à noite nesta última semana.",
      "Moro com outras cinco pessoas em dois cômodos.",
    ],
    topics: [
      "duração|semanas",
      "peso|emagreceu",
      "suor noturno|noite",
      "moradia|contatos",
    ],
    vitals:
      "PA atual=112/72 mmHg;Temperatura atual=37,3 °C;SpO2 atual=97% em ar ambiente",
    medications: "Não usa medicação habitual",
    allergies: "Não informadas",
    ciap: "R05",
    risk: "MEDIUM",
    flags: "Tosse prolongada com sintomas constitucionais e conviventes",
    competency:
      "Registrar duração e contexto de transmissão para comunicação à equipe",
    error: "Firmar tuberculose antes de investigação",
    question:
      "Como registrar perda de peso subjetiva sem convertê-la em medida?",
  },
  {
    slug: "12-garganta",
    title: "Incômodo na garganta ao engolir",
    module: "Respiratório",
    age: 23,
    sex: "Feminino",
    complaint: "Dor de garganta há dois dias",
    history:
      "Dor começou em 19/10 à noite; comparece às 13h, conversando normalmente. Nenhum exame da orofaringe foi realizado neste cenário.",
    answers: [
      "Minha garganta dói há dois dias.",
      "Consigo engolir água e comida, apesar da dor.",
      "Não tive falta de ar nem dificuldade para abrir a boca.",
      "Não usei antibiótico e ninguém examinou minha garganta hoje.",
    ],
    topics: [
      "duração|dois dias",
      "deglutição|água",
      "sinais associados|boca",
      "avaliação prévia|antibiótico",
    ],
    vitals: "PA atual=108/70 mmHg;Temperatura atual=37,4 °C;FC atual=82 bpm",
    medications: "Não usa medicação habitual",
    allergies:
      "Relata alergia à amoxicilina, com placas na pele em uso anterior",
    ciap: "R21",
    risk: "LOW",
    flags:
      "Investigar comprometimento da deglutição ou respiração se houver mudança",
    competency:
      "Distinguir relato de dor de achado de exame ainda não realizado",
    error: "Inventar placas ou prescrever antibiótico",
    question: "A alergia relatada está descrita sem extrapolar a reação?",
  },
  {
    slug: "13-crianca-febre",
    title: "Criança com febre desde ontem",
    module: "Infância",
    age: 4,
    sex: "Feminino",
    complaint: "Febre desde a noite anterior",
    history:
      "Cuidadora informa início às 20h de 20/10. Às 09h de hoje criança está alerta, interage e aceita água; temperatura aferida na UBS.",
    answers: [
      "Sou a mãe e medi trinta e oito graus ontem à noite.",
      "Ela bebeu água e urinou hoje cedo.",
      "Não vi manchas, convulsão ou dificuldade para respirar.",
      "Ela brinca entre os momentos em que fica mais quente.",
    ],
    topics: [
      "início|febre",
      "hidratação|urina",
      "associados|convulsão",
      "comportamento|brinca",
    ],
    vitals:
      "Temperatura atual=38,1 °C;FC atual=112 bpm;FR atual=24 irpm;SpO2 atual=98% em ar ambiente",
    procedures: [],
    medications: "Cuidadora nega medicação habitual e medicação neste episódio",
    allergies: "Cuidadora nega alergias conhecidas",
    ciap: "A03",
    risk: "LOW",
    flags: "Observar alteração do estado geral, hidratação e respiração",
    competency: "Identificar fonte do relato e repercussão da febre na criança",
    error: "Usar limiares de frequência cardíaca de adulto sem contexto etário",
    question:
      "A prioridade proposta é compatível com a avaliação pediátrica local?",
  },
  {
    slug: "14-lactente-febre",
    title: "Bebê com temperatura elevada em casa",
    module: "Infância",
    age: 0,
    sex: "Masculino",
    birthDate: "2026-08-31",
    complaint: "Febre em bebê de 51 dias",
    history:
      "Mãe mediu 38,2 °C às 06h e trouxe às 07h30. Bebê com 51 dias completos em 21/10/2026, menos ativo que o habitual.",
    answers: [
      "Sou a mãe e ele tem cinquenta e um dias.",
      "A temperatura foi trinta e oito vírgula dois às seis.",
      "Mamou menos em duas mamadas desde a madrugada.",
      "Troquei só uma fralda molhada desde meia-noite.",
    ],
    topics: [
      "idade|dias",
      "temperatura|horário",
      "mamada|menos",
      "diurese|fralda",
    ],
    vitals:
      "Temperatura atual=38,0 °C;FC atual=166 bpm;FR atual=48 irpm;SpO2 atual=96% em ar ambiente",
    procedures: [],
    medications:
      "Mãe relata apenas suplemento habitual de vitamina D; dose não informada",
    allergies: "Mãe não conhece alergias",
    ciap: "A03",
    risk: "HIGH",
    flags: "Febre em lactente jovem com menor ingestão e atividade",
    competency:
      "Registrar idade em dias e mudança de alimentação e comportamento",
    error:
      "Tratar febre de lactente jovem como episódio banal de criança maior",
    question:
      "A idade e a menor aceitação alimentar sustentam a comunicação prioritária?",
  },
  {
    slug: "15-diarreia-infantil",
    title: "Evacuações frequentes desde ontem",
    module: "Infância",
    age: 2,
    sex: "Masculino",
    complaint: "Diarreia desde ontem de manhã",
    history:
      "Pai relata início em 20/10 às 08h e seis evacuações líquidas até hoje às 08h; criança alerta, procura água, sem procedimento realizado.",
    answers: [
      "Sou o pai e contei seis evacuações líquidas desde ontem.",
      "Não vi sangue nas fezes.",
      "Ele aceitou água, mas comeu menos.",
      "A última fralda com urina foi há quatro horas.",
    ],
    topics: [
      "frequência|evacuação",
      "sangue|fezes",
      "ingestão|água",
      "diurese|horas",
    ],
    vitals:
      "Temperatura atual=37,2 °C;FC atual=118 bpm;FR atual=26 irpm;Peso atual=12 kg",
    procedures: [],
    medications: "Pai nega medicação habitual e neste episódio",
    allergies: "Pai não sabe informar",
    ciap: "D11",
    risk: "MEDIUM",
    flags:
      "Perdas digestivas e ingestão reduzida requerem avaliação da hidratação",
    competency: "Quantificar perdas e identificar última diurese",
    error: "Afirmar ausência de desidratação sem avaliação",
    question:
      "Que achados adicionais o enfermeiro precisa avaliar para definir prioridade?",
  },
  {
    slug: "16-chiado",
    title: "Criança com respiração ruidosa",
    module: "Infância",
    age: 6,
    sex: "Feminino",
    complaint: "Chiado e cansaço desde a madrugada",
    history:
      "Início às 03h, piora até chegada às 08h; retração subcostal observada e fala entrecortada. Não houve nebulização na UBS.",
    answers: [
      "Sou a mãe e ela começou a chiar às três da manhã.",
      "Ela precisou parar de brincar por cansaço.",
      "Já teve episódios parecidos e tem asma diagnosticada.",
      "Usei o inalador prescrito em casa, sem melhora percebida.",
    ],
    topics: [
      "início|madrugada",
      "repercussão|brincar",
      "antecedente|asma",
      "medicação prévia|inalador",
    ],
    vitals:
      "SpO2 atual=91% em ar ambiente;FR atual=38 irpm;FC atual=132 bpm;Temperatura atual=37,1 °C",
    procedures: [],
    medications:
      "Salbutamol inalatório previamente prescrito; dose e horário exato não informados",
    allergies: "Mãe nega alergias conhecidas",
    ciap: "R03",
    risk: "HIGH",
    flags: "Retração, baixa saturação e limitação da fala",
    competency: "Associar sinais observados ao relato do cuidador",
    error: "Registrar nebulização como realizada por ser procedimento provável",
    question:
      "A documentação distingue inalador em casa de procedimentos da UBS?",
  },
  {
    slug: "17-urina",
    title: "Ardor ao urinar desde ontem",
    module: "Urinário, digestivo e febril",
    age: 31,
    sex: "Feminino",
    complaint: "Ardor e vontade frequente de urinar",
    history:
      "Início em 20/10 ao acordar; chegou às 10h de hoje, andando e conversando. Sem coleta de urina ou exame físico no cenário.",
    answers: [
      "Começou ontem de manhã e arde toda vez que urino.",
      "Vou ao banheiro mais vezes e sai pouco.",
      "Não tive febre, vômito nem dor nas costas.",
      "Minha última menstruação começou em cinco de outubro e não sei se posso estar grávida.",
    ],
    topics: [
      "início|ardor",
      "frequência|pouco",
      "associados|lombar",
      "gestação|menstruação",
    ],
    vitals: "PA atual=112/70 mmHg;Temperatura atual=36,8 °C;FC atual=80 bpm",
    medications: "Não usa medicação habitual",
    allergies: "Relata urticária após sulfonamida em uso anterior",
    ciap: "U01",
    risk: "LOW",
    flags: "Investigar possibilidade de gestação e sintomas sistêmicos",
    competency:
      "Registrar sintomas urinários e incerteza gestacional sem diagnóstico presumido",
    error: "Declarar teste de gravidez negativo inexistente",
    question: "Quais dados mudariam o desfecho proposto no fluxo local?",
  },
  {
    slug: "18-urina-febre",
    title: "Ardor urinário com mal-estar",
    module: "Urinário, digestivo e febril",
    age: 39,
    sex: "Feminino",
    complaint: "Ardor urinário há três dias e febre desde ontem",
    history:
      "Sintomas urinários desde 18/10; febre e dor lombar direita em 20/10 à noite, dois vômitos hoje antes de chegar às 09h.",
    answers: [
      "Arde para urinar há três dias.",
      "Ontem à noite vieram febre e calafrios.",
      "A dor é nas costas do lado direito.",
      "Vomitei duas vezes e hoje quase não bebi água.",
    ],
    topics: [
      "urinário|duração",
      "febre|calafrios",
      "lombar|direita",
      "vômito|ingestão",
    ],
    vitals:
      "PA atual=100/64 mmHg;Temperatura atual=38,7 °C;FC atual=116 bpm;FR atual=22 irpm",
    medications: "Não usa medicação habitual",
    allergies: "Não informadas",
    ciap: "U01",
    risk: "HIGH",
    flags: "Febre, dor lombar, vômitos e taquicardia com baixa ingestão",
    competency:
      "Reconhecer associação de sintomas locais e sistêmicos para comunicação prioritária",
    error: "Registrar apenas disúria e omitir sinais sistêmicos",
    question: "A justificativa descreve gravidade sem firmar etiologia?",
  },
  {
    slug: "19-intestino",
    title: "Mudança no ritmo intestinal",
    module: "Urinário, digestivo e febril",
    age: 45,
    sex: "Masculino",
    complaint: "Fezes endurecidas há uma semana",
    history:
      "Última evacuação há dois dias, após esforço; segue eliminando gases, sem dor atual. Chegou às 14h para escuta inicial.",
    answers: [
      "Há uma semana as fezes estão duras.",
      "Evacuei pouco anteontem e preciso fazer força.",
      "Solto gases e não vomitei.",
      "Bebo pouca água e comecei a trabalhar sentado há um mês.",
    ],
    topics: [
      "duração|fezes",
      "última evacuação|esforço",
      "gases|vômito",
      "hábitos|água",
    ],
    vitals: "PA atual=124/78 mmHg;Temperatura atual=36,5 °C;FC atual=74 bpm",
    medications: "Não usa medicação habitual nem laxantes",
    allergies: "Nega alergias conhecidas",
    ciap: "D12",
    risk: "LOW",
    flags:
      "Investigar dor intensa, vômitos e interrupção de gases se houver evolução",
    competency:
      "Caracterizar hábito intestinal e repercussão sem prescrever laxantes",
    error: "Confundir constipação relatada com obstrução confirmada",
    question:
      "O registro discrimina evacuação reduzida de ausência completa de eliminação?",
  },
  {
    slug: "20-abdome",
    title: "Dor na barriga com piora progressiva",
    module: "Urinário, digestivo e febril",
    age: 27,
    sex: "Masculino",
    complaint: "Dor abdominal desde ontem à noite",
    history:
      "Dor iniciou às 21h de 20/10 em volta do umbigo; desde 05h concentra-se à direita inferior, piora ao andar; chegou às 08h30 sem exame abdominal realizado.",
    answers: [
      "Começou perto do umbigo às nove da noite.",
      "Agora dói mais embaixo do lado direito.",
      "Vomitei uma vez e não quis comer hoje.",
      "Caminhar e tossir aumentam a dor.",
    ],
    topics: [
      "início|umbigo",
      "localização|direito",
      "vômito|apetite",
      "agravantes|caminhar",
    ],
    vitals: "PA atual=112/72 mmHg;Temperatura atual=38,0 °C;FC atual=106 bpm",
    medications: "Não usa medicação habitual; não tomou remédio hoje",
    allergies: "Não informadas",
    ciap: "D01",
    risk: "MEDIUM",
    flags: "Dor progressiva localizada, febre e vômito",
    competency:
      "Registrar migração e evolução da dor sem inventar achados de palpação",
    error: "Descrever sinal de exame que não foi pesquisado",
    question:
      "A prioridade deve subir conforme avaliação abdominal e estado geral?",
  },
);
seeds.push(
  {
    slug: "21-febre-corpo",
    title: "Febre e dores pelo corpo",
    module: "Urinário, digestivo e febril",
    age: 33,
    sex: "Feminino",
    complaint: "Febre e dores no corpo há dois dias",
    history:
      "Início em 19/10 às 18h; chegou às 09h, alerta e andando. Refere vizinhos com doença febril, sem resultado de exame ou diagnóstico neste episódio.",
    answers: [
      "A febre começou anteontem à noite.",
      "Dói o corpo e atrás dos olhos.",
      "Tenho bebido água e urinei hoje cedo.",
      "Não tive dor forte na barriga, sangramento nem vômitos.",
    ],
    topics: [
      "início|febre",
      "dor|olhos",
      "hidratação|urina",
      "sinais associados|sangramento",
    ],
    vitals: "PA atual=114/74 mmHg;Temperatura atual=38,2 °C;FC atual=96 bpm",
    medications: "Não usa medicação habitual; não tomou medicação hoje",
    allergies: "Nega alergias conhecidas",
    ciap: "A03",
    risk: "LOW",
    flags:
      "Acompanhar evolução e investigar sinais de agravamento em doença febril",
    competency: "Descrever síndrome febril e contexto sem confirmar dengue",
    error: "Transformar suspeita epidemiológica em diagnóstico fechado",
    question:
      "A classificação proposta depende de quais dados ainda não coletados?",
  },
  {
    slug: "22-retorno-febre",
    title: "Retorno após dias de febre",
    module: "Urinário, digestivo e febril",
    age: 37,
    sex: "Masculino",
    complaint: "Dor na barriga e vômitos após dias de febre",
    history:
      "Febre de 17 a 20/10; ontem foi orientado em consulta a retornar se piorasse. Hoje às 06h febre cedeu e surgiram dor abdominal contínua e quatro vômitos; voltou às 08h.",
    answers: [
      "Tive febre por quatro dias e hoje ela baixou.",
      "Minha barriga passou a doer sem parar às seis.",
      "Vomitei quatro vezes e não consigo manter água.",
      "Estou mais tonto quando tento ficar em pé.",
    ],
    topics: [
      "cronologia|defervescência",
      "dor|contínua",
      "vômitos|água",
      "tontura|posição",
    ],
    vitals:
      "PA atual=94/60 mmHg;Temperatura atual=36,8 °C;FC atual=120 bpm;FR atual=24 irpm",
    medications:
      "Não usa medicação habitual; relata paracetamol ontem, dose não informada",
    allergies: "Não informadas",
    ciap: "D01",
    risk: "HIGH",
    flags: "Dor contínua, vômitos e tontura após redução da febre",
    competency:
      "Relacionar mudança da fase febril aos novos sintomas e comunicar imediatamente",
    error: "Interpretar desaparecimento da febre como melhora suficiente",
    question:
      "O registro deixa claro que a etiologia febril não está confirmada?",
  },
  {
    slug: "23-pre-natal",
    title: "Visita programada durante a gestação",
    module: "Saúde sexual, gestação e puerpério",
    age: 26,
    sex: "Feminino",
    complaint: "Veio para consulta de pré-natal",
    history:
      "Gestante com 24 semanas conforme cartão apresentado, consulta agendada para 10h. Refere avaliação anterior em 23/09; hoje sem queixa aguda.",
    answers: [
      "Vim ao pré-natal marcado e trouxe meu cartão.",
      "Estou com vinte e quatro semanas pelo cartão.",
      "Sinto o bebê mexer como de costume.",
      "Não tive sangramento, perda de líquido nem dor de cabeça.",
    ],
    topics: [
      "agenda|cartão",
      "idade gestacional|semanas",
      "movimentos|bebê",
      "sinais associados|sangramento",
    ],
    vitals: "PA atual=108/68 mmHg;Temperatura atual=36,6 °C;Peso atual=64 kg",
    medications:
      "Sulfato ferroso habitual prescrito no pré-natal; dose não informada",
    allergies: "Nega alergias conhecidas",
    ciap: "W78",
    risk: "NON_ACUTE",
    flags: "Manter investigação de sintomas novos durante a gestação",
    competency: "Distinguir dado do cartão, relato materno e medida atual",
    error: "Afirmar ausculta fetal ou exame obstétrico não realizados",
    question:
      "O acolhimento contém informação suficiente para continuidade da consulta?",
  },
  {
    slug: "24-gestacao-sangramento",
    title: "Sangramento percebido pela manhã",
    module: "Saúde sexual, gestação e puerpério",
    age: 30,
    sex: "Feminino",
    complaint: "Sangramento vaginal nesta manhã",
    history:
      "Gravidez de 30 semanas conforme cartão; às 07h observou sangue vermelho, molhando um absorvente em uma hora. Chegou acompanhada às 08h15, antes de avaliação obstétrica.",
    answers: [
      "Estou com trinta semanas pelo cartão.",
      "O sangue vermelho começou às sete horas.",
      "Molhei um absorvente em cerca de uma hora.",
      "Senti tontura e hoje percebi menos movimentos do bebê.",
    ],
    topics: [
      "gestação|semanas",
      "início|sangramento",
      "quantidade|absorvente",
      "associados|movimentos",
    ],
    vitals: "PA atual=98/62 mmHg;FC atual=112 bpm;Temperatura atual=36,7 °C",
    medications: "Sulfato ferroso habitual; dose não informada",
    allergies: "Não informadas",
    ciap: "W03",
    risk: "HIGH",
    flags:
      "Sangramento gestacional com tontura e redução referida de movimentos",
    competency:
      "Quantificar sangramento por relato sem inferir volume ou causa",
    error: "Afirmar bem-estar fetal sem avaliação",
    question:
      "A quantidade está documentada com unidade compreensível sem falsa precisão?",
  },
  {
    slug: "25-gestacao-cabeca",
    title: "Dor de cabeça durante a gestação",
    module: "Saúde sexual, gestação e puerpério",
    age: 32,
    sex: "Feminino",
    complaint: "Dor de cabeça e pontos luminosos desde cedo",
    history:
      "Gestante com 34 semanas pelo cartão. Dor começou às 05h e persiste às 08h; PA aferida na UBS. Última PA no cartão, em 07/10, era 118/76.",
    answers: [
      "Estou com trinta e quatro semanas.",
      "A cabeça dói forte desde as cinco e vejo luzinhas.",
      "Também dói aqui na parte alta da barriga.",
      "No último pré-natal a pressão estava boa pelo cartão.",
    ],
    topics: [
      "gestação|semanas",
      "visual|luz",
      "dor epigástrica|barriga",
      "histórico|cartão",
    ],
    vitals: "PA atual=166/110 mmHg;FC atual=98 bpm;Temperatura atual=36,6 °C",
    medications: "Sulfato ferroso habitual; dose não informada",
    allergies: "Nega alergias conhecidas",
    ciap: "N01",
    risk: "HIGH",
    flags:
      "Cefaleia, sintomas visuais e dor alta abdominal com PA elevada na gestação",
    competency: "Comunicar conjunto de sinais e separar PA histórica da atual",
    error: "Registrar diagnóstico obstétrico definitivo pelo acolhimento",
    question: "A informação histórica está adequadamente atribuída ao cartão?",
  },
  {
    slug: "26-pos-parto",
    title: "Mal-estar na primeira semana após o parto",
    module: "Saúde sexual, gestação e puerpério",
    age: 24,
    sex: "Feminino",
    complaint: "Febre e dor baixa na barriga após o parto",
    history:
      "Parto vaginal em 14/10; alta em 16/10. Desde 20/10 à noite apresenta febre, dor pélvica e mudança do odor da secreção; chegou às 09h com acompanhante.",
    answers: [
      "Meu parto foi há sete dias.",
      "A febre começou ontem à noite com calafrios.",
      "Tenho dor no pé da barriga e a secreção está com cheiro diferente.",
      "Estou amamentando, mas me sinto fraca desde ontem.",
    ],
    topics: [
      "parto|dias",
      "febre|calafrios",
      "secreção|dor",
      "amamentação|fraqueza",
    ],
    vitals:
      "PA atual=102/66 mmHg;Temperatura atual=38,8 °C;FC atual=118 bpm;FR atual=22 irpm",
    medications: "Sulfato ferroso prescrito na alta; dose não informada",
    allergies: "Não informadas",
    ciap: "W18",
    risk: "HIGH",
    flags:
      "Febre puerperal com dor pélvica, alteração de secreção e taquicardia",
    competency:
      "Registrar intervalo após parto e manifestações atuais para avaliação prioritária",
    error: "Considerar febre esperada do puerpério sem avaliar",
    question:
      "O registro evita atribuir origem infecciosa específica antes de exame?",
  },
  {
    slug: "27-queda",
    title: "Queda ao levantar de manhã",
    module: "Pessoa idosa e cuidado da pele",
    age: 76,
    sex: "Feminino",
    complaint: "Dor no quadril após queda",
    history:
      "Caiu em casa às 07h, ao levantar da cama; chegou às 09h em cadeira de rodas por dificuldade de apoiar a perna esquerda. Não houve exame de imagem nem mobilização terapêutica.",
    answers: [
      "Levantei às sete e caí ao lado da cama.",
      "Dói meu quadril esquerdo e não consigo apoiar bem.",
      "Não bati a cabeça nem perdi a consciência.",
      "Uso um remédio para afinar o sangue, mas não lembro o nome.",
    ],
    topics: [
      "mecanismo|queda",
      "apoio|quadril",
      "cabeça|consciência",
      "medicação|anticoagulante",
    ],
    vitals: "PA atual=128/78 mmHg;FC atual=92 bpm;Temperatura atual=36,4 °C",
    medications:
      "Relata anticoagulante habitual sem nome ou dose; lista completa não informada",
    allergies: "Não informadas",
    ciap: "A80",
    risk: "MEDIUM",
    flags: "Incapacidade de apoio após queda e possível anticoagulação",
    competency:
      "Registrar mecanismo, capacidade funcional e incerteza medicamentosa",
    error: "Afirmar ausência de fratura sem investigação",
    question:
      "A incapacidade de apoio e a medicação justificam a prioridade proposta?",
  },
  {
    slug: "28-confusao",
    title: "Mudança de comportamento percebida pela família",
    module: "Pessoa idosa e cuidado da pele",
    age: 81,
    sex: "Masculino",
    complaint: "Confusão desde esta manhã",
    history:
      "Filho informa que ontem às 21h conversava normalmente; hoje às 06h não reconheceu a casa. Às 08h na UBS alterna sonolência e agitação, sem diagnóstico da causa.",
    answers: [
      "Sou o filho e ontem às nove da noite ele estava como de costume.",
      "Hoje às seis ele não reconheceu a própria casa.",
      "Ele costuma conversar e cuidar da higiene sozinho.",
      "Não sei de queda recente e trouxe as caixas dos remédios.",
    ],
    topics: [
      "último habitual|horário",
      "mudança|reconhecer",
      "basal|autonomia",
      "queda|remédios",
    ],
    vitals:
      "PA atual=106/64 mmHg;Temperatura atual=38,1 °C;FC atual=108 bpm;Glicemia atual=126 mg/dL",
    procedures: ["0301100039", "0214010015"],
    medications:
      "Losartana e sinvastatina em caixas trazidas pelo filho; doses não transcritas",
    allergies: "Filho não sabe informar",
    ciap: "A29",
    risk: "HIGH",
    flags: "Mudança aguda do estado mental com febre em pessoa idosa",
    competency:
      "Distinguir estado basal de alteração aguda e identificar informante",
    error: "Atribuir confusão à idade ou demência sem evidência",
    question:
      "Qual código sintomático do catálogo melhor representa a apresentação?",
  },
  {
    slug: "29-tontura-remedios",
    title: "Tontura ao sair da cama",
    module: "Pessoa idosa e cuidado da pele",
    age: 73,
    sex: "Feminino",
    complaint: "Tontura ao levantar há uma semana",
    history:
      "Episódios ao levantar desde 14/10, duram menos de um minuto; sem tontura sentada na chegada às 10h. Não foram aferidas medidas ortostáticas.",
    answers: [
      "Fico tonta quando levanto, há uma semana.",
      "Passa em menos de um minuto quando sento.",
      "Não desmaiei e não tive fraqueza de um lado.",
      "Tomo seis remédios e uma receita mudou há dez dias.",
    ],
    topics: [
      "gatilho|levantar",
      "duração|sentar",
      "associados|desmaio",
      "polifarmácia|mudança",
    ],
    vitals:
      "PA atual sentada=108/66 mmHg;FC atual=70 bpm;Temperatura atual=36,5 °C",
    medications:
      "Relata losartana, hidroclorotiazida, metformina, sinvastatina e dois medicamentos não identificados; doses não informadas",
    allergies: "Nega alergias conhecidas",
    ciap: "N17",
    risk: "MEDIUM",
    flags: "Tontura postural, alteração recente da receita e risco de queda",
    competency:
      "Reconhecer necessidade de reconciliação sem concluir hipotensão ortostática não medida",
    error: "Suspender medicação por decisão autônoma",
    question: "A descrição deixa claro que só existe PA sentada?",
  },
  {
    slug: "30-ferida-mao",
    title: "Corte na mão durante tarefa doméstica",
    module: "Pessoa idosa e cuidado da pele",
    age: 41,
    sex: "Masculino",
    complaint: "Corte superficial na mão há duas horas",
    history:
      "Corte em dorso da mão esquerda às 08h ao manusear utensílio doméstico. Às 10h técnico realizou limpeza e curativo simples; sangramento cessou antes do curativo. Avaliação vacinal ainda não realizada.",
    answers: [
      "Cortei a mão às oito enquanto arrumava a cozinha.",
      "O sangue parou antes de eu chegar ao curativo.",
      "Consigo mexer os dedos e sinto o toque normalmente.",
      "Não lembro quando tomei a última vacina contra tétano.",
    ],
    topics: [
      "mecanismo|horário",
      "sangramento|cessou",
      "função|sensibilidade",
      "vacina|tétano",
    ],
    vitals: "PA atual=122/76 mmHg;Temperatura atual=36,5 °C;FC atual=78 bpm",
    procedures: ["0301100039", "0401010023"],
    medications: "Não usa medicação habitual",
    allergies: "Nega alergias conhecidas",
    ciap: "S18",
    risk: "LOW",
    flags:
      "Situação vacinal desconhecida e necessidade de avaliação da lesão pela equipe",
    competency:
      "Registrar curativo efetivamente realizado e limitar descrição ao que foi observado",
    error: "Lançar vacina ainda não administrada",
    question:
      "O código do curativo corresponde ao procedimento simples descrito?",
  },
);
seeds.push(
  {
    slug: "31-pe",
    title: "Retorno para avaliar o pé",
    module: "Pessoa idosa e cuidado da pele",
    age: 64,
    sex: "Masculino",
    complaint: "Ferida no pé há dois meses",
    history:
      "Úlcera crônica e diabetes diagnosticados antes. Hoje às 09h retorna por secreção aumentada há dois dias; cobertura ainda presente, nenhum curativo realizado hoje.",
    answers: [
      "A equipe diagnosticou essa úlcera há dois meses.",
      "A cobertura tem mais secreção há dois dias.",
      "Tenho neuropatia diagnosticada e sinto pouco esse pé.",
      "Não tive febre e vim ao retorno de hoje.",
    ],
    topics: [
      "diagnóstico|úlcera",
      "evolução|secreção",
      "sensibilidade|neuropatia",
      "febre|retorno",
    ],
    vitals: "PA atual=134/82 mmHg;Temperatura atual=37,0 °C",
    medications: "Metformina habitual; dose não informada",
    allergies: "Não informadas",
    ciap: "S97",
    risk: "MEDIUM",
    flags: "Mudança referida de secreção em ferida crônica diabética",
    competency:
      "Distinguir diagnóstico prévio e mudança atual sem inventar inspeção",
    error: "Lançar curativo não realizado",
    question: "A mudança de secreção exige qual avaliação complementar?",
  },
  {
    slug: "32-preocupacao",
    title: "Preocupação após uma notícia",
    module: "Escuta, proteção e acesso",
    age: 28,
    sex: "Feminino",
    complaint: "Nervosismo e palpitação desde ontem",
    history:
      "Perdeu emprego em 20/10. Palpitações em episódios de minutos desde então; chegou às 10h alerta, conversando, sem avaliação clínica anterior.",
    answers: [
      "Fiquei nervosa ao perder o emprego ontem.",
      "Meu coração dispara por minutos e depois melhora.",
      "Agora não sinto dor no peito nem falta de ar.",
      "Não pensei em me machucar e quero conversar.",
    ],
    topics: [
      "contexto|emprego",
      "duração|minutos",
      "sintomas atuais|peito",
      "segurança|machucar",
    ],
    vitals:
      "PA atual=120/78 mmHg;FC atual=88 bpm;SpO2 atual=98% em ar ambiente",
    medications: "Não usa medicação habitual",
    allergies: "Nega alergias conhecidas",
    ciap: "P01",
    risk: "LOW",
    flags: "Avaliar sintomas físicos e segurança durante a escuta",
    competency: "Acolher sem concluir transtorno pela queixa",
    error: "Rotular crise de ansiedade antes de avaliação",
    question: "A história contempla causas físicas e sofrimento?",
  },
  {
    slug: "33-sofrimento",
    title: "Pedido de conversa reservada",
    module: "Escuta, proteção e acesso",
    age: 36,
    sex: "Masculino",
    complaint: "Sofrimento e pensamentos de não querer viver",
    history:
      "Procurou sozinho às 11h; piora há uma semana e pensamentos atuais. Escuta em sala reservada; enfermeiro ainda não chamado no cenário.",
    answers: [
      "Há uma semana tudo ficou pesado.",
      "Hoje penso que não queria mais viver.",
      "Não me sinto seguro para ficar sozinho agora.",
      "Minha irmã é meu apoio, mas ainda não sabe.",
    ],
    topics: [
      "evolução|semana",
      "ideação|viver",
      "segurança|sozinho",
      "apoio|irmã",
    ],
    vitals: "PA atual=126/80 mmHg;FC atual=96 bpm",
    medications: "Sertralina habitual prescrita; dose não informada",
    allergies: "Não informadas",
    ciap: "P03",
    risk: "HIGH",
    flags: "Ideação atual com insegurança para permanecer sozinho",
    competency:
      "Registrar fala, escutar sem julgamento e comunicar equipe imediatamente",
    error: "Prometer sigilo absoluto ou inventar contato familiar já feito",
    question: "A proposta de proteção respeita atribuições e fluxo local?",
  },
  {
    slug: "34-privacidade",
    title: "Atendimento solicitado sem acompanhante",
    module: "Escuta, proteção e acesso",
    age: 38,
    sex: "Feminino",
    complaint: "Quer falar sozinha sobre situação em casa",
    history:
      "Chegou às 14h com companheiro e foi ouvida individualmente em sala reservada. Relata agressão ontem; nenhuma rede externa acionada ainda.",
    answers: [
      "Quero falar sem meu companheiro ouvir.",
      "Ontem ele me empurrou e apertou meu braço.",
      "Tenho medo de voltar para casa hoje.",
      "Minha filha está na escola e minha irmã pode me apoiar.",
    ],
    topics: [
      "privacidade|sozinha",
      "violência|ontem",
      "segurança|casa",
      "rede|filha",
    ],
    vitals: "PA atual=130/84 mmHg;FC atual=100 bpm",
    medications: "Não usa medicação habitual",
    allergies: "Nega alergias conhecidas",
    ciap: "Z25",
    risk: "MEDIUM",
    flags: "Violência relatada e medo atual de retorno ao domicílio",
    competency: "Preservar privacidade e atribuir informações ao relato",
    error: "Confrontar acompanhante ou afirmar notificação concluída",
    question:
      "Como ajustar prioridade à segurança atual e ao fluxo de proteção?",
  },
  {
    slug: "35-relacao",
    title: "Dúvida após relação sexual",
    module: "Saúde sexual, gestação e puerpério",
    age: 19,
    sex: "Feminino",
    complaint: "Busca orientação após falha de preservativo",
    history:
      "Rompimento em relação consensual em 20/10 às 23h; busca UBS em 21/10 às 09h. Nenhum medicamento prescrito ou administrado neste atendimento.",
    answers: [
      "A camisinha rompeu ontem às onze da noite.",
      "A relação foi consentida e estou segura.",
      "Minha menstruação começou em dez de outubro.",
      "Não uso outro método e ainda não tomei nada.",
    ],
    topics: [
      "tempo|relação",
      "consentimento|segurança",
      "ciclo|menstruação",
      "método|medicação",
    ],
    vitals: "PA atual=110/72 mmHg;Temperatura atual=36,5 °C",
    medications: "Não usa medicação habitual nem contraceptivo",
    allergies: "Não informadas",
    ciap: "W10",
    risk: "LOW",
    flags: "Demanda com janela temporal para avaliação pela equipe habilitada",
    competency: "Registrar horário e contexto sem prescrição autônoma",
    error: "Registrar contraceptivo como administrado",
    question: "Como assegurar avaliação no mesmo dia no fluxo local?",
  },
  {
    slug: "36-cartao",
    title: "Visita à sala de vacinação",
    module: "Prevenção, queixas locais e exposições",
    age: 22,
    sex: "Masculino",
    complaint: "Veio conferir cartão de vacinação",
    history:
      "Chegou às 10h sem queixa aguda com cartão. Triagem vacinal ainda não realizada; nenhuma vacina administrada nem PA aferida hoje.",
    answers: [
      "Vim conferir se minhas vacinas estão em dia.",
      "Trouxe meu cartão de papel.",
      "Não tive febre nem mal-estar nesta semana.",
      "Não lembro de reação forte após vacina e não sei qual falta.",
    ],
    topics: [
      "motivo|vacina",
      "documento|cartão",
      "sintomas|febre",
      "reação|histórico",
    ],
    vitals: "Temperatura atual=36,4 °C",
    procedures: [],
    medications: "Não usa medicação habitual",
    allergies: "Nega alergias conhecidas",
    ciap: "A98",
    risk: "NON_ACUTE",
    flags: "Conferir histórico e elegibilidade antes de administrar",
    competency: "Registrar demanda preventiva sem antecipar procedimento",
    error: "Lançar vacina antes da administração",
    question: "O desfecho proposto corresponde à organização da sala?",
  },
  {
    slug: "37-dente",
    title: "Dor em um dente ao mastigar",
    module: "Prevenção, queixas locais e exposições",
    age: 35,
    sex: "Feminino",
    complaint: "Dor dentária há três dias",
    history:
      "Início em 18/10, piora ao mastigar; chegou às 13h. Sem inspeção oral ou avaliação odontológica no cenário.",
    answers: [
      "Dói um dente de baixo há três dias.",
      "Piora quando mastigo e me acordou à noite.",
      "Não tive febre nem inchaço no rosto.",
      "Consigo abrir a boca e engolir água.",
    ],
    topics: [
      "duração|dente",
      "impacto|mastigar",
      "febre|inchaço",
      "função|engolir",
    ],
    vitals: "PA atual=118/76 mmHg;Temperatura atual=36,7 °C",
    medications:
      "Sem medicação habitual; paracetamol ontem, dose não informada",
    allergies: "Nega alergias conhecidas",
    ciap: "D19",
    risk: "LOW",
    flags: "Investigar edema progressivo e comprometimento de deglutição",
    competency: "Caracterizar queixa e facilitar avaliação odontológica",
    error: "Descrever abscesso sem exame",
    question: "A proposta contempla acesso à equipe odontológica?",
  },
  {
    slug: "38-ouvido",
    title: "Dor no ouvido após resfriado",
    module: "Prevenção, queixas locais e exposições",
    age: 17,
    sex: "Masculino",
    complaint: "Dor no ouvido direito desde ontem",
    history:
      "Resfriado em 17/10, dor auricular desde 20/10 à noite. Chegou às 09h com responsável; otoscopia não realizada.",
    answers: [
      "O ouvido direito começou a doer ontem à noite.",
      "Eu estava resfriado há quatro dias.",
      "Não saiu secreção e não tive tontura.",
      "Não coloquei objeto nem pinguei remédio no ouvido.",
    ],
    topics: [
      "lado|início",
      "precedente|resfriado",
      "associados|secreção",
      "exposição|objeto",
    ],
    vitals: "PA atual=112/70 mmHg;Temperatura atual=37,2 °C",
    medications: "Não usa medicação habitual",
    allergies: "Responsável relata urticária após dipirona",
    ciap: "H01",
    risk: "LOW",
    flags:
      "Reavaliar sintomas sistêmicos ou alterações retroauriculares se surgirem",
    competency: "Registrar lateralidade sem presumir resultado de otoscopia",
    error: "Afirmar membrana timpânica alterada sem exame",
    question: "A fonte da alergia e a ausência de exame estão claras?",
  },
  {
    slug: "39-acesso",
    title: "Dificuldade para obter medicação",
    module: "Escuta, proteção e acesso",
    age: 58,
    sex: "Feminino",
    complaint: "Ficou sem medicação por dificuldade de acesso",
    history:
      "Diabetes e hipertensão previamente diagnosticados. Às 08h procura ajuda após sete dias sem medicação, perda de renda e falta de transporte; sem queixa aguda hoje.",
    answers: [
      "Meus remédios acabaram há sete dias.",
      "Fiquei sem renda e sem dinheiro para transporte.",
      "Não tenho dor, falta de ar ou sede diferente hoje.",
      "Quero ajuda e posso trazer as receitas amanhã.",
    ],
    topics: [
      "interrupção|dias",
      "barreira|transporte",
      "sintomas|sede",
      "apoio|receita",
    ],
    vitals: "PA atual=146/88 mmHg;FC atual=78 bpm",
    medications:
      "Losartana e metformina habituais indisponíveis há sete dias; doses não informadas",
    allergies: "Nega alergias conhecidas",
    ciap: "Z01",
    risk: "NON_ACUTE",
    flags: "Barreira de acesso com interrupção de tratamento crônico",
    competency:
      "Identificar vulnerabilidade sem julgamento e articular continuidade",
    error:
      "Rotular como falta de adesão voluntária ou afirmar medicamento entregue",
    question: "O desfecho mantém continuidade com equipe e apoio para acesso?",
  },
  {
    slug: "40-labio",
    title: "Inchaço no lábio após uma refeição",
    module: "Prevenção, queixas locais e exposições",
    age: 25,
    sex: "Masculino",
    complaint: "Lábio inchado e dificuldade para respirar",
    history:
      "Refeição às 12h; dez minutos depois placas elevadas na pele, edema labial e dispneia. Chegou às 12h25 sem intervenção prévia; voz rouca observada.",
    answers: [
      "Comecei a inchar dez minutos depois de comer.",
      "Meu lábio aumentou e minha voz ficou rouca.",
      "Está difícil respirar e sinto tontura.",
      "Não sei os ingredientes e nunca tive isso antes.",
    ],
    topics: [
      "exposição|tempo",
      "edema|voz",
      "respiração|tontura",
      "histórico|ingredientes",
    ],
    vitals:
      "PA atual=86/54 mmHg;FC atual=128 bpm;FR atual=30 irpm;SpO2 atual=90% em ar ambiente",
    medications:
      "Não usa medicação habitual nem recebeu medicação neste episódio",
    allergies: "Nenhuma previamente conhecida; agente atual não identificado",
    ciap: "R02",
    risk: "HIGH",
    flags: "Edema, comprometimento respiratório e hipotensão após exposição",
    competency:
      "Comunicar imediatamente conjunto de sinais sem aguardar agente causal",
    error: "Aguardar confirmação do ingrediente ou sugerir tratamento autônomo",
    question: "A prioridade é sustentada sem afirmar causalidade definitiva?",
  },
);
const names = [
  "Ana Ribeiro",
  "Bruno Alves",
  "Carlos Lima",
  "Dora Martins",
  "Elisa Costa",
  "Fábio Rocha",
  "Gilda Souza",
  "Hugo Pereira",
  "Iara Santos",
  "João Melo",
  "Kleber Dias",
  "Lia Ramos",
  "Marina Lopes",
  "Nilo Barros",
  "Otávio Freitas",
  "Paula Reis",
  "Quésia Teixeira",
  "Renata Moura",
  "Sérgio Pinto",
  "Tadeu Neves",
  "Úrsula Castro",
  "Vítor Nunes",
  "Wanda Leal",
  "Yara Silva",
  "Zélia Duarte",
  "Aline Campos",
  "Berenice Gomes",
  "Célio Vieira",
  "Dalva Brito",
  "Edson Farias",
  "Francisco Luz",
  "Gabriela Torres",
  "Henrique Viana",
  "Inês Cardoso",
  "Júlia Matos",
  "Lucas Moreira",
  "Márcia Tavares",
  "Natan Azevedo",
  "Olga Mendes",
  "Pedro Cunha",
];
export const validationCases: ValidationCase[] = seeds.map((s, i) => {
  const item = build(s);
  item.patient.name = `${names[i]} (pessoa fictícia)`;
  item.patient.mother = "Helena Oliveira (mãe fictícia)";
  if (s.age === 0) item.patient.age = "51 dias";
  item.rubric.acceptedOutcomes = ["REFER"];
  return item;
});
// Fontes candidatas complementares para a revisão clínica, sem pressupor validação do conteúdo.
for (const item of validationCases) {
  const n = Number(item.slug.slice(0, 2));
  if ([21, 22].includes(n))
    item.rubric.references.push(
      "https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/svsa/dengue/dengue-diagnostico-e-manejo-clinico-adulto-e-crianca/view",
    );
  if ([23, 24, 25, 26, 35].includes(n))
    item.rubric.references.push(
      "https://bvsms.saude.gov.br/bvs/publicacoes/protocolo_atencao_%20basica_saude_mulher.pdf",
    );
  if ([5, 6].includes(n))
    item.rubric.references.push(
      "https://www.gov.br/saude/pt-br/assuntos/pcdt/h/hipertensao-arterial-sistemica.pdf/view",
    );
  if ([27, 28, 29].includes(n))
    item.rubric.references.push(
      "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-pessoa-idosa/acoes",
    );
  if (n === 33)
    item.rubric.references.push(
      "https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/suicidio-prevencao",
    );
}
