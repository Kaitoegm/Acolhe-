# Interface Acolhe+

## Fluxo e apresentação

Interface compacta em português, azul PEC #0758ad, superfícies claras, filtros cinza-lilás e aviso persistente de treinamento. Rotas: `/login`, `/`, `/acolhimento/[id]`, `/instrutor`. O cabeçalho distingue aluno e instrutor, e a API continua responsável pela autorização.

Fila com seleção de caso, busca por cidadão, ordenação por chegada/risco, filtros de situação/risco e chamada explicitamente simulada. A lista de alunos é pessoal, por isso Meus atendimentos é um rótulo informativo e não um controle falso.

Escuta com abas, CIAP/SIGTAP pesquisáveis por código e descrição, navegação por teclado, Tiptap, quatro riscos rotulados, liberação/encaminhamento e dez serviços do contrato. Ficha e conversa se mantêm no estado ao recolher o painel. Em telas menores, o painel passa para cima do formulário.

## Persistência

Rascunho em memória usa geração local, revisão do servidor e uma promessa de salvamento compartilhada. Debounce de 750 ms; alterações feitas durante uma gravação são drenadas em sequência. Falha permanece visível, com nova tentativa de gravação. Envio aguarda flush completo e reutiliza chave idempotente enquanto o rascunho não muda. Navegação por links internos espera flush; fechamento da página com alterações pendentes aciona o aviso nativo.

O chat aguarda flush, bloqueia edição durante a requisição e adota a revisão retornada pelo servidor antes de liberar novas mudanças. Polling atualiza somente tentativas e situação, preservando rascunhos locais mais novos; para após 60 consultas e oferece atualização manual.

Texto simples utiliza `editor.getText({ blockSeparator: '\n' })`; um filtro de transação usa a mesma serialização para limitar 4.000 caracteres incluindo quebras. Documento estruturado preserva formatação. Nenhum HTML arbitrário é renderizado.

## Devolutiva e instrutor

Tentativas mostram snapshot imutável, observações com nível textual, trechos por offsets e cartões focáveis. Sugestões textuais só são aplicáveis quando o rascunho corresponde ao snapshot e o trecho original coincide exatamente com os offsets. Aplicação preserva o histórico e altera apenas o rascunho. As dimensões clínicas também têm resumos expansíveis junto ao campo correspondente.

Área do instrutor inclui turmas, alunos, versões de casos, aprovação explícita com fundamentação/referências e seleção de turmas. O editor de casos oferece campos para identificação, história, sinais vitais, fatos do paciente e critérios; JSON permanece recolhido como opção avançada. Evolução compara contagens de observações por dimensão entre tentativas concluídas de um atendimento, sem atribuir nota clínica.

## Verificação

`npx tsc --noEmit` executado após implementação e ajustes. Testes de navegador e integração são conduzidos pelo coordenador com a API local.
