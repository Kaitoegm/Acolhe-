# Plano de implementação — área do instrutor

## Objetivo

Manter gestão de turmas, alunos, casos, critérios, fontes, publicação, acompanhamento e histórico, apresentando cada tarefa com linguagem cotidiana e poucos controles por vez. Preservar a identidade clara e azul do Acolhe+. Proposta baseada na tela e nos componentes atuais; não altera a aplicação nesta etapa.

## Diagnóstico

- A página reúne listagem, edição e publicação no mesmo espaço, produzindo rolagem extensa.
- O editor mistura paciente, entrevista, respostas esperadas, fontes e configuração técnica do avaliador.
- Campos repetidos entre a rubrica original e critérios fundamentados podem gerar respostas conflitantes.
- A publicação revela uma pendência por vez e não leva ao campo responsável.
- Termos como aplicabilidade, dimensão e alternativas aceitas exigem conhecer a implementação. Alguns campos exigem códigos internos em inglês.
- Turmas e cadastro de alunos disputam espaço; os formulários aparecem antes de serem necessários.

## Navegação proposta

Manter três destinos: **Casos**, **Turmas e alunos** e **Acompanhamento**. Abrir Casos na primeira visita, por ser a tarefa atual predominante, e depois lembrar a última seção. Usar páginas próprias para edição e revisão, com retorno à lista preservando busca e página.

### Casos

Lista compacta com título, situação, turmas e ação contextual. Busca por título e filtros Todos, Em revisão e Publicados. Situações são derivadas dos estados existentes, sem migração automática. Mostrar quantidade total apenas se calculada no servidor; distinguir itens carregados do total.

Ação principal: **Revisar caso** para conteúdo pendente e **Abrir caso** para publicado. Criar caso continua disponível no cabeçalho. Histórico e configurações avançadas ficam em ações secundárias. Usar paginação existente; filtros globais devem atuar no servidor.

### Editor guiado

Quatro etapas navegáveis, sem obrigar refazer etapas já preenchidas:

1. **Paciente e história:** identificação, queixa, antecedentes, medidas atuais e procedimentos realizados. Exemplos curtos junto aos campos; seleção por nome para CIAP/SIGTAP, exibindo também o código.
2. **Conversa:** perguntas/assuntos e respostas do paciente. Palavras-chave ficam em opções de correspondência; manter sua edição e funcionamento. Oferecer prévia textual da ficha e das respostas, sem iniciar simulação ou consumir IA automaticamente.
3. **O que o aluno precisa acertar:** seções Registro, Motivo da consulta, Procedimentos, Prioridade e Encaminhamento. Cada seção mostra resposta esperada, motivo e referência associada. Alternativas selecionáveis em português substituem códigos digitados.
4. **Conferir e disponibilizar:** resumo legível, pendências agrupadas, escolha das turmas e aprovação explícita.

Salvar rascunho disponível em todas as etapas. Preservar valores ao navegar. Indicar alterações não salvas e avisar antes de sair. Salvamento automático persistente pode ser uma evolução: exige rascunho separado para não criar uma versão a cada alteração. Na primeira entrega, usar o salvamento explícito e o versionamento atual.

### Critérios e fontes

Trocar “Aplicabilidade” pela pergunta **Este item deve ser avaliado neste caso?**, com respostas **Sim**, **Não** e **Ainda vou revisar**. Mapear para os mesmos valores internos. Explicar o efeito de Não: o item não participa da avaliação, mas permanece no histórico.

Ao expandir uma referência, apresentar título, link, edição, trecho e localização. Manter confirmação de conferência explícita e vínculo por critério. Não presumir aprovação ao abrir uma referência. Identificadores, operadores e JSON ficam em **Configurações avançadas**, recolhidas e preservadas para suporte.

Criar um adaptador único entre o formulário e os contratos atuais. Para casos com critérios fundamentados, evitar duas edições paralelas das mesmas respostas. Preservar critérios múltiplos, fontes, identificadores e campos desconhecidos durante o ciclo abrir/salvar; qualquer conflito legado deve ser mostrado para revisão, nunca resolvido silenciosamente.

### Publicação clara

Antes do envio, exibir uma lista completa de pendências com links para os campos. Exemplo: **Faltam 2 revisões: decidir se Prioridade será avaliada; conferir a referência do Encaminhamento.** Cada pendência tem ação **Revisar**.

Usar um relatório de validação estruturado compartilhado entre formulário e servidor, contendo código, campo, critério/fonte e mensagem. A validação do servidor permanece obrigatória. Reavaliar o relatório após salvar e antes de publicar para evitar aprovação de uma versão antiga.

Botões distintos: **Salvar rascunho** e **Aprovar e disponibilizar**. Confirmar versão e turmas no resumo final. A aprovação continua sendo uma decisão do instrutor; nenhum aceite em massa será introduzido. Esclarecer que conferir uma fonte e aprovar o caso são ações diferentes.

### Turmas e alunos

Mostrar primeiro a lista de turmas. Ao abrir uma turma, apresentar alunos e casos disponibilizados. Exibir os formulários apenas ao acionar **Criar turma** ou **Adicionar aluno**. Manter os campos, regras de senha e permissões atuais. Retomar a lista sem perder o contexto.

### Acompanhamento

Lista com aluno, turma, caso, situação e tentativas; filtros simples. **Ver atividade** abre registro, conversa, devolutiva e histórico. Manter comentários e revisão do instrutor no atendimento existente, sem duplicar essas funções. Indicadores por dimensão e evolução ficam em uma seção expansível; nunca representar dados da página atual como resultado de toda a turma.

## Etapas de entrega

1. **Desbloquear a revisão:** relatório completo de pendências, mensagens claras, links aos campos e distinção entre salvar e publicar. Aceite: encontrar e resolver a pendência sem conhecer termos técnicos.
2. **Organizar a navegação:** extrair listagens e páginas de detalhe do componente atual; preservar paginação, busca e acesso. Aceite: voltar da edição para a mesma lista e filtro.
3. **Implementar o editor guiado:** quatro etapas, controles em português, referências expansíveis e adaptador dos contratos. Aceite: editar um caso completo sem JSON e sem perder configurações.
4. **Simplificar turmas e acompanhamento:** formulários sob demanda, detalhe por turma e visualização progressiva das atividades. Aceite: cadastrar aluno, disponibilizar caso e consultar tentativa mantendo as permissões.
5. **Validar com instrutor:** percorrer revisão de um caso dos 40, cadastro de aluno e consulta de devolutiva; ajustar os pontos em que houver dúvida.

## Arquivos e arquitetura

- `src/app/instrutor/page.tsx`: separar navegação e listas; introduzir rotas de edição/detalhe conforme convenções locais do Next.js.
- `src/components/case-fields.tsx`: dividir o formulário em etapas e usar controles específicos para os catálogos.
- `src/components/evaluation/protocol-fields.tsx`: linguagem cotidiana, referências expansíveis e modo avançado.
- `src/lib/evaluation/criteria.ts`: produzir pendências estruturadas, mantendo as invariantes atuais de publicação.
- Rotas do servidor: preservar autorização, paginação e versionamento; implementar filtros e relatório sem expor critérios privados aos alunos.
- Estilos: manter cores e tipografia existentes; foco visível, contraste, botões claros, responsividade e movimentos discretos com redução de movimento.

## Verificação e proteção do legado

- Comparar antes/depois ao abrir e salvar casos legados e V2, incluindo múltiplos critérios na mesma dimensão, fontes e itens não aplicáveis.
- Testar rascunho incompleto, navegação entre etapas, publicação bloqueada com todas as pendências e publicação válida após revisão.
- Garantir que edição/publicação mantenham histórico, tentativas congeladas, responsáveis e isolamento entre turmas.
- Testar buscas e paginação com os 43 casos atuais, erros de rede e envio repetido.
- Verificar teclado, foco nos erros, leitura por tecnologia assistiva, tela de notebook e celular.
- Não alterar automaticamente os 40 casos, suas aprovações ou atribuições durante a mudança de interface.

Sucesso: o instrutor consegue localizar um caso, entender o que falta, salvar e disponibilizar para uma turma sem consultar documentação técnica.
