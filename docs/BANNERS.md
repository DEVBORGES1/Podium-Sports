# Banners da página inicial

Editor em `/admin/banners/:id`, organizado em abas, com a prévia ao lado (**Computador** / **Celular**):

| Aba | O que a loja configura |
| --- | --- |
| Conteúdo | selo promocional (pode ser ocultado sem perder o texto), título + destaque, subtítulo, preço original e promocional (o desconto é calculado sozinho e só aparece se o original for maior), texto complementar |
| Botões | texto do botão e **o que acontece ao clicar**: um produto (busca com foto e preço), uma categoria, uma página da loja, um link externo `https://` ou uma conversa no WhatsApp com mensagem inicial. Botão secundário com interruptor: desligado, some da loja sem perder o que foi preenchido |
| Imagem | envio da foto, **foto opcional só para o celular**, formato (**produto ao lado do texto** ou **foto de fundo**), enquadramento por dispositivo: mostrar a imagem inteira ou preencher o espaço, zoom, arrastar a imagem na prévia (mouse, toque ou setas do teclado), centralizar e restaurar |
| Aparência | cor de destaque e de fundo, cor atrás da foto (detectada automaticamente no envio), posição do texto, escurecimento da foto, avisos de contraste; opções avançadas: ícone e selo redondo para banners sem foto |
| Publicação | ativo, ordem e período |

Há aviso de alterações não salvas (ao sair da página ou fechar a aba) e o botão **Descartar alterações** com confirmação.

## Como funciona

- **Mesma marcação na loja e na prévia.** `components/store/BannerSlide.tsx` desenha o slide nos dois lugares. O layout responde à largura do próprio banner (*container queries*, `@container hero`), e a prévia desenha o banner em 1440 px (notebook) ou 390 px (celular) e o reduz com `zoom`. O que a loja vê é o que o painel mostra.
- **Celular:** a imagem fica sempre acima do texto, então o produto nunca fica encoberto. **Computador:** texto e produto lado a lado (`split`) ou foto de fundo com escurecimento do lado do texto (`full`).
- **Foto exclusiva do celular (opcional).** Quando a foto do computador fica ruim no celular (ex.: foto larga com o produto pequeno num canto), a loja envia uma segunda foto em **Imagem → Foto para celular**. No celular a imagem fica acima do texto, no formato 16:10 (foto de fundo, recomendado 1200 × 750 px) ou 4:3 (produto ao lado do texto, 1200 × 900 px). Na loja, a foto é escolhida pela largura da tela (< 760 px = celular, o mesmo limite do layout do banner), e **cada aparelho baixa só a própria foto**. Não usamos `<picture>` porque o React define o `src` do `<img>` antes de colocá-lo no `<picture>`, e o navegador baixaria as duas. A foto do celular tem enquadramento próprio (`image_frame.mobile`; sem ajuste salvo, vale o padrão do formato, nunca o ajuste feito para a foto do computador) e cor de fundo própria (`mobile_image_bg`, detectada no envio). Sem foto do celular, tudo funciona como antes. Remover a foto principal remove também a do celular, e o servidor recusa foto de celular sem foto principal. Fotos trocadas ou removidas saem do Storage.
- **Enquadramento sem alterar o arquivo.** A foto original não é recortada. `image_frame` guarda `{ desktop, mobile }`, cada um com `{ mode: fill | fit, x, y, zoom }`. O CSS aplica `object-fit`, `object-position: x% y%` e `transform: scale(zoom)` com `transform-origin` no mesmo ponto. Assim, a posição vale para qualquer zoom e o modo "preencher" nunca deixa faixas vazias. `mobile: null` = usa o ajuste do computador.
- **Destinos sem endereços digitados.** `button_target` / `secondary_button_target` guardam o destino (`product`, `category`, `page`, `external`, `whatsapp`). O servidor (`banners.targets.ts`) monta o endereço com as rotas reais da loja e o **slug atual**: renomear o produto não quebra o botão. Produto/categoria excluído ou desativado tira o botão da loja, e o painel avisa na lista e no editor. `button_url` continua salvo com o endereço gerado, como referência.

## Compatibilidade com banners antigos

As migrações `20261012150000_banner_editor` e `20261013120000_banner_mobile_image` só **adicionam** colunas. Banners antigos ficam com `button_target` nulo, `layout = 'full'`, `overlay = 85` e `image_frame` nulo (foto centralizada), que reproduz o visual anterior. Os links antigos continuam funcionando. Ao abrir o banner no editor, caminhos como `/produto/<slug>` ou `/produtos?categoria=<slug>` já aparecem convertidos no seletor; um endereço sem correspondência continua valendo e é sinalizado para revisão.

## Regras validadas no servidor

- Destinos: Zod `strict`; produto/categoria precisa existir; link externo só `https://` com domínio e sem usuário/senha; a mensagem do WhatsApp é codificada.
- Texto e destino do botão andam juntos (o secundário só é exigido quando ligado).
- Preço original > promocional, valores positivos; enquadramento `x`/`y` entre 0 e 100 e zoom entre 1 e 3; escurecimento 0–90%. As mesmas regras existem como `CHECK` no banco.
