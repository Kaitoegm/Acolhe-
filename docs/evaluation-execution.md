# Execução — avaliação fundamentada e revisão animada

Plano: docs/superpowers/plans/2026-10-20-avaliacao-protocolos-feedback-animado.md

- [x] 1 Contratos e persistência v2; migração aditiva e banco SQLite atualizado
- [x] 2 Formulário de fontes/critério, verificação de autoria e catálogo, publicação versionada
- [x] 3 Avaliador v2 no worker, adaptador real com saída estruturada, evidências verificadas e modo demonstrativo explícito
- [x] 4 Revisões persistentes com múltiplas correções, formatação, desfazer, idempotência e controle de concorrência
- [x] 5 Progresso real do worker, status leve e quotas existentes preservadas
- [x] 6 Comparação animada, cartões, movimento reduzido, versão original e revisão
- [x] 7 Acompanhamento por natureza e histórico paginado; testes locais em andamento
- [ ] Aprovação clínica dos casos e validação pedagógica com turma piloto (responsável de enfermagem)
- [ ] Homologação PostgreSQL, provedor/modelo real e medição de custo/latência

Ruling: execução no diretório existente, sem worktree/commit — projeto sem Git; preservar dados locais e modificações do usuário.
Ruling: aprovação clínica e homologação de provedor/PostgreSQL dependem dos responsáveis e ambientes; implementar os controles e demonstrar com fixtures, sem simular aprovação humana.
Pre-flight: contratos v2 mantêm `items` compatíveis com consumidores v1; versão, evidências e patches têm contratos próprios. Revisões persistidas pertencem à tentativa e o rascunho do atendimento usa a revisão otimista já existente.

Ruling: o conjunto inicial de 60 registros é uma suíte de regressões linguísticas com os três perfis, não um conjunto de casos clinicamente aprovado — aprovação humana não pode ser fabricada.
Ruling: equivalências aplicáveis automaticamente usam um vocabulário pedagógico conservador e preservação lexical. Propostas que não passam pela validação semântica conservadora não são inseridas; ampliar o vocabulário exige testes e revisão. A IA real produz propostas contextuais; não atua como autoridade clínica.
Ruling: completude clínica cujo significado dependa de entrevista/interpretação permanece UNCERTAIN para instrutor; não substituir palavras-chave por falsa certeza do modelo.
Ruling: hash da fonte identifica o snapshot do conteúdo/trecho e metadados cadastrados, não o arquivo PDF inteiro. Não declarar que o documento completo foi obtido ou homologado.
Ruling: retries automáticos reiniciam etapas reais do trabalho; `progressVersion` permanece monotônico e `generation` identifica o retry manual. Não exibir progresso percentual nem aprovação parcial.
Ruling: manter projeto sem novas bibliotecas e reunir validação de achados em `language.ts`/`evaluate.ts` em vez de módulo `validate.ts` vazio.

Verificação inicial: testes novos observados RED→GREEN para módulos ausentes, contrato v2 incompleto, acentos/listas, catálogo inválido e publicação sem autoria. Testes de banco comprovam original imutável, duas abas, idempotência e matrícula revogada. Adaptador live testado com HTTP simulado, sem credenciais ou chamadas reais.

E2E: fixtures isoladas substituem a suposição de que casos reais continuam atribuídos a `demo-class`; turmas/atribuições do usuário foram preservadas. Fluxo novo passou: aceitar, recarregar, desfazer, múltiplas correções, formatação, citação preservada, histórico paginado e viewport de 360 px.

Revisão independente concluída em leitura: seis achados aceitos e corrigidos por regressões RED→GREEN:
- Sinais e separadores clínicos preservados; clareza aplicável limitada a espaços, não remoção genérica de pontuação.
- IDs de achados estáveis por faixa, únicos, com rejeição de duplicatas na validação do resultado e nas revisões.
- Publicação v2 confronta procedimentos esperados com os efetivamente realizados; critérios impossíveis legados viram incerteza.
- Aspas simples protegidas, preservando apóstrofos internos como em d'água.
- Transferência de revisão compara documento rico canônico, detectando mudanças apenas de formatação.
- Omissões persistem e exibem o texto das evidências identificadas, não apenas seus IDs.

Correção adicional de revisão própria: preservar as marcas da palavra corrigida quando ela começa numa fronteira entre negrito e itálico. Teste específico observado RED→GREEN.
Itens deliberadamente não julgados pelo revisor: aprovação clínica, qualidade/custo do provedor real, métricas de produção e concorrência PostgreSQL. Ruling: permanecerão dependências explícitas de homologação; não há aprovação clínica inferida.

Ruling: casos publicados antes da v2 não recebem critérios novos nem aprovação inferida. Continuam com o snapshot existente; para habilitar julgamento fundamentado v2, o instrutor deve revisar fontes/critério e publicar uma nova versão. Tentativas v1 anteriores permanecem legíveis.

Verificação final de código: 134 testes em 13 arquivos passaram; typecheck e build de produção passaram. Schema PostgreSQL validado estaticamente pelo Prisma, sem execução de migration ou teste de concorrência no PostgreSQL.

Verificação final de navegador: 4 fluxos passaram (30,9 s), cobrindo publicação e privacidade, revisão persistente e formatação, API/isolamento e envio de nova tentativa. Capturas desktop/mobile em `test-results/revisao-animada-*.png` inspecionadas visualmente; viewport de 360 px sem transbordamento horizontal. Revisão de acessibilidade por leitor de tela humano e piloto pedagógico ainda pendentes.
