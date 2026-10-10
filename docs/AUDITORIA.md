# Auditoria do projeto original e plano de implementação

Arquivo auditado: `legacy/podium-sports.html` (versão original, preservada no repositório como referência visual e funcional).

## 1. Estrutura e tecnologias

| Item | Situação encontrada |
| --- | --- |
| Estrutura | Um único arquivo HTML (~226 KB) com CSS e JavaScript inline. Não havia repositório, build, testes nem backend. |
| Tecnologias | HTML5, CSS3 (custom properties, grid, animações), JavaScript puro, Google Fonts (Barlow Condensed + Inter). |
| Imagens | 3 PNGs embutidos em base64: logotipo (236×96, **duplicado** no cabeçalho e no rodapé, 23 KB cada) e troféu do hero (220×260, 86 KB). Nenhum produto tinha foto: os cards usavam ícones SVG por categoria. |
| Persistência | Apenas `localStorage` (`podium_sacola`) com `{ idDoProduto: quantidade }`. |

## 2. Identidade visual (preservada)

- Paleta: dourado `#f7aa18`, preto `#0b0b0c`, bege `#f0ede5`/`#e7e2d6`, verde WhatsApp `#1fa855`; tema escuro automático por `prefers-color-scheme`.
- Tipografia: títulos em *Barlow Condensed* itálico, caixa alta, com o marcador dourado `///`; texto em *Inter*.
- Componentes: barra superior (letreiro animado no celular), cabeçalho fixo que encolhe ao rolar, hero em carrossel com faixas diagonais douradas, anel com brilho e selo de preço, faixa de benefícios, "Destaques" com rolagem horizontal no celular, banner de marcas, tiles de categoria com gradiente e ícone, catálogo com busca e chips, faixa CTA dourada, faixa de confiança, rodapé escuro, gaveta "Sua sacola", toast, animação de "voar até a sacola", botão flutuante do WhatsApp com pulso, revelação ao rolar e respeito a `prefers-reduced-motion`.

## 3. Funcionalidades existentes

1. Catálogo com 66 produtos em 7 categorias (Chuteiras, Tênis, Suplementos, Roupas, Futebol, Goleiro, Treino), preço e "preço de" (oferta).
2. Busca sem acentos por nome/categoria e filtros por categoria e "Ofertas".
3. Carrossel com 4 slides: avanço automático com barra de progresso, setas, indicadores, swipe, teclado, pausa ao passar o mouse e quando a aba fica oculta.
4. Sacola: adicionar, aumentar/diminuir, total estimado, contador no cabeçalho e persistência no navegador.
5. Finalização: monta um texto e abre `wa.me/554998090818` com a mensagem codificada.
6. Links de WhatsApp no botão flutuante, CTA e rodapé.

## 4. Dados fixos no código (migrados para o banco)

| Dado | Onde estava | Para onde foi |
| --- | --- | --- |
| 66 produtos e preços | array `PRODUTOS` | tabela `products` (seed) |
| 7 categorias, ícones e gradientes | objeto `CATS` | tabela `categories` (`icon`, `color_from`, `color_to`) |
| Destaques da home | `DESTAQUES = [10,1,19,14,25]` | `products.is_featured` + `sort_order` |
| 4 slides do hero | HTML | tabela `banners` |
| Número do WhatsApp, cidade, textos, marcas, benefícios e letreiro | HTML/JS | tabela `store_settings` (singleton) |
| Logotipo e troféu | base64 inline | `frontend/src/assets` (logotipo substituível pelo painel via Storage) |

## 5. Problemas encontrados

### Segurança e integridade
- **Preço e total calculados só no navegador**: qualquer pessoa poderia editar o `localStorage` ou o JavaScript e mandar outro valor. Não havia registro do pedido.
- **Sem controle de estoque** nem limite de quantidade.
- **IDs dos produtos derivados da posição no array**: reordenar o catálogo mudaria o produto de sacolas já salvas.
- **`innerHTML` com dados do produto** (`card()`, `renderSacola()`): inofensivo com dados fixos, mas vira XSS assim que os dados viessem de um painel.
- Manipuladores `onclick` inline (incompatíveis com uma Content-Security-Policy restritiva).

### Dados
- Nome duplicado: dois "Joma Top-Flex" com preços diferentes (R$ 749,90 e R$ 649,90). Importados como produtos distintos com slugs `joma-top-flex` e `joma-top-flex-2` para revisão do lojista.
- Nenhum produto tinha foto, descrição ou estoque. **O estoque inicial do seed é configurável (`SEED_DEFAULT_STOCK`, padrão 10) e precisa ser ajustado com a contagem real** — a movimentação de carga inicial registra isso.
- O slide "F50 Messi" chamava `add(10)` com o ID fixo.

### Responsividade e acessibilidade
- Abaixo de 900 px o menu sumia sem alternativa (não havia menu móvel).
- Gaveta da sacola sem `role="dialog"`, sem fechar com Esc, sem prender o foco e sem devolvê-lo ao fechar.
- Campo "Seu nome" só com placeholder (sem `<label>`); botões −/+ sem rótulo acessível; toast sem `aria-live`; chips sem `aria-pressed`.
- `alert()` para sacola vazia.
- Conteúdo com classe `.reveal` começa invisível: se o JavaScript falhar, a página fica em branco.
- Botão flutuante do WhatsApp sem `href` até o JavaScript rodar.

### Organização e desempenho
- Tudo em um arquivo; logotipo duplicado em base64 (sem cache do navegador).
- Funções globais, estado global mutável e re-render total do catálogo a cada tecla digitada.

## 6. O que foi mantido, corrigido e criado

- **Mantido**: layout, cores, fontes, textos, ícones, animações, carrossel, gaveta da sacola, toast, "voar até a sacola", FAB do WhatsApp, busca sem acento, chips, tema escuro, `prefers-reduced-motion`, chave `podium_sacola` do `localStorage` (formato migrado de forma segura).
- **Corrigido**: os itens da seção 5.
- **Criado**: API REST, banco, painel administrativo, estoque com movimentações, pedidos registrados, promoções, banners administráveis, configurações, autenticação, auditoria, testes e documentação.

## 7. Arquitetura e decisões

```
frontend/ (React + Vite + TS)  ──HTTP/JSON──▶  backend/ (Express + TS, /api/v1)
       │  login (Supabase Auth)                     │ Prisma ──▶ Supabase PostgreSQL (RLS: nega acesso direto)
       └──────────── wa.me (mensagem do pedido)     └ service key ──▶ Supabase Storage (bucket público só leitura)
```

| Decisão | Motivo |
| --- | --- |
| Valores em **centavos (inteiros)** | Elimina erros de ponto flutuante; `CHECK` no banco impede negativos. |
| **Supabase Auth** para o login; backend valida o JWT (JWKS ou segredo HS256) e consulta o perfil a cada requisição | Não guardamos senhas; desativar um admin tem efeito imediato. Sem endpoints de login redundantes. |
| Toda leitura/escrita passa pela API; **RLS ativada em todas as tabelas sem políticas e privilégios revogados de `anon`/`authenticated`** | A chave pública do frontend não lê nada do banco diretamente (nem pedidos, nem dados de clientes). |
| **Reserva de estoque na criação do pedido** (`UPDATE ... WHERE stock >= qtd`), devolução atômica no cancelamento/expiração com marcador `stock_released_at` | Impede venda acima do disponível e devolução duplicada; pedidos abandonados expiram e liberam o estoque. |
| `Idempotency-Key` em `POST /orders` | Clique duplo ou repetição de rede não cria dois pedidos. |
| Módulos por domínio no backend (rotas + serviço + schemas); Prisma como camada de persistência | Menos camadas vazias, regras de negócio concentradas nos serviços. |
| CSS por componente reaproveitando as classes originais | Preserva a identidade visual sem reescrever o design. |
| TanStack Query para dados do servidor; Context + reducer para sacola e autenticação | Estados de carregamento/erro consistentes sem uma biblioteca de estado global extra. |

## 8. Riscos de perda de dados

- Sacolas antigas no `localStorage` usavam o índice do array como ID. Os produtos importados guardam esse índice em `legacy_id`, e a sacola é convertida automaticamente na primeira visita.
- Nenhum dado é apagado pela migração; o HTML original permanece em `legacy/`.

## 9. Plano de execução

1. **Fundação**: estrutura `frontend/` + `backend/`, TypeScript, validação de variáveis de ambiente, erros centralizados, logs.
2. **Banco**: schema Prisma, migration com RLS, Storage e índices, seed com os dados do HTML.
3. **API**: catálogo, pedidos, estoque, banners, promoções, dashboard, configurações, usuários, uploads e OpenAPI.
4. **Loja**: conversão do HTML em componentes React preservando o visual, catálogo com filtros, página de produto, sacola, checkout e confirmação com WhatsApp.
5. **Painel**: login, dashboard, produtos, categorias, estoque, pedidos, banners, promoções, configurações, usuários e auditoria.
6. **Segurança e testes**: testes de API (permissões, preços, concorrência, RLS), testes de interface e E2E.
7. **Entrega**: documentação de configuração, deploy, backups e relatório final.
