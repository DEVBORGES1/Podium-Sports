import { expect, test } from '@playwright/test';

test.describe('loja pública', () => {
  test('página inicial carrega banners, destaques e categorias do banco', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: /Supere/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Destaques' }).getByRole('link', { name: 'Chuteira F50 Messi' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Suplementos Ver produtos/ })).toBeVisible();
  });

  test('busca sem acento e filtro por categoria', async ({ page }) => {
    await page.goto('/produtos?q=pre treino');
    await expect(page.getByRole('link', { name: 'Pré-treino Night Train 300g' })).toBeVisible();
    await page.goto('/produtos?categoria=goleiro');
    await expect(page.getByText('3 produtos')).toBeVisible();
  });

  test('migra a sacola salva pela versão HTML antiga', async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('migrated-once')) {
        localStorage.setItem('podium_sacola', JSON.stringify({ '10': 2 }));
        localStorage.setItem('migrated-once', '1');
      }
    });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Sacola, 2 itens' })).toBeVisible();
  });

  test('compra completa: sacola → checkout → pedido registrado → link do WhatsApp', async ({ page }) => {
    await page.goto('/produto/chuteira-f50-messi');
    await expect(page.getByRole('heading', { name: 'Chuteira F50 Messi' })).toBeVisible();
    await page.getByRole('button', { name: 'Adicionar à sacola' }).click();
    await page.getByRole('button', { name: /Sacola, 1 item/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Sua sacola' });
    await expect(drawer.getByText('R$ 399,90').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: /Sacola, 1 item/ }).click();
    await drawer.getByRole('button', { name: 'Finalizar pedido' }).click();

    await page.getByLabel('Nome').fill('Cliente E2E');
    await page.getByLabel('WhatsApp / telefone').fill('49988887777');
    await page.getByLabel(/Tamanho, cor, sabor/).fill('Tamanho 41');
    await page.getByRole('button', { name: /Revisar pedido/ }).click();
    await page.getByRole('button', { name: 'Confirmar pedido' }).click();

    await expect(page).toHaveURL(/\/pedido\/PS-[A-Z0-9]{6}$/);
    const code = page.url().split('/').pop()!;
    const link = page.getByRole('link', { name: 'Enviar pedido pelo WhatsApp' });
    const href = decodeURIComponent((await link.getAttribute('href'))!);
    expect(href).toContain('https://wa.me/554998090818?text=');
    expect(href).toContain(`*Pedido ${code}*`);
    expect(href).toContain('1x Chuteira F50 Messi');
    expect(href).toContain('*Total: R$');
    expect(href).toContain('Observações: Tamanho 41');

    // Recarregar a página mantém a confirmação (token guardado neste navegador).
    await page.reload();
    await expect(page.getByText(code)).toBeVisible();
    await expect(page.getByRole('button', { name: /Sacola, 0 itens/ })).toBeVisible();
  });

  test('rota inexistente mostra 404', async ({ page }) => {
    await page.goto('/nao-existe');
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
  });
});
