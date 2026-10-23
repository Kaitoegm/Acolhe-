# Avaliação fundamentada e revisão animada

## Uso pelo aluno

1. Concluir a simulação congela o registro, o caso e seus critérios. A análise é executada pelo worker, respeitando quotas.
2. Acompanhar as etapas reais. Ao terminar, a devolutiva distingue erros, melhorias opcionais e pontos que precisam de conferência.
3. Selecionar um trecho para entender a proposta. Na comparação, o texto riscado é o original e o sublinhado é a sugestão.
4. Aplicar ou rejeitar sugestões na versão de revisão. Desfazer e recarregar preservam o histórico. Nenhuma decisão altera a tentativa já avaliada.
5. Usar **Usar revisão no registro** para levar a versão aceita ao editor e enviar nova tentativa. Se houver mudanças manuais no rascunho, a interface pede comparação manual para preservá-las.

As transições duram aproximadamente 230 ms por trecho, com sequência limitada a menos de dois segundos. **Ver tudo agora**, **Repetir demonstração**, preferência de movimento reduzido e configuração de acessibilidade do sistema são suportadas.

## Uso pelo instrutor

Em Casos, editar a versão e abrir **Fundamentos da avaliação**. Habilitar os critérios fundamentados, escolher uma referência inicial ou cadastrar outra e preencher instituição, edição, seção, página quando aplicável e trecho conferido. A confirmação da fonte é uma responsabilidade do instrutor.

Criar critérios com alternativas aceitas, aplicabilidade, justificativa e fontes. A publicação bloqueia fonte não conferida, aplicabilidade indefinida, IDs duplicados, alternativas fora do catálogo e origem ministerial sem fonte ministerial. O servidor registra a autoria e a data de aprovação, gera um hash do snapshot do trecho/metadados e mantém versões anteriores.

Os documentos sugeridos são referências iniciais, incluindo publicações históricas. Eles não foram automaticamente convertidos em critérios clínicos nem aprovados em nome de um responsável. Conferir atualizações e fluxos municipais antes de publicação para treinamento.

Na atividade de um aluno, o instrutor pode consultar original, propostas, decisões paginadas e comentários com autoria. O painel diferencia erros, melhorias opcionais e incertezas.

## Configuração e compatibilidade

- `EVALUATION_V2_ENABLED=true` habilita novas avaliações v2. `false` mantém o avaliador anterior para novas tentativas; resultados v2 existentes continuam legíveis.
- `EVALUATION_V2_CLASS_IDS` vazio permite todas as turmas; IDs separados por vírgula restringem o piloto.
- `AI_MODE=demo` apresenta exemplos determinísticos de linguagem, identificados na tela. O modo live usa o adaptador existente exclusivamente no worker e exige configuração em `.env.worker`.
- A análise contextual por IA recebe texto e fatos identificados, não navega na internet a cada tentativa. Códigos e julgamentos estruturados são limitados aos critérios publicados.
- A lista de equivalências aplicáveis é conservadora. Propostas sem equivalência verificável não são inseridas automaticamente. Ausência de informação não é convertida em negação nem em diagnóstico.
- Completação clínica semanticamente incerta permanece para revisão do instrutor. Dados não obtidos não são preenchidos pela IA.
- A classificação formal de risco é atribuição do enfermeiro; o campo para técnicos está identificado como exercício supervisionado de reconhecimento e comunicação.

Migração PostgreSQL: `prisma/migrations/202610200003_evaluation_v2/migration.sql`, aditiva. O procedimento local `npm run db:local` atualiza o SQLite sem recriar o banco. Não é necessário reaplicar o seed às turmas existentes.

## Evidência e pendências

Consulte [o registro de execução](evaluation-execution.md). A suíte inclui 60 regressões de linguagem em três perfis, testes do adaptador live com HTTP simulado, persistência e isolamento. Essas fixtures não equivalem a validação clínica dos casos.

Para piloto assistido ainda são necessárias aprovação do conteúdo por enfermagem, validação pedagógica, homologação PostgreSQL e execução medida com provedor real. Não há prescrição ou integração com prontuários reais.
