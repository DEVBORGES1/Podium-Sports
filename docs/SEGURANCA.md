# Segurança

Resumo dos controles implementados, de como foram testados e dos riscos que continuam abertos.

## Modelo de acesso

| Quem | O que pode | Como é garantido |
| --- | --- | --- |
| Visitante anônimo | ler catálogo, categorias, banners, promoções vigentes e configurações públicas; cotar a sacola; criar pedido; consultar **o próprio** pedido | rotas públicas devolvem apenas campos de loja (sem estoque exato, custos, dados de clientes ou campos internos); consulta de pedido exige o token HMAC devolvido na criação |
| Usuário autenticado no Supabase sem perfil | nada no painel | `requireAdmin` busca o perfil a cada requisição → 403 |
| ADMIN | operar a loja (pedidos, produtos, estoque, banners, promoções, configurações, uploads) | JWT validado + perfil `ACTIVE` |
| SUPER_ADMIN | tudo do ADMIN + usuários e auditoria | `requireRole('SUPER_ADMIN')` na API; a interface só esconde os links |
| Chave pública do Supabase (`anon`/`authenticated`) | **nada** no banco nem no Storage | RLS ativa sem políticas + `REVOKE ALL`; bucket sem políticas de escrita |

Ocultar botões no frontend é apenas conveniência: **todas** as rotas `/api/v1/admin/*` passam por `requireAdmin`, e o teste `tests/security.test.ts` percorre a lista de rotas administrativas conferindo o `401` anônimo.

## Autenticação

- Login, logout, renovação de sessão e recuperação de senha usam o fluxo oficial do **Supabase Auth**; a aplicação não armazena senhas.
- A API valida o access token com `jose`: assinatura (JWKS assimétrico ou HS256 legado — o algoritmo é restrito por tipo de chave, `alg: none` é rejeitado), emissor (`<SUPABASE_URL>/auth/v1`), audiência (`authenticated`) e expiração.
- O perfil é lido do banco a cada requisição: desativar um administrador corta o acesso imediatamente, mesmo com token ainda válido.
- Não existe cadastro público de administradores. O primeiro é criado pelo script de servidor (`admin:create`); os demais por convite de um SUPER_ADMIN. Recomenda-se desativar o *sign up* público no Supabase (ver IMPLANTACAO.md).
- Regras de usuários: ninguém altera a própria função/situação; sempre resta ao menos um SUPER_ADMIN ativo (com bloqueio `FOR UPDATE` contra rebaixamentos simultâneos — há teste de concorrência).

## Supabase: RLS e Storage

- Todas as tabelas do schema `public` (incluindo `_prisma_migrations`) têm **RLS ativada, sem nenhuma política**, e `REVOKE ALL` para `anon` e `authenticated` — defesa em profundidade caso uma política seja criada por engano.
- A API se conecta com o papel do banco (que ignora RLS), por isso **toda** autorização é aplicada no servidor; a RLS é uma segunda barreira contra acesso direto pela Data API com a chave pública.
- Testado em `tests/rls.test.ts` (simula os papéis `anon`/`authenticated` em PostgreSQL e tenta `SELECT`/`DELETE` em cada tabela) e, no projeto real, por `npm run check:rls` (PostgREST + Storage com a chave pública).
- Bucket `store-media`: público apenas para leitura, limite de 5 MB e tipos `image/jpeg|png|webp` configurados no próprio bucket; nenhuma política de escrita para papéis públicos — somente a API grava, com a chave secreta.

## API

- **Helmet** (CSP, `nosniff`, `frameguard`, etc.), `x-powered-by` desativado.
- **CORS** com lista explícita (`CORS_ORIGINS`), obrigatória em produção e sem `*`.
- **Rate limiting** por IP: público 300/min, criação de pedidos 10 a cada 10 min, painel 600/min, autenticação 60/min, uploads avulsos 120/10 min. `TRUST_PROXY` precisa refletir os proxies reais para o IP ser o do cliente.
- **Validação Zod** de corpo, parâmetros e query em todas as rotas; objetos `strict()` onde campos extras poderiam alterar dados (ex.: impossível alterar `stockQuantity` pela edição do produto). Corpo JSON limitado a 100 KB.
- **Erros centralizados**: formato único, sem stack trace nem detalhes internos; `500` registrado no log com `requestId`.
- **Logs estruturados (pino)** sem cabeçalhos (`Authorization`, cookies, `X-Order-Token`), sem corpo das requisições, sem IP; campos sensíveis com *redact*.
- **Variáveis obrigatórias verificadas** na inicialização (a API não sobe incompleta) e mensagens que citam apenas o nome da variável.
- Links configuráveis (botões de banners, banner de marcas) aceitam apenas caminhos internos (`/…`) ou `https://` — bloqueia `javascript:`, `data:` e `//dominio`.

## Pedidos, preços e estoque

- O cliente envia **somente IDs e quantidades**; qualquer preço/total enviado é ignorado. O servidor calcula com os preços do banco: menor entre preço cheio, preço promocional do produto e promoções **vigentes** (validadas por data e situação a cada pedido).
- Promoções são recusadas quando produziriam preço ≤ 0 ou ≥ preço cheio de algum produto; se o preço do produto mudar depois, a promoção incompatível simplesmente deixa de ser aplicada.
- **Reserva atômica**: `UPDATE products SET stock = stock - q WHERE id = ? AND stock >= q` dentro de uma transação, itens em ordem fixa (evita *deadlock*), `CHECK (stock_quantity >= 0)` como última barreira. Teste: 10 pedidos simultâneos para 3 unidades → exatamente 3 aceitos.
- **Idempotência**: `Idempotency-Key` única por pedido; repetições (inclusive simultâneas) devolvem o mesmo pedido; reutilizar a chave com outros itens → 409.
- **Cancelamento/expiração devolvem o estoque uma única vez**: `UPDATE … WHERE stock_released_at IS NULL` + transação. Teste com 6 cancelamentos simultâneos.
- Itens do pedido guardam nome e preço do momento da compra; produtos com pedidos não podem ser excluídos.
- Pagamento nunca é marcado automaticamente; abrir o WhatsApp é registrado apenas como “WhatsApp aberto”.
- **Concorrência entre administradores**: o painel envia o status que estava na tela (`expectedStatus`); se outra pessoa já mudou o pedido, a API responde `409 ORDER_STATE_CHANGED` e a tela recarrega o estado real. O `UPDATE … WHERE status = <anterior>` continua como última barreira (teste com duas aceitações simultâneas: só uma é registrada).
- **Transições por modalidade**: “Saiu para entrega” só é aceito para pedidos com entrega; pedidos concluídos, cancelados ou expirados não mudam mais. Validado no servidor — a interface apenas esconde os botões inválidos.
- Consulta pública do pedido exige token HMAC-SHA256 (comparação em tempo constante); token errado e pedido inexistente dão a mesma resposta (não revela códigos válidos).

## Avisos de novos pedidos e mensagens ao cliente

- **Sem Supabase Realtime, por decisão de segurança**: o Realtime (postgres_changes) obedece à RLS, e para o painel receber pedidos pela chave pública seria preciso criar uma política de leitura em `orders` — que contém nome, telefone e endereço de clientes. O painel consulta `GET /api/v1/admin/orders/live` a cada 15 s, com o mesmo JWT + perfil de qualquer rota `/admin`. A resposta traz só contagens e o resumo mínimo dos pedidos recentes (código, primeiro nome usado no aviso, total, modalidade), com `Cache-Control: no-store`.
- Notificação do sistema operacional (opcional) não mostra nome nem telefone do cliente — pode aparecer na tela bloqueada.
- `order_messages` segue o padrão das demais tabelas: RLS ativa sem políticas e privilégios revogados de `anon`/`authenticated` (coberto por `tests/rls.test.ts`). Os textos-modelo das mensagens ficam no conteúdo das configurações, mas **não** são devolvidos pela rota pública `/store/settings`.
- O envio pelo WhatsApp é feito por uma pessoa (link `wa.me`). O sistema registra “WhatsApp aberto” e, se a pessoa informar, “envio informado” com autor e horário — nunca “entregue”, porque sem a API oficial do WhatsApp Business não há como comprovar entrega. Nenhum token de WhatsApp existe no projeto.

## Uploads

- `multer` em memória com limites de tamanho (5 MB), quantidade (8 por envio, 10 por produto) e campos.
- Tipo identificado pelos **bytes iniciais** (JPEG/PNG/WEBP); extensão e `Content-Type` enviados são ignorados. SVG/HTML são recusados (`415`).
- Nome do arquivo gerado pelo servidor (`<pasta>/<uuid>.<ext>`); caminhos aceitos nos recursos são validados por regex — não é possível apontar para arquivos externos ou de outra pasta.

## Frontend

- Nenhum `dangerouslySetInnerHTML`/`innerHTML`: textos vindos do painel são renderizados pelo React (o realce `**texto**` da barra superior é interpretado sem HTML).
- Apenas variáveis `VITE_*` públicas; o build roda `check-bundle-secrets.mjs`, que falha se encontrar padrões de chaves secretas, `service_role` ou strings de conexão.
- `vercel.json` aplica CSP (`script-src 'self'`), HSTS, `X-Frame-Options: DENY`, `nosniff` e `Referrer-Policy`.
- O cliente do Supabase Auth só é carregado nas rotas `/admin`.

## Auditoria

`audit_logs` registra quem fez o quê e quando: criação/edição/exclusão de produtos (alterações de preço com valores antes/depois), movimentações e mínimos de estoque, mudanças de status e de pagamento de pedidos, categorias, banners, promoções, configurações (antes/depois), convites e alterações de usuários e uploads. Os metadados não incluem senhas, tokens nem contatos de clientes. Consulta somente leitura em **Painel → Auditoria** (SUPER_ADMIN).

## Riscos conhecidos e recomendações

| Risco | Situação | Recomendação |
| --- | --- | --- |
| Rate limit em memória | vale por instância da API | ao escalar para várias instâncias, usar `rate-limit-redis` (ou o limitador do provedor) |
| Reserva de estoque por pedidos falsos | mitigado por rate limit (10/10 min por IP), limite de 20 un./item e 30 itens/pedido, e expiração automática (padrão 48 h) | reduzir o prazo de expiração se houver abuso; considerar CAPTCHA (ex.: Cloudflare Turnstile) no checkout |
| Access token válido até expirar após logout | o Supabase emite tokens de ~1 h | desativar o perfil corta o acesso na hora; reduza a duração do JWT no Supabase se necessário |
| CSP com `style-src 'unsafe-inline'` | exigido por estilos inline do React/Recharts | não afeta scripts (`script-src 'self'`) |
| Advisory `deepmerge-ts` (via `prisma` CLI) | ferramenta de build/migrations; não processa entrada de usuários; a correção exige versão do Prisma ainda não publicada | atualizar o Prisma quando houver versão corrigida |
| Arquivos órfãos no Storage | uploads avulsos não usados (ex.: imagem trocada antes de salvar) podem permanecer | limpeza periódica comparando o bucket com os caminhos gravados no banco |
| Avisos dependem do painel aberto | sem push: com a aba fechada ou o computador suspenso, nada toca | manter o painel aberto no balcão; se precisar de aviso com tudo fechado, avaliar Web Push (service worker + chaves VAPID) ou a API oficial do WhatsApp Business |
| Busca e ordenação por preço efetivo em memória | adequado até alguns milhares de produtos (limite de 2.000 por consulta) | para catálogos maiores, materializar o preço efetivo e indexar busca com `pg_trgm` |
