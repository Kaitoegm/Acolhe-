# Avaliação fundamentada e revisão animada — plano de implementação

**Estado em 20/10/2026:** implementação de software entregue e verificada localmente. Veja [registro de execução](../../evaluation-execution.md) e [guia de uso](../../evaluation-v2.md). Aprovação clínica, piloto, PostgreSQL e provedor real permanecem dependências explícitas.

> Para implementação: usar superpowers:executing-plans, executando e verificando cada entrega antes da próxima. Este documento é um plano; nenhuma alteração funcional foi realizada nesta etapa.

**Objetivo:** transformar a entrega de um caso em uma devolutiva educativa fundamentada, que explique erros e oportunidades de melhoria e mostre a revisão do texto com IA e animações acessíveis.

**Arquitetura:** manter o worker separado, as quotas e as tentativas imutáveis existentes. Combinar regras clínicas aprovadas por caso com análise contextual de linguagem por IA; validar evidências, referências e alterações antes de apresentar qualquer resultado ao aluno.

**Tecnologias:** Next.js, TypeScript, Prisma, PostgreSQL/SQLite local, Tiptap/ProseMirror, Zod, Vitest e Playwright já presentes. Animações com CSS e recursos do navegador inicialmente, sem nova biblioteca obrigatória.

**Especificação:** experiência e contratos definidos neste documento, a partir do pedido de 20/10/2026. Decisões abaixo são propostas de implementação, não protocolos clínicos já homologados.

## 1. Resultado esperado para o aluno

Após clicar em **Concluir simulação**, a resposta enviada fica congelada. A tela acompanha o trabalho real do avaliador e, quando o resultado estiver validado, apresenta:

1. Um resumo acolhedor: o que foi bem registrado e o que merece atenção.
2. Problemas clínicos relevantes primeiro, sem ficarem escondidos atrás de animações.
3. Texto original com marcações selecionáveis e cartões explicativos.
4. Uma prévia revisada que transforma os trechos identificados, mantendo visível o antes/depois.
5. Ações **Aplicar sugestão**, **Manter meu texto**, **Desfazer**, **Ver fundamento** e **Revisar novamente**.

“Em tempo real” significa acompanhar a análise após a entrega e interagir imediatamente com as correções disponíveis. Não haverá correção durante a digitação na primeira entrega: isso anteciparia respostas do exercício. Não mostrar tokens parciais do modelo como julgamento clínico. Revelar apenas conteúdo estruturado e validado.

### Exemplo de experiência

Registro didático: `Paciente relata cocô endurecido há três dias.`

Prévia: `Paciente relata ~~cocô~~ **fezes** endurecidas há três dias.`

O trecho completo da alteração é `cocô endurecido` → `fezes endurecidas`, para preservar a concordância. O detalhe mostra: “Sugestão de redação profissional; o conteúdo informado foi preservado”. A palavra original recebe sublinhado; a substituição aparece ao lado e depois se acomoda na prévia. O aluno aceita a alteração para levá-la ao seu rascunho de revisão.

Se o registro for `Paciente refere: “meu cocô está duro”`, preservar a citação direta. Oferecer, se útil, uma paráfrase fora das aspas, sem tratar a fala do paciente como erro. Não inferir diagnóstico, frequência evacuatória ou tratamento a partir dessa frase.

## 2. Base documental e limites de aplicação

Fontes oficiais localizadas em 20/10/2026. O ano é o da publicação/ato quando identificado, não a data de indexação da busca. A lista é uma base inicial para curadoria; não equivale à revisão integral de todos os capítulos ou à confirmação de vigência de cada recomendação.

| Fonte | Uso previsto | Limite |
|---|---|---|
| [MS — Acolhimento à demanda espontânea, volume I, 2011](https://bvsms.saude.gov.br/bvs/publicacoes/acolhimento_demanda_espontanea.pdf) | Organização do acolhimento e processo de trabalho | Conferir atualizações e fluxo local antes de converter em regra |
| [MS — Acolhimento à demanda espontânea, volume II, 2012](https://bvsms.saude.gov.br/bvs/publicacoes/cadernos_atencao_basica_28.pdf) | Referência temática para queixas, risco e vulnerabilidade | Publicação histórica; não presumir atualidade de todas as condutas |
| [MS — PCDT de Hipertensão Arterial Sistêmica, 2025](https://www.gov.br/saude/pt-br/assuntos/pcdt/h/hipertensao-arterial-sistemica.pdf/view) | Conteúdo específico dos casos de hipertensão | Selecionar apenas critérios pertinentes ao objetivo do acolhimento |
| [MS — Protocolos da Atenção Básica: Saúde das Mulheres, 2016](https://bvsms.saude.gov.br/bvs/publicacoes/protocolo_atencao_%20basica_saude_mulher.pdf) | Curadoria dos casos de gestante e demandas relacionadas | Verificar documentos posteriores pertinentes a cada cenário |
| [MS — Ações para a pessoa idosa](https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/saude-da-pessoa-idosa/acoes) | Identificar materiais de avaliação multidimensional e cuidado longitudinal | Selecionar o documento específico antes de publicar critérios |
| [Conitec — catálogo de PCDT](https://www.gov.br/conitec/pt-br/assuntos/avaliacao-de-tecnologias-em-saude/protocolos-clinicos-e-diretrizes-terapeuticas/pcdt) | Conferência de versões e atos de aprovação | Não usar relatório preliminar como protocolo definitivo |

Referência profissional complementar, distinta do Ministério: [Resolução Cofen 661/2021](https://www.cofen.gov.br/resolucao-cofen-no-661-2021/). Estabelece a classificação de risco e priorização como atividade privativa do enfermeiro no âmbito da equipe de enfermagem. O curso para técnicos deve avaliar reconhecimento, registro e comunicação de sinais de alerta e acionamento da equipe. O campo de risco, se mantido, deve ser apresentado como exercício de raciocínio supervisionado, sem ensinar atuação autônoma fora das atribuições.

Não atribuir ao Ministério um dicionário obrigatório de substituição de palavras. Terminologia e organização textual serão uma **rubrica pedagógica local revisada**, identificada como tal. CIAP-2 e SIGTAP continuam vindo de catálogos versionados; a IA não cria códigos.

### Como uma referência se torna critério

- Cadastrar documento, instituição, edição, data, URL oficial, hash, situação de revisão e data de conferência.
- Registrar trecho relevante com seção, página impressa e página do PDF, quando disponíveis.
- Enfermagem revisa a interpretação: condição de aplicação, informação necessária, resposta esperada, alternativas aceitáveis e justificativa.
- Identificar origem como `MS`, `LOCAL` ou `PEDAGOGICAL`; registrar adaptação local sem apresentá-la como texto ministerial.
- Conferir se documento posterior substitui a recomendação para aquele escopo. Divergência não resolvida impede publicar o critério.
- Publicar caso com versões fixas de critérios e fontes. Atualização futura cria nova versão e não muda avaliações anteriores.
- Durante a avaliação, enviar à IA apenas o conjunto pequeno de evidências aprovado para aquele caso. Não depender de busca aberta na internet em cada tentativa.

## 3. O que avaliar e como explicar

| Dimensão | Avaliação | Devolutiva |
|---|---|---|
| Fidelidade | Relato, observação e medição identificados; ausência de informação inventada | Mostrar frase e evidência correspondente |
| Terminologia | Termo equivalente adequado ao contexto, sem jargão obrigatório | Original, proposta e explicação breve |
| Organização | Queixa, evolução, dados pertinentes e ações em sequência compreensível | Sugerir reorganização preservando todos os fatos |
| Completude | Informações esperadas e disponíveis foram documentadas? | Diferenciar “faltou registrar” de “precisa investigar” |
| CIAP-2 | Código compatível com as alternativas aprovadas do caso | Comparação e fundamento do critério |
| Procedimentos | Coerência com ações efetivamente realizadas | Não sugerir registrar um procedimento apenas porque seria indicado |
| Alertas e direcionamento | Reconhecimento e comunicação esperados no cenário | Explicar evidência e encaminhamento esperado no exercício |

Cada achado recebe natureza `ERROR`, `IMPROVEMENT` ou `UNCERTAIN`, além dos estados existentes Adequado, Rever e Atenção. Uma expressão simples semanticamente correta pode ser uma melhoria opcional, sem penalidade. Não usar ranking ou nota numérica nesta entrega.

Estrutura padrão de cartão: **O que encontrei → Por que importa → Como melhorar → Evidência/fundamento**. Quando houver incerteza, dizer precisamente qual dado falta; não transformar ausência de informação em afirmação negativa.

Regras para a IA: preservar negações, números, unidades, temporalidade, intensidade, fonte da informação e citações diretas. Não converter “fezes escuras” automaticamente em “melena”, nem “tontura” em “vertigem”. Equivalências dependem do contexto. Organizar o texto não autoriza acrescentar dados ou diagnóstico.

## 4. Avaliador proposto e contratos

Fluxo: snapshot → evidências do caso → checagens determinísticas → análise contextual por IA → validação → resultado persistido → revisão visual.

### Contratos novos, versionados como v2

- `EvidenceRef`: `{ id, sourceId, sourceVersion, section, printedPage?, pdfPage?, excerpt }`.
- `CriterionV2`: `{ id, version, dimension, origin, applicability, expectedEvidenceIds, acceptedAnswers, severity, rationale, sourceRefs, approvedBy, approvedAt }`. Condições devem usar operadores declarativos permitidos, nunca código executável.
- `TextAnchor`: `{ start, end, exact, prefix, suffix, blockId }`, com offsets UTF-16 sobre representação canônica explicitamente definida do documento.
- `FindingV2`: `{ id, criterionId?, kind, category, field, level, anchor?, replacement?, explanation, evidenceIds, sourceRefs, applicabilityStatus }`.
- `EvaluationV2`: `{ schemaVersion: 2, summary, findings, clinicalPending, mode, criterionVersion, promptVersion, model, snapshotHash, coverage }`.
- `RevisionPatch`: `{ findingId, baseSnapshotHash, anchor, replacement, state }`, com estado pending/accepted/rejected/conflict. Desfazer é operação auditável.

Separar `replacement` de `explanation`: hoje o campo `suggestion` pode conter uma instrução textual, que não deve ser inserida literalmente no registro.

A IA propõe achados de linguagem e evidências semânticas. O servidor valida IDs contra os permitidos e calcula julgamentos dos campos estruturados com os critérios aprovados. Evidência semântica incerta não deve produzir aprovação clínica automática. Não confiar em porcentagem de confiança autodeclarada pelo modelo.

Para cada omissão: se dado está na ficha/conversa, oferecer ação de revisão apoiada na evidência; se não existe, recomendar investigação no exercício e não inserir resposta fictícia. Não marcar tópico como atendido apenas por conter uma palavra-chave: distinguir “nega febre”, “não perguntou sobre febre” e “refere febre”.

### Ancoragem e revisão

- Construir mapa estável entre texto canônico e posições Tiptap, incluindo parágrafos, listas, quebras e marcas.
- Confirmar trecho literal e contexto; se houver duas correspondências igualmente possíveis, mostrar cartão sem destaque/aplicação automática.
- Excluir âncoras sobrepostas da aplicação em lote, oferecendo resolução individual.
- Aplicar patches não conflitantes em transação do editor; mapear posições das próximas alterações e preservar negrito/itálico/listas.
- Guardar rascunho de revisão e log de decisões; tentativa avaliada permanece imutável.
- Alteração manual que invalide contexto marca conflito. Não adivinhar novo local com busca pela primeira ocorrência.
- Mudança de ordem de parágrafos tem prévia própria; não misturar com trocas de palavras ainda pendentes nos mesmos trechos.
- Botão “Aplicar melhorias de linguagem” opcional, somente para patches validados sem conflitos. Campos clínicos exigem revisão consciente e não são alterados em lote.

## 5. Animação e interação

### Análise

Mostrar estados reais: **Aguardando análise**, **Conferindo critérios**, **Revisando escrita**, **Validando sugestões**, **Revisão disponível**. Etapa só avança quando o worker a persistir. Sem porcentagem artificial ou tempo prometido.

Manter polling leve existente, com versão/etapa e retomada após recarregar. Não executar IA na aplicação web. Resultado parcial não será apresentado como final; falha preserva o registro e oferece retry conforme quotas existentes.

### Devolutiva

- Cabeçalho com resumo e contadores por natureza; atenções clínicas visíveis imediatamente.
- Texto à esquerda e explicação contextual à direita no desktop; alternância acessível no celular.
- Revelação opcional de melhorias textuais em sequência; cada transição 180–250 ms e sequência inicial limitada a 2 segundos.
- **Ver tudo agora**, **Repetir demonstração** e **Reduzir movimento** sempre disponíveis.
- Na prévia, mostrar remoção riscada e inserção identificada; depois da aceitação, pequeno realce de confirmação no rascunho.
- Nenhuma substituição silenciosa; a animação demonstra a proposta antes de aplicá-la.
- Celebração discreta de progresso, sem confete para erro clínico, punição ou julgamento da pessoa.
- `prefers-reduced-motion` e preferência persistida removem deslocamento e sequência. Resultado completo permanece acessível desde que validado; animação não bloqueia teclado nem leitor de tela.
- Anunciar resumo por `aria-live=polite`, sem narrar cada frame. Não depender de cor: usar rótulo, ícone e texto.

## 6. Base existente e mapa de mudanças

Inspeção local: `src/lib/domain/ai.ts` já separa análise de linguagem e rubrica estruturada, mas omissões usam palavras-chave e fontes são strings livres. `src/components/feedback.tsx` já preserva o original, porém exige rascunho idêntico ao snapshot para aplicar sugestão e descarta o documento rico nessa aplicação. A normalização atual escolhe ocorrências pelo texto; precisa deixar de resolver ambiguidade silenciosamente.

| Arquivo/módulo | Responsabilidade proposta |
|---|---|
| `src/lib/contracts.ts` | Compatibilidade dos DTO atuais com feedback v2 |
| `src/lib/evaluation/contracts.ts` (novo) | Schemas Zod e tipos v2 |
| `src/lib/evaluation/criteria.ts` (novo) | Aplicabilidade e avaliação determinística |
| `src/lib/evaluation/language.ts` (novo) | Prompt contextual e resposta estruturada |
| `src/lib/evaluation/validate.ts` (novo) | Evidências, fontes, âncoras e cobertura |
| `src/lib/evaluation/anchors.ts` (novo) | Mapeamento texto/documento e correspondência segura |
| `src/lib/evaluation/revisions.ts` (novo) | Patches, conflitos e histórico de revisão |
| `src/lib/domain/ai.ts` | Delegar avaliação v2 mantendo paciente virtual separado |
| `src/lib/server/jobs.ts` | Etapas persistentes, worker e publicação atômica do resultado |
| `src/lib/server/enqueue.ts`, `reads.ts`, `api.ts` | Congelar fontes/versões, ler progresso e persistir revisões com autorização |
| `prisma/schema.prisma` + nova migração aditiva | Fontes versionadas, eventos e revisões; sem reescrever tentativas antigas |
| `src/components/feedback.tsx`, `field-feedback.tsx` | Orquestrar feedback v1/v2 |
| `src/components/evaluation/*` (novo) | Texto anotado, cartão, comparação, progresso e controle de movimento |
| `src/components/editor.tsx` | Transações Tiptap com preservação de formatação |
| `src/app/acolhimento/[id]/page.tsx` | Fluxo pós-entrega e retomada da revisão |
| `src/app/instrutor/page.tsx`, `src/components/case-fields.tsx` | Fontes, aprovação de critérios e revisão docente |

## 7. Entregas implementáveis

Cada tarefa segue teste que falha → implementação → teste que passa → revisão da entrega. Não criar commits enquanto o diretório não for um repositório Git. Antes de alterar APIs Next.js, consultar os guias locais exigidos pelo AGENTS.md.

### 1 — Contratos e persistência compatível

**Arquivos:** contracts novos, schema/migração, contracts existente; `tests/evaluation-contracts.test.ts`.

- [ ] Definir schemas acima, discriminador v1/v2 e `parseEvaluation(value): EvaluationV1 | EvaluationV2`.
- [ ] Testar leitura de tentativa antiga, rejeição de campos inesperados e referências inválidas.
- [ ] Criar tabelas `ProtocolSource`, `ProtocolVersion`, `CriterionVersion`, `CaseCriterion`, `AttemptRevision`, `RevisionAction`; acrescentar versão/etapa ao job e snapshot de evidências à tentativa.
- [ ] Manter tentativas existentes como v1; nenhuma inferência retroativa de revisão clínica.
- [ ] Verificar testes de contratos e migração em SQLite e PostgreSQL de homologação antes de implantação.

**Aceite:** avaliações antigas continuam abrindo; novas versões congelam fontes, critérios, prompt e modelo.

### 2 — Curadoria e publicação de critérios

**Arquivos:** `criteria.ts`, rotas de instrutor, `case-fields.tsx`, página de instrutor; `tests/criteria-publication.test.ts`.

- [ ] Implementar `validatePublishableCriteria(criteria, sources): ValidationResult` e edição por versão.
- [ ] Testar bloqueio de critério sem aprovação, fonte sem trecho verificável, conflito pendente e acesso de outro instrutor.
- [ ] Implementar formulário com documento, seção/página, justificativa, alternativas aceitas e origem.
- [ ] Revisar os três casos demonstrativos individualmente; não publicar só por ter cadastrado uma URL.
- [ ] Verificar que aluno recebe apenas fontes explicativas vinculadas ao feedback, sem acesso ao gabarito completo.

**Aceite:** todo julgamento clínico publicado é rastreável; ausência de revisão gera pendência, não reprovação.

### 3 — Avaliação contextual fundamentada

**Arquivos:** `criteria.ts`, `language.ts`, `validate.ts`, `domain/ai.ts`; `tests/evaluation-v2.test.ts` e fixtures.

- [ ] Implementar `evaluateCriteria(snapshot, criteria): FindingV2[]`, `reviewLanguage(input): Promise<LanguageProposal>` e `validateEvaluation(proposal, snapshot, bundle): EvaluationV2`.
- [ ] Criar testes com negação, fala literal, números/unidades, tempo, sinônimos, informação ausente, código inventado e tentativa de instruir a IA pelo texto.
- [ ] Substituir inferência por palavra-chave nas rubricas v2 por evidências contextualizadas; incerteza vira revisão docente.
- [ ] Limitar saída a 30 achados validados, reservando primeiro todos os achados clínicos. Se exceder, informar cobertura parcial; nunca afirmar revisão integral truncada.
- [ ] Dimensionar o pacote de fontes por caso para o limite de entrada existente de 32 KB; medir saída e ajustar limite de tokens explicitamente. Rejeitar pacote grande antes do consumo de IA, sem truncar evidências.
- [ ] Verificar respostas inválidas, IDs desconhecidos e preservação de fatos com provedor simulado e conjunto revisado.

**Aceite:** nenhuma correção aplicável adiciona fato clínico não fornecido; toda conclusão clínica possui critério aprovado.

### 4 — Ancoragem e revisão com múltiplas correções

**Arquivos:** `anchors.ts`, `revisions.ts`, `editor.tsx`, rotas de revisão; `tests/revision-patches.test.ts`.

- [ ] Implementar `buildTextMap(document): TextMap`, `resolveAnchor(map, anchor): ResolvedAnchor | null` e `applyRevisionPatch(document, patch, revision): PatchResult`.
- [ ] Testar duas ocorrências idênticas, acentos, emoji, parágrafos, listas, aspas, sobreposição, alteração manual e limite de 4.000 caracteres.
- [ ] Implementar aceitação sequencial, rejeição, desfazer e aplicação em lote de patches independentes.
- [ ] Persistir revisão com controle otimista de versão e idempotência da ação; duas abas não podem sobrescrever decisões silenciosamente.
- [ ] Verificar três correções consecutivas preservando marcas Tiptap e snapshot original; recarregar e retomar decisões.

**Aceite:** aluno aceita várias sugestões com formatação preservada; contexto ambíguo nunca recebe substituição automática.

### 5 — Progresso real do worker

**Arquivos:** jobs/enqueue/reads/contracts; `tests/evaluation-progress.test.ts`.

- [ ] Persistir etapa e `progressVersion` sob lease/token/generation existentes; incluir no status leve da tentativa.
- [ ] Testar worker interrompido, lease vencido, retry, duplicidade e processo antigo tentando publicar etapa.
- [ ] Manter uma reserva por avaliação lógica; animações, abrir cartões e aplicar patches não consomem IA. Nova tentativa segue quota existente.
- [ ] Verificar que GET apenas consulta estado e não dispara processamento; etapas não recuam dentro da mesma geração.

**Aceite:** progresso corresponde ao processamento; reload e retry não duplicam cobrança nem perdem texto.

### 6 — Experiência visual de revisão

**Arquivos:** `components/evaluation/*`, feedback, field-feedback, página de acolhimento e estilos; `tests/e2e/evaluation-review.spec.ts`.

- [ ] Criar texto anotado, cartão contextual, comparação original/revisão e controles da demonstração.
- [ ] Implementar animações com os tempos e comportamentos da seção 5; manter original acessível.
- [ ] Testar `cocô endurecido` → `fezes endurecidas`, fala literal preservada e atenção clínica imediatamente visível.
- [ ] Testar teclado completo, leitor de tela com inspeção manual, movimento reduzido, tela de 360 px e zoom 200%.
- [ ] Verificar que reprodução da animação não reaplica patches, não altera dados e não dispara IA.

**Aceite:** aluno entende o motivo da mudança e controla a revisão; animação não interfere no aprendizado ou na acessibilidade.

### 7 — Instrutor e homologação pedagógica

**Arquivos:** painel de instrutor, `evolution.tsx`, leituras paginadas; `tests/instructor-evaluation.test.ts`, documentação do piloto.

- [ ] Exibir achado, evidência, fonte, proposta da IA e decisão do aluno; permitir comentário e revisão do instrutor com autoria.
- [ ] Separar dificuldade clínica, organização e melhoria opcional de linguagem nos indicadores.
- [ ] Construir conjunto inicial de 60 registros revisados: 20 por perfil, incluindo adequados, incompletos, ambíguos e incompatíveis; incluir os casos de borda da seção 8.
- [ ] Comparar julgamento humano e IA; registrar falso positivo, falso negativo, alteração indevida e erro de âncora.
- [ ] Exigir zero substituições de fatos/negações/unidades e zero falhas em alertas críticos definidos no conjunto de aceite; divergência crítica bloqueia publicação do caso afetado.
- [ ] Medir latência p50/p95, custo por avaliação, taxa de retry e aceitação/rejeição de sugestões. Propor meta p95 de até 30 s em condições normais, medindo fila separadamente; só prometer após homologação do provedor.
- [ ] Executar `npm test`, `npm run typecheck`, `npm run build` e `npm run test:e2e`, com web e worker separados; validar migração e concorrência em PostgreSQL.

**Aceite:** responsável de enfermagem aprova cada caso e sua matriz de avaliação; turma pequena confirma compreensão da devolutiva antes de ampliar uso.

## 8. Pontos de revisão obrigatória

1. Frase repetida e texto formatado: tarefa 4 prova que destaque não migra para trecho errado.
2. Negação, citação direta, unidade e inferência diagnóstica: tarefa 3 preserva semântica e tarefa 6 demonstra a diferença visualmente.
3. Documento desatualizado ou conflito de fontes: tarefa 2 bloqueia critério ainda não revisado e mantém versões antigas reproduzíveis.
4. Edição durante análise, duas abas e recarga: tarefas 4/5 vinculam resultado ao snapshot correto e detectam conflito.
5. Trabalhador interrompido ou quota esgotada: tarefa 5 conserva registro e explica estado sem inventar devolutiva.

## 9. Ordem, liberação e dependências

Ordem recomendada: contratos → fontes/curadoria → avaliador → revisão segura → progresso → animações → piloto. UI pode ser demonstrada com fixtures enquanto a equipe revisa protocolos, sempre identificada como demonstração.

Liberação gradual por configuração do servidor `EVALUATION_V2_ENABLED` e turmas autorizadas. Ativar primeiro com provedor simulado, depois homologar IA real. Reversão impede novas avaliações v2, mantendo leitor de resultados já gravados. Migrações são aditivas.

Dependências humanas: responsável de enfermagem para aprovar fontes, critérios e limites de atuação; documentação do fluxo municipal para adaptações locais. Dependências técnicas: provedor real, orçamento medido e homologação PostgreSQL. Essas dependências não impedem implementar contratos, revisão e interface com casos demonstrativos.

**Definição de pronto:** o aluno entrega, recebe achados fundamentados, vê as alterações contextualizadas, aceita ou rejeita múltiplas mudanças, desfaz, retoma e envia nova tentativa sem perder o original; o instrutor consegue explicar de onde veio cada julgamento e corrigir a devolutiva sem apagar sua autoria.
