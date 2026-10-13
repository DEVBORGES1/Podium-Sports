# Podium Sports

Loja online de artigos esportivos (Videira, SC) com pedidos finalizados pelo WhatsApp e painel administrativo completo.

A versão original em HTML único está preservada em [`legacy/podium-sports.html`](legacy/podium-sports.html). A nova aplicação mantém a mesma identidade visual (cores, fontes, carrossel, cards, sacola, animações) e passa a ter dados no banco, regras de negócio no servidor e um painel para administrar tudo.

| | |
| --- | --- |
| **Frontend** | React 19, Vite, TypeScript, React Router, TanStack Query, React Hook Form + Zod |
| **Backend** | Node.js 22, Express 5, TypeScript, Zod, Prisma, pino — API REST em `/api/v1` |
| **Dados** | Supabase PostgreSQL (RLS ativa) e Supabase Storage (imagens) |
| **Autenticação** | Supabase Auth; a API valida o JWT e a função (ADMIN / SUPER_ADMIN) em toda rota `/admin` |
| **Testes** | Vitest + Supertest (API, contra PostgreSQL real), Vitest + Testing Library + MSW, Playwright E2E |

## Estrutura

```
backend/            API REST (Express + Prisma)
  prisma/           schema, migrations versionadas (inclui RLS e bucket do Storage) e seed
  scripts/          criação do primeiro administrador e verificação de RLS no Supabase
  src/modules/      um módulo por domínio: rotas + serviço + schemas Zod
  tests/            testes de API (segurança, concorrência, RLS, OpenAPI…)
  openapi.yaml      documentação da API (servida em /api/docs)
frontend/           SPA React (loja + painel em /admin)
  src/components/   componentes da loja, do painel e de interface
  src/pages/        páginas da loja (store/) e do painel (admin/)
  e2e/              testes Playwright contra a API real
docs/               auditoria, implantação/operação, segurança e relatório final
legacy/             HTML original (referência)
```

## Como rodar localmente

Pré-requisitos: Node.js 22+, PostgreSQL 15+ local **ou** um projeto Supabase (veja [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md)).

```bash
# 1. Dependências
npm run install:all

# 2. Backend
cp backend/.env.example backend/.env      # ajuste DATABASE_URL/DIRECT_URL e as chaves
npm --prefix backend run db:migrate        # cria tabelas, constraints, RLS e bucket
npm --prefix backend run db:seed           # importa os 66 produtos, categorias e banners do HTML
npm --prefix backend run admin:create -- --email voce@loja.com --name "Seu Nome"
npm run dev:api                            # http://localhost:3333  (docs em /api/docs)

# 3. Frontend (outro terminal)
cp frontend/.env.example frontend/.env.local
npm run dev:web                            # http://localhost:5173  (painel em /admin)
```

> O seed define um **estoque provisório** (`SEED_DEFAULT_STOCK`, padrão 10) porque o HTML original não tinha estoque. Ajuste os saldos reais em **Painel → Estoque** antes de divulgar a loja.

## Scripts úteis

| Comando | O que faz |
| --- | --- |
| `npm test` | testes da API (requer PostgreSQL — `TEST_DATABASE_URL`) e do frontend |
| `npm run test:e2e` | Playwright: sobe API + frontend em um banco `podium_e2e` descartável |
| `npm run lint` / `npm run build` | lint e build dos dois projetos |
| `npm --prefix backend run check:rls` | confirma, no Supabase real, que a chave pública não lê nem grava dados |

## Documentação

- [Auditoria do HTML original e plano](docs/AUDITORIA.md)
- [Implantação, configuração e operação](docs/IMPLANTACAO.md) — Supabase, variáveis, migrations, primeiro admin, deploy, CORS, backups, diagnóstico
- [Segurança](docs/SEGURANCA.md) — controles implementados, RLS, riscos conhecidos
- [Relatório final](docs/RELATORIO-FINAL.md) — o que foi entregue, testes executados e pendências
- [Pedidos, avisos sonoros e mensagens ao cliente](docs/PEDIDOS-E-AVISOS.md) — como funcionam e como testar
- [Auditoria de UX/UI, painel e pedidos (out/2026)](docs/AUDITORIA-UX-PEDIDOS.md) — problemas encontrados, causas, correções e testes
- API: `GET /api/docs` (Swagger) ou [`backend/openapi.yaml`](backend/openapi.yaml)

## Como funciona um pedido

1. O cliente monta a sacola; preços e estoque exibidos vêm da API (`POST /orders/quote`).
2. No checkout, o frontend envia **apenas IDs e quantidades** + dados de contato, com `Idempotency-Key`.
3. A API recalcula os preços (preço promocional e promoções vigentes), valida estoque, **reserva o estoque atomicamente** e grava o pedido (`Aguardando atendimento`, `Não pago`).
4. A página de confirmação monta a mensagem a partir do pedido gravado e abre `wa.me` com o número configurado no painel. O clique é registrado como "WhatsApp aberto" — isso **não** significa mensagem enviada, pedido aceito ou pagamento.
5. Com o painel aberto, o pedido aparece sozinho em até 15 s (faixa de aviso, contador e som opcional — ver [docs/PEDIDOS-E-AVISOS.md](docs/PEDIDOS-E-AVISOS.md)).
6. A loja aceita, separa, marca como pronto, informa a saída para entrega (só entregas), conclui ou cancela o pedido (cancelar devolve o estoque uma única vez) e marca o pagamento manualmente. Cada mudança é validada no servidor e registrada no histórico. Pedidos pendentes sem atendimento expiram após o prazo configurado e liberam o estoque.
7. A cada etapa o painel sugere a mensagem para o cliente; o botão abre o WhatsApp com o texto pronto e **a pessoa revisa e envia** — o sistema registra “WhatsApp aberto”, nunca “entregue”.
