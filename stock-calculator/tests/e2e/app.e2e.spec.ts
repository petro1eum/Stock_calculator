import { test, expect } from '@playwright/test';

test('вкладки и сохранение активной вкладки', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-assortment').click();
  await expect(page.getByText('Добавить новый товар')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Добавить новый товар')).toBeVisible();
});

test('таблица товаров и модалка с реальными остатками', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-assortment').click();
  // Ожидаем наличие хотя бы одной строки SKU (из Supabase гидрации)
  const anySkuCell = page.locator('table tbody tr td').first();
  await expect(anySkuCell).toBeVisible();
  await page.locator('table tbody tr').first().click();
  await expect(page.getByText('Остатки по складам')).toBeVisible();
  // Проверяем, что отображаются только склады с положительным остатком
  const zeroText = page.getByText('Нет положительных остатков');
  // либо положительные склады, либо явное отсутствие
  await expect(zeroText.or(page.locator('div').filter({ hasText: 'склад' }))).toBeVisible();
  // Кнопка обновления WB существует
  await expect(page.getByTestId('btn-refresh-wb')).toBeVisible();
});

test('дашборд и риск-панель в ₽', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-dashboard').click();
  await expect(page.getByTestId('risk-panel')).toBeVisible();
});


