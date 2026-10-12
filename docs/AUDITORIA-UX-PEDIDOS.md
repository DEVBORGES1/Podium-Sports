# Auditoria de UX/UI, painel administrativo e pedidos — outubro de 2026

Auditoria do sistema já em produção, seguida da implementação das correções. Cada problema abaixo foi confirmado no código, nos testes ou no navegador (auditoria automática de layout em 320, 360, 375 e 1366 px, mais inspeção visual).

## 1. Problemas encontrados (por prioridade)

### Crítico
Nenhum problema crítico de segurança ou de perda de dados. Rotas `/admin` são validadas no backend (JWT + perfil), a RLS bloqueia a chave pública, e preços e estoque são calculados no servidor — tudo isso já coberto por testes.

### Alto
| # | Problema | Causa confirmada | Correção |
| --- | --- | --- | --- |
| A1 | Pedidos novos não avisavam (nem som, nem visual) | **Não existia implementação**: nenhum `Audio`, `refetchInterval`, Realtime ou consulta periódica no frontend. A lista só mudava ao recarregar a página | Monitor de pedidos com consulta a cada 15 s, deduplicação, reconexão e som liberado por clique (seção 5) |
| A2 | Não existia “Saiu para entrega” e o fluxo ignorava a modalidade | O enum `OrderStatus` não tinha a etapa; `READY` servia para retirada e entrega | Novo status `OUT_FOR_DELIVERY` (migration aditiva) e transições por modalidade validadas na API |
| A3 | Sem fluxo para avisar o cliente sobre o andamento | O WhatsApp do painel abria uma conversa vazia; nada era registrado | Seção “Comunicação com o cliente”, mensagens por status e histórico “aberto” × “envio informado” (seção 6) |
| A4 | Dois administradores podiam agir sobre um estado desatualizado | A API validava a transição pelo status atual, mas não pelo status que a pessoa estava vendo (ex.: B cancelava um pedido que A tinha acabado de aceitar) | `expectedStatus` em `PATCH /status` → `409 ORDER_STATE_CHANGED`; a tela recarrega o estado real |
| A5 | Categorias, Estoque e Promoções alargavam a página no celular (486–803 px em tela de 375 px) | `.sr-only` (posição absoluta) dentro das tabelas escapava de `.table-wrap`, que não era posicionado | `.table-wrap { position: relative }` |
| A6 | Visão geral podia mostrar valores antigos logo depois de uma alteração (ex.: “Recebido R$ 0,00” logo após marcar pago) | O React Query reaproveitava uma requisição **iniciada antes** da alteração e ainda em andamento (consulta lenta). Encontrado pelo E2E e confirmado no trace | `refreshQueries()`: cancela requisições em andamento antes de invalidar; usado em todas as mutações do painel |

### Médio
| # | Problema | Causa | Correção |
| --- | --- | --- | --- |
| M1 | Painel lateral/detalhe sem destaque para o que fazer agora | Todas as transições eram botões iguais, e todas pediam confirmação, inclusive “Aceitar” | Botão grande para a próxima etapa, um clique nas intermediárias, confirmação só para concluir e cancelar |
| M2 | Dashboard com 12 indicadores, alguns confusos (“Valor em pedidos registrados”, “% WhatsApp aberto”), e sem atalhos | — | “Visão geral” com cards de tarefa clicáveis, atalhos, pedidos recentes, estoque baixo; vendas em seção própria |
| M3 | Menu com nomes técnicos e sem agrupamento | — | Grupos Catálogo / Vitrine / Loja / Administração, ícones, “Pedidos” no topo com contador; “Auditoria” → “Histórico de alterações” |
| M4 | Cadastro de produto com campos técnicos (slug, ordem) no meio do formulário e sem explicar que as fotos vêm depois | — | Grupos numerados (informações, preço, imagens, publicação, estoque), “Configurações avançadas” recolhidas, barra fixa de salvar/cancelar, aviso sobre as fotos |
| M5 | Imagens de tipo ou tamanho inválido eram descartadas em silêncio | Filtro sem mensagem | Aviso com quantos arquivos foram ignorados e por quê |
| M6 | Botão do banner sugeria um link que não funciona | O exemplo era `/produtos?promocao=1`, mas o catálogo usa `?ofertas=1` | Seletor de destino (todos os produtos, ofertas, cada categoria ou “outro endereço”) — sem digitar URL |
| M7 | Estoque com ação genérica “Movimentar” e termos técnicos | — | Botões “+ Adicionar”, “− Saída”, “Ajustar”; perguntas em linguagem simples; ajuste com revisão “10 → 7 (−3)” e campos travados durante a revisão |
| M8 | Esc em confirmação aberta dentro de outro diálogo fecharia os dois | Cada diálogo escutava o teclado do documento inteiro | Pilha de diálogos em `useDialog`: só o do topo responde |
| M9 | Inventário: pedidos em entrega deixariam de contar como “reservados” | Lista de status abertos duplicada e fixa no SQL | Lista única `OPEN_ORDER_STATUSES` usada na API |
| M10 | Salvar a página inicial apagaria as mensagens personalizadas | O formulário reconstruía o `content` inteiro | Envio preserva `customerMessages` (verificado no navegador) |

### Baixo (acabamento visual)
| Problema | Causa | Correção |
| --- | --- | --- |
| Botões “pulavam” ao passar o mouse em tabelas e modais | `.btn:hover { transform: translateY(-2px) }` global | Sem deslocamento nas telas do painel; o efeito continua nas vitrines da loja |
| Botões de excluir com estilos diferentes entre si | `style={{ color: 'var(--danger)' }}` e fundo inline em cada tela | Variantes `btn-danger`, `btn-danger-outline`, `btn-quiet`, `btn-icon` |
| Alturas de botão inconsistentes e quebra de linha | Sem `min-height`, `line-height` nem `white-space` | Altura mínima fixa (48/38 px), texto em uma linha, ícone 18/16 px, indicador de carregamento sem mudar o tamanho |
| Campo de seleção desalinhado do campo vizinho (11–13 px) | `.field` era grid sem `align-content: start` (a dica do campo ao lado esticava o rótulo), e o Chrome força `line-height: normal` no `select` | `align-content: start` e `min-height`/`line-height` iguais para `input` e `select` |
| Campo vizinho descia quando o rótulo ao lado quebrava em duas linhas (ex.: “Título” × “Destaque (2ª linha em dourado)” em 1024 px) | Cada campo era um grid independente | Formulários de 2/3 colunas usam `subgrid`: rótulo, campo e dica das colunas vizinhas compartilham as linhas |
| Campo de data/hora ultrapassava o card em telas médias | `datetime-local` tem largura mínima intrínseca maior que a coluna, e a coluna interna de `.field` não encolhia | `.field` com `minmax(0, 1fr)` e campos com `min-width: 0` |
| Valores e tabelas alargavam colunas (Nova promoção 407 px; KPI 366 px no celular) | Grids com `1fr`, cujo mínimo é automático | `minmax(0, 1fr)` em todos os grids do painel |
| Rádio do checkout desalinhado | Item flex sem `flex-shrink: 0` encolhia com texto longo | `flex: 0 0 18px` |
| Alvos de toque de 29–32 px | `padding: 4px 8px` inline nas setas; `+/−` da sacola com 32 px | `btn-icon` (38 px), sacola e “Adicionar” com 38 px |
| Classes novas colidiam com as da loja (`.off`, `.ring`, `.name`, `.qty`, `.total`) | `store.css` usa nomes genéricos e fica carregado depois de abrir Banners | Prefixos próprios nas classes novas do painel |

## 2. Melhorias implementadas

### Visual e consistência
- Sistema único de botões com variantes e estados (hover, foco, pressionado, desabilitado, carregando) em `frontend/src/styles/base.css`.
- Ícones no menu e nas ações, barra fixa de salvar nos formulários (produto, banner, promoção), estados vazios e de carregamento com o mesmo padrão.
- Identidade preservada: mesmas cores, fontes, logotipo e tema escuro.

### Painel administrativo
- Menu: **Visão geral · Pedidos** · Catálogo (Produtos, Categorias, Estoque) · Vitrine (Banners da página inicial, Promoções) · Loja (Configurações) · Administração (Usuários do painel, Histórico de alterações).
- Visão geral: Pedidos novos, Em separação, Prontos, Saíram para entrega, Concluídos hoje, Estoque baixo — todos clicáveis. Atalhos: ver pedidos novos, cadastrar produto, atualizar estoque, trocar banners, criar promoção. Sem dados fictícios.
- Mensagens de resultado padronizadas (“Produto cadastrado com sucesso. Agora envie as fotos.”, “Estoque atualizado: X passou de 10 para 15.”, “Banner publicado: já aparece na página inicial.”, “Pedido PS-… aceito.”, “Não foi possível salvar. Verifique os campos destacados…”).

### Tela de pedidos
- Abas com contagem: Em aberto, Novos, Em separação, Prontos, Saiu para entrega, Concluídos, Cancelados, Todos. Busca por código, nome ou telefone. Período e pagamento em “Mais filtros”.
- Lista em cards, legível no celular: código, “Novo”, tempo desde a criação (em vermelho após 15 min aguardando), cliente, telefone, itens, total, modalidade e o **botão da próxima etapa**.
- Detalhe em **painel lateral**, sem sair da lista (`?pedido=<id>`), ou em página própria (`/admin/orders/:id`): resumo, barra de etapas por modalidade, próxima etapa, comunicação com o cliente, cliente e entrega, itens, pagamento e histórico completo (status, mensagens, pagamento, estoque devolvido).
- Atualização automática pela consulta de novidades: quando algo muda (pedido novo ou alterado por outra pessoa), lista, detalhe e visão geral são recarregados.

## 3. Como funciona a notificação sonora e a mensagem pelo WhatsApp
Ver **[PEDIDOS-E-AVISOS.md](PEDIDOS-E-AVISOS.md)**: mecanismo, regras de deduplicação e reconexão, estados do som, mensagens por status, diferença entre “WhatsApp aberto” e “envio informado”, e o roteiro de teste manual.

## 4. Backend e banco

- Migration `20261012120000_out_for_delivery_customer_messages` (aditiva): status `OUT_FOR_DELIVERY`, tabela `order_messages` (uma por pedido e status, índice único, RLS + `REVOKE`) e índice em `orders.updated_at`. Aplicada automaticamente pelo `prisma migrate deploy` do Render.
- Novas rotas (documentadas em `openapi.yaml`, protegidas por `requireAdmin`):
  - `GET /admin/orders/live`: novidades para o painel.
  - `POST /admin/orders/:id/messages`: registra a abertura do WhatsApp e devolve o link.
  - `POST /admin/orders/:id/messages/:messageId/confirm`: envio informado por quem enviou.
- `GET /admin/orders` aceita vários status (`?status=ACCEPTED,PROCESSING`) e traz prévia dos itens e as ações válidas de cada pedido. O detalhe traz a mensagem sugerida e o histórico de mensagens.
- Registro concorrente de mensagens usa `INSERT … ON CONFLICT` (o `upsert` do Prisma não é atômico; o teste de cliques simultâneos pegou isso).

## 5. Segurança
- Nenhuma chave privilegiada no frontend (verificado no build: `check-bundle-secrets`, 43 arquivos).
- Decisão de **não usar Supabase Realtime**: exigiria política RLS de leitura em `orders` para a chave pública. A consulta periódica passa pela mesma autenticação de qualquer rota `/admin`.
- Concorrência de status (`expectedStatus`), transições por modalidade validadas no servidor, mensagens sem dados desnecessários, notificação do sistema sem nome nem telefone do cliente.
- Novas rotas incluídas no teste de 401 anônimo. A nova tabela foi incluída no teste de RLS. Novas ações aparecem no Histórico de alterações.
- `npm audit --omit=dev`: frontend sem vulnerabilidades. Backend: o mesmo aviso já documentado do `deepmerge-ts`, via CLI do Prisma (ferramenta de build), sem correção publicada compatível.

## 6. Testes executados (neste ambiente, PostgreSQL 18 em Docker)

| Suíte | Resultado | Novos nesta auditoria |
| --- | --- | --- |
| API — Vitest + Supertest, banco real | **170/170** | 21: etapas por modalidade, retirada sem “saiu para entrega”, concluído não volta, tela desatualizada (409), aceitações simultâneas, mensagens por status/modalidade, codificação do link, cancelamento sem promessas, cliques simultâneos sem duplicar, confirmação única, modelos personalizados fora da API pública, consulta de novidades e filtros por vários status; rotas novas no teste de 401; tabela nova no teste de RLS |
| Frontend — Vitest + Testing Library + MSW | **37/37** | 12: primeira consulta não avisa, só pendentes nunca vistos, reconexão avisa só o intervalo, deduplicação entre abas e expiração, armazenamento corrompido, som não toca antes do clique, toca depois, falha informada quando bloqueado, monitor completo com MSW (aviso único e queda de conexão) |
| E2E — Playwright (desktop + celular), API + banco reais | **21/21** (duas rodadas seguidas) | 1 novo: pedido feito na loja aparece sozinho no painel aberto, com aviso, destaque e contador. Atualizados: aceitar em um clique pelo painel lateral, link do WhatsApp com número e texto, Visão geral, estoque. Corrigida uma instabilidade antiga do helper de login (navegava antes de o token chegar) |
| Lint e typecheck | sem erros (10 avisos do Fast Refresh, mesmo padrão dos contextos já existentes) | — |
| Build de produção | ok nos dois projetos | — |
| Varredura automática de layout | ok | 22 telas do painel (incluindo painel lateral do pedido e diálogos) e 6 da loja, em 390, 768, 1024 e 1366 px: controles desalinhados, alturas diferentes, prefixo “R$” descentralizado, sobreposição, conteúdo fora do card, texto cortado, rolagem horizontal. O detector foi validado reaplicando o CSS antigo, e apontou os mesmos defeitos da versão publicada |
| Navegador (manual) | ok | Som confirmado: osciladores criados = 4 (aviso tocado 2×) e nenhum novo após mais dois ciclos; link `wa.me/5549955553333` com texto idêntico ao sugerido; ajuste de estoque com revisão; mensagens personalizadas preservadas; nenhuma tela com rolagem horizontal em 320/360/375 px |

O teste de “som” prova que o navegador liberou o áudio e agendou as notas. Não prova que havia alto-falante ligado; isso só pode ser verificado por uma pessoa (roteiro em PEDIDOS-E-AVISOS.md).

## 7. Pendências que dependem de configuração ou decisão externa
1. **Deploy**: publicar a nova versão (o Render aplica a migration). Depois, rodar `npm --prefix backend run check:rls` contra o projeto real, que continua pendente desde a entrega anterior.
2. **Envio automático pelo WhatsApp** só é possível com a WhatsApp Business Platform (Cloud API) ou um provedor autorizado: conta Business verificada, número dedicado, templates aprovados pela Meta para mensagens fora da janela de 24 h, consentimento do cliente, token no backend e webhook para status de entrega. A tabela `order_messages` já tem `channel` para receber um segundo canal (`WHATSAPP_API`) com estados comprováveis.
3. **Avisos com o painel fechado**: exigiriam Web Push (service worker, chaves VAPID, armazenamento de inscrições) ou o item 2. Não implementado porque a operação descrita é com o painel aberto no balcão.
4. `backend/supabase/01-instalacao.sql` não foi regenerado (o script exige `psql` local). Instalações novas pelo SQL Editor recebem a migration nova no primeiro deploy da API.

## 8. Riscos e limitações restantes
- Navegadores atrasam timers em abas de segundo plano, até cerca de 1 min. Voltar para a aba consulta na hora.
- No Render Free a API “dorme”. Com o painel aberto as consultas a mantêm acordada; sem o monitor externo, a primeira consulta depois de um período ocioso pode levar alguns segundos, e o indicador mostra a reconexão.
- A deduplicação entre abas usa o `localStorage`. Em janela anônima ou com armazenamento bloqueado, cada aba avisa por conta própria.
- “Envio informado” é uma declaração da pessoa, não confirmação do WhatsApp.
