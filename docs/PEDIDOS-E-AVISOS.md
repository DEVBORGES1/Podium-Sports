# Pedidos, avisos de novos pedidos e mensagens ao cliente

Como funciona o atendimento no painel (**Pedidos**) e como testar cada parte.

## Etapas do pedido

| Etapa | Quem aplica | Retirada | Entrega |
| --- | --- | --- | --- |
| Novo pedido (`PENDING`) — o cliente vê “Aguardando confirmação da loja” | site | ✓ | ✓ |
| Aceito (`ACCEPTED`) | loja | ✓ | ✓ |
| Em separação (`PROCESSING`) | loja | ✓ | ✓ |
| Pronto para retirada / Pronto para envio (`READY`) | loja | ✓ | ✓ |
| Saiu para entrega (`OUT_FOR_DELIVERY`) | loja | — | ✓ |
| Concluído (`COMPLETED`) | loja | ✓ | ✓ |
| Cancelado (`CANCELLED`) — devolve o estoque uma única vez | loja | ✓ | ✓ |
| Expirado (`EXPIRED`) — sem atendimento no prazo configurado | sistema | ✓ | ✓ |

- A API valida cada mudança (`backend/src/modules/orders/orders.labels.ts`): “Saiu para entrega” só para entregas; concluído, cancelado e expirado não mudam mais. Etapas intermediárias podem ser puladas (ex.: aceitar e concluir na hora), mas nunca se volta atrás.
- O painel mostra só as ações válidas para o status e a modalidade. A **próxima etapa** é o botão grande; pular etapas e cancelar ficam em botões menores.
- Aceitar, separar, marcar como pronto e saiu para entrega são **um clique**. Concluir e cancelar pedem confirmação; cancelar exige o motivo, que fica no histórico.
- **Dois atendentes ao mesmo tempo**: o painel envia o status que estava na tela. Se outra pessoa já tiver mudado o pedido, a API recusa (`409`), o painel mostra o motivo e recarrega o estado real — nada é atualizado “só na tela”.
- Cada mudança grava status anterior, novo status, data/hora, responsável e observação (`order_status_history`), além do registro em **Histórico de alterações**.

## Aviso de pedidos novos

**Mecanismo:** enquanto o painel está aberto, cada aba consulta `GET /api/v1/admin/orders/live` a cada 15 s — uma única consulta por aba, encerrada ao sair do painel. Não usamos Supabase Realtime porque ele exigiria liberar a leitura da tabela de pedidos (com dados de clientes) para a chave pública; ver `docs/SEGURANCA.md`.

**Como um pedido é considerado novo** (`frontend/src/lib/order-alerts.ts` e `contexts/OrderAlertsContext.tsx`):

1. Na primeira consulta depois de abrir o painel, nada toca: os pedidos existentes são apenas registrados como conhecidos.
2. As consultas seguintes enviam `since` = horário do servidor da consulta anterior; a API devolve os pedidos criados desde então, com 2 min de sobreposição (para não perder pedido cuja transação ainda não tinha terminado). Repetidos são descartados pelo id.
3. Só disparam alerta pedidos **nunca vistos e ainda aguardando aceite**. Um pedido que outra pessoa já aceitou não toca.
4. Abas abertas ao mesmo tempo combinam pelo `localStorage` qual pedido já foi avisado: o mesmo pedido não toca duas vezes.
5. Sem conexão, o indicador do topo fica vermelho e as consultas continuam, com intervalo crescente até 1 min. Ao voltar, pedidos que chegaram durante a queda são avisados **uma vez, em grupo** (“3 pedidos novos — chegaram enquanto o painel estava sem conexão”). O histórico antigo não é repetido.
6. Voltar para a aba ou recuperar a internet dispara uma consulta imediata. Os navegadores atrasam timers em abas de segundo plano, até cerca de 1 min.

**O que acontece com um pedido novo:** faixa no topo (“Novo pedido PS-…” + **Abrir pedido**), destaque dourado na lista, contador no menu **Pedidos**, nas abas e no título da aba do navegador (“(2) Pedidos · …”), e o som, se ativado.

**Som** (Web Audio, gerado no navegador; não há arquivo de áudio):

- Navegadores só permitem áudio depois de uma interação da pessoa com a página. Por isso existe o botão **Ativar som** no topo: ele libera o áudio no próprio clique e toca um aviso de teste.
- Os estados são reais: **Som ativado** significa que o navegador liberou o áudio; **Som bloqueado** significa que o som está ligado, mas o navegador aguarda um clique (acontece ao recarregar a página — qualquer clique libera). Se o som não puder tocar quando chegar um pedido, a faixa diz isso.
- O painel não consegue saber se o alto-falante está ligado: “ativado” quer dizer “o navegador permitiu tocar”.
- O aviso toca uma vez por lote de pedidos novos (duas notas curtas, repetidas duas vezes). Não há ciclo infinito.
- A preferência fica salva no navegador. **Silenciar avisos sonoros** desliga.
- Opcional: **Notificar também com a aba em segundo plano** usa a notificação do sistema operacional, só com código, total e modalidade, sem dados do cliente.
- **Limite:** com o painel fechado ou o computador suspenso, nada toca. Para avisos com tudo fechado seria preciso Web Push ou a API oficial do WhatsApp Business (não implementados; ver pendências).

## Mensagens de atualização para o cliente

**Como era:** o WhatsApp só servia para o cliente enviar o pedido (link `wa.me` com o texto do pedido) e para o painel abrir uma conversa vazia. Não existe integração com a API oficial do WhatsApp Business no projeto, e nenhuma foi inventada.

**Como funciona agora** (seção **Comunicação com o cliente** em cada pedido):

1. A mudança de status é salva primeiro, no servidor. Só depois o painel mostra a mensagem sugerida para o novo status, gerada pela API com o primeiro nome e o código do pedido.
2. **Enviar atualização pelo WhatsApp** abre `wa.me/<telefone do cliente com 55>?text=<mensagem codificada>`. A pessoa revisa e toca em enviar no WhatsApp.
3. O sistema registra **“WhatsApp aberto”** (por quem, quando e quantas vezes) — **não** registra “enviada”. Se a pessoa enviou, pode clicar em **Já enviei esta mensagem**, e o registro passa a “Enviada (informado pela loja)”, com autor e horário. “Entregue” nunca aparece, porque sem a API oficial isso não pode ser comprovado.
4. Há uma linha por pedido e status. Cliques repetidos só aumentam o contador, e o botão passa a “Abrir no WhatsApp novamente”, para evitar mensagens duplicadas sem perceber.
5. Mudar o status **nunca** envia nada sozinho.

Mensagens por status (editáveis em **Configurações → Mensagens do WhatsApp → Avisos de andamento ao cliente**; marcadores `{nome}`, `{pedido}`, `{loja}`):

| Status | Mensagem padrão |
| --- | --- |
| Aceito | Olá, {nome}! Seu pedido {pedido} foi aceito e já estamos separando tudo. Obrigado pela preferência! |
| Em separação | Olá, {nome}! Seu pedido {pedido} está em separação. Avisaremos assim que estiver pronto. |
| Pronto (retirada) | Olá, {nome}! Seu pedido {pedido} está pronto para retirada. Aguardamos você na loja! |
| Pronto (entrega) | Olá, {nome}! Seu pedido {pedido} está pronto e logo sairá para entrega. |
| Saiu para entrega (só entrega) | Olá, {nome}! Seu pedido {pedido} saiu para entrega. Em breve ele chegará até você. |
| Concluído | Olá, {nome}! Seu pedido {pedido} foi concluído. Obrigado pela preferência! |
| Cancelado | Olá, {nome}. Houve um cancelamento no pedido {pedido}. Entre em contato conosco caso precise de ajuda. |

Pedido novo e expirado não têm mensagem: no primeiro o cliente acabou de enviar o pedido; no segundo não houve atendimento.

## Como testar manualmente

Pré-requisitos: painel aberto com um administrador e a loja aberta em outra janela (pode ser no celular).

1. **Aviso de pedido novo**
   1. No painel, clique em **Ativar som**. Deve tocar o aviso de teste e o botão deve mudar para “Som ativado”.
   2. Na loja, faça um pedido e finalize.
   3. Sem recarregar o painel: em até ~15 s devem aparecer a faixa “Novo pedido PS-…”, o som, o pedido destacado em **Pedidos**, o contador no menu e “(1)” no título da aba.
   4. Espere 30 s: o som **não** deve tocar de novo para o mesmo pedido.
   5. Recarregue o painel: o botão deve mostrar “Som bloqueado”. Clique em qualquer lugar e ele volta a “Som ativado”. Pedidos já existentes não tocam.
2. **Sem conexão**: com o painel aberto, desligue o Wi-Fi. O topo deve mostrar “Sem conexão — tentando novamente”. Faça um pedido por outro aparelho e religue o Wi-Fi: o aviso aparece uma vez.
3. **Fluxo de retirada**: abra o pedido → **Aceitar pedido** (um clique) → **Iniciar separação** → **Marcar como pronto para retirada** → **Concluir (cliente retirou)** (pede confirmação). Não deve existir “Saiu para entrega”.
4. **Fluxo de entrega**: faça um pedido com entrega → aceite → … → **Marcar como pronto para envio** → **Avisar que saiu para entrega** → **Concluir pedido**.
5. **Mensagem ao cliente**: depois de cada etapa, confira a mensagem sugerida (nome e código corretos), clique em **Enviar atualização pelo WhatsApp** e confirme que o WhatsApp abre no número do cliente com o texto. De volta ao painel, deve aparecer “WhatsApp aberto … O sistema não sabe se a mensagem foi enviada”. Clique em **Já enviei esta mensagem** e confira o registro com seu nome.
6. **Dois atendentes**: abra o mesmo pedido em dois navegadores. Aceite em um; no outro, sem recarregar, clique em **Cancelar pedido**. A ação deve ser recusada com a mensagem de que o pedido já está “Aceito”, e a tela deve se atualizar.
7. **Cancelamento e estoque**: anote o saldo do produto em **Estoque**, cancele um pedido (motivo obrigatório) e confira o saldo devolvido e a linha “Devolução de pedido cancelado” no histórico de movimentações.
