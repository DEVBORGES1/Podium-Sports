import { expect, test, type Page } from '@playwright/test';
import { login, USERS } from './auth';

async function placeOrder(page: Page, slug: string, name = 'Cliente Painel') {
  await page.goto(`/produto/${slug}`);
  await page.getByRole('button', { name: 'Comprar agora' }).click();
  await page.getByLabel('Nome').fill(name);
  await page.getByLabel('WhatsApp / telefone').fill('49977776666');
  await page.getByRole('button', { name: /Revisar pedido/ }).click();
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();
  await expect(page).toHaveURL(/\/pedido\//);
  return page.url().split('/').pop()!;
}

test.describe('acesso ao painel', () => {
  test('rotas do painel exigem login', async ({ page }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('senha incorreta mostra erro', async ({ page }) => {
    await login(page, USERS.owner.email, 'errada');
    await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');
  });

  test('usuário autenticado sem perfil administrativo é bloqueado pela API', async ({ page }) => {
    await login(page, USERS.stranger.email);
    await expect(page.getByRole('alert')).toContainText('não possui acesso administrativo');
  });

  test('administrador comum não vê usuários nem auditoria', async ({ page }) => {
    await login(page, USERS.staff.email);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin$/);
  });
});

test.describe('operação da loja', () => {
  test('produto criado no painel aparece na loja com o preço definido', async ({ page }) => {
    await login(page, USERS.owner.email);
    await page.getByRole('link', { name: 'Produtos' }).click();
    await page.getByRole('link', { name: '+ Novo produto' }).click();
    await page.getByLabel('Nome').fill('Bola Oficial E2E');
    await page.getByLabel('Categoria').selectOption({ label: 'Futebol' });
    await page.getByLabel('Preço', { exact: true }).fill('149,90');
    await page.getByLabel('Estoque inicial').fill('7');
    await page.getByRole('button', { name: 'Criar produto' }).click();
    await expect(page.getByText('Produto criado.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bola Oficial E2E' })).toBeVisible();

    await page.goto('/produto/bola-oficial-e2e');
    await expect(page.getByRole('heading', { name: 'Bola Oficial E2E' })).toBeVisible();
    await expect(page.getByText('R$ 149,90')).toBeVisible();
  });

  test('pedido: aceitar, marcar pago e ver no dashboard; cancelar devolve estoque', async ({ page }) => {
    const code = await placeOrder(page, 'umbro-pro-5-shark');
    await login(page, USERS.owner.email);
    await page.getByRole('link', { name: 'Pedidos' }).click();
    await page.getByRole('link', { name: code }).click();
    await expect(page.getByRole('heading', { name: new RegExp(code) })).toBeVisible();

    await page.getByRole('button', { name: 'Aceitar pedido' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Confirmar|Aceitar/ }).last().click();
    await expect(page.getByText('Aceito').first()).toBeVisible();

    await page.getByRole('button', { name: 'Marcar como pago' }).click();
    await page.getByRole('dialog').getByRole('button').last().click();
    await expect(page.getByText(/^Pago$/).first()).toBeVisible();

    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByText('Receita confirmada').first()).toBeVisible();
    await expect(page.locator('.kpi', { hasText: 'Receita confirmada' })).toContainText('R$ 699,90');

    const second = await placeOrder(page, 'nike-quest-6', 'Cancelamento');
    await page.goto('/admin/inventory?q=nike quest 6');
    await expect(page.getByRole('cell', { name: '9', exact: true }).first()).toBeVisible();
    await page.goto('/admin/orders');
    await page.getByRole('link', { name: second }).click();
    await page.getByRole('button', { name: 'Cancelar pedido' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('Cliente desistiu');
    await dialog.getByRole('button').last().click();
    await expect(page.getByText('Cancelado').first()).toBeVisible();
    await page.goto('/admin/inventory?q=nike quest 6');
    await expect(page.getByRole('cell', { name: '10', exact: true }).first()).toBeVisible();
  });

  test('entrada de estoque fica registrada no histórico', async ({ page }) => {
    await login(page, USERS.staff.email);
    await page.goto('/admin/inventory?q=luva training infantil');
    await page.getByRole('button', { name: /Movimentar/ }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Tipo/).selectOption('IN');
    await dialog.getByLabel(/Quantidade/).fill('5');
    await dialog.getByLabel(/Motivo|Justificativa/).fill('NF 1234');
    await dialog.getByRole('button', { name: /Registrar|Salvar|Confirmar/ }).click();
    await expect(page.getByRole('cell', { name: '15', exact: true }).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Movimentações' }).click();
    await expect(page.getByRole('cell', { name: 'NF 1234' })).toBeVisible();
  });

  test('promoção vigente altera o preço da loja', async ({ page }) => {
    await login(page, USERS.owner.email);
    await page.getByRole('link', { name: 'Promoções' }).click();
    await page.getByRole('link', { name: /Nova promoção/ }).click();
    await page.getByLabel('Nome').fill('Semana do Whey');
    await page.getByLabel(/Tipo de desconto/).selectOption('PERCENTAGE');
    await page.getByLabel(/Percentual|Desconto \(%\)|Valor/).first().fill('10');
    const start = new Date(Date.now() - 3600_000);
    const end = new Date(Date.now() + 7 * 86_400_000);
    const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByLabel(/Início/).fill(local(start));
    await page.getByLabel(/Fim|Término/).fill(local(end));
    await page.getByPlaceholder(/Buscar/).fill('100% Whey Max');
    await page.getByRole('checkbox', { name: /100% Whey Max Titanium 900g/ }).check();
    await page.getByRole('button', { name: /Criar promoção|Salvar/ }).click();
    await expect(page).toHaveURL(/\/admin\/promotions$/);
    await expect(page.getByText('Semana do Whey')).toBeVisible();

    await page.goto('/produto/100-whey-max-titanium-900g');
    await expect(page.getByText('R$ 197,91')).toBeVisible();
    await expect(page.getByText(/Semana do Whey/)).toBeVisible();
  });

  test('banner criado aparece no carrossel', async ({ page }) => {
    await login(page, USERS.owner.email);
    await page.getByRole('link', { name: 'Banners' }).click();
    await page.getByRole('link', { name: /Novo banner/ }).click();
    await page.getByLabel('Título', { exact: true }).fill('Black Friday');
    await page.getByLabel(/Destaque/).first().fill('Podium');
    await page.getByRole('button', { name: /Criar banner|Salvar/ }).click();
    await expect(page).toHaveURL(/\/admin\/banners$/);
    await page.goto('/');
    // Slides inativos ficam fora da árvore de acessibilidade (inert); conferimos pelo DOM.
    await expect(page.locator('.slide', { hasText: 'Black Friday' })).toHaveCount(1);
    await expect(page.locator('.slide')).toHaveCount(5);
  });

  test('configurações: novo número do WhatsApp é usado pela loja', async ({ page }) => {
    await login(page, USERS.owner.email);
    await page.getByRole('link', { name: 'Configurações' }).click();
    const field = page.getByLabel(/Número do WhatsApp|WhatsApp/).first();
    await field.fill('5549911112222');
    await page.getByRole('button', { name: /Salvar/ }).first().click();
    await expect(page.getByText(/salv/i).first()).toBeVisible();
    await page.goto('/');
    for (const link of await page.getByRole('link', { name: /Falar no WhatsApp/ }).all()) {
      await expect(link).toHaveAttribute('href', /wa\.me\/5549911112222/);
    }
  });
});
