import { test, expect } from '@playwright/test';

/** Загрузка демо-ассортимента (5 SKU), базовый шаг для сценариев с данными */
async function loadDemo(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('nav-assortment').click();
  await page.getByTestId('btn-load-demo').click();
  await expect(page.getByRole('cell', { name: 'SKU001', exact: true })).toBeVisible();
}

test('вкладка «Товары» сохраняется после перезагрузки', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-assortment').click();
  await expect(page.getByTestId('btn-load-demo')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('btn-load-demo')).toBeVisible();
});

test('демо-данные: таблица, карточка товара, кнопка WB', async ({ page }) => {
  await loadDemo(page);
  await page.locator('table tbody tr').first().click();
  await expect(page.getByRole('heading', { name: 'Остатки по складам' })).toBeVisible();
  await expect(page.getByTestId('btn-refresh-wb')).toBeVisible();
  await expect(page.getByText('Нет положительных остатков')).toBeVisible();
});

test('дашборд и панель риска после демо', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('nav-dashboard').click();
  await expect(page.getByTestId('risk-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Панель управления запасами' })).toBeVisible();
});

test('ABC-анализ после демо', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('nav-abc').click();
  await expect(page.getByRole('heading', { name: 'ABC-анализ ассортимента' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Категория A/ }).first()).toBeVisible();
});

test('сценарии: ML-переключение и ответ локального API прогнозов', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('nav-scenarios').click();
  await expect(page.getByRole('heading', { name: 'Сценарный анализ', exact: true })).toBeVisible();
  const fx = page.waitForResponse(
    (r) => r.url().includes('/api/forecasts') && r.request().method() === 'GET'
  );
  await page.getByTestId('forecast-source-toggle').click();
  const resp = await fx;
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.source).toBe('disabled');
  await expect(page.getByTestId('forecast-disabled-notice')).toBeVisible();
  await expect(page.getByText('Результаты по сценариям')).toBeVisible();
});

test('портфель в сценариях: вкладка и заглушка прогнозов', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('nav-scenarios').click();
  await page.getByRole('button', { name: 'Портфельная оптимизация' }).click();
  await page.getByTestId('forecast-source-toggle-portfolio').click();
  await expect(page.getByTestId('forecast-disabled-notice-portfolio')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Получить рекомендации' })).toBeVisible();
});

test('анализ товара из таблицы', async ({ page }) => {
  await loadDemo(page);
  await page.locator('table tbody tr').first().getByRole('button', { name: 'Анализ', exact: true }).click();
  await expect(page.getByTestId('nav-productAnalysis')).toBeVisible();
  await expect(page.getByTestId('product-analysis-title')).toContainText('SKU001');
});

test('поставки: календарь открывается', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-supplies').click();
  await expect(page.getByRole('heading', { name: 'Поставки' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Календарь приемок' })).toBeVisible();
});

test('данные: экспорт JSON', async ({ page }) => {
  await loadDemo(page);
  await page.getByTestId('nav-export').click();
  await expect(page.getByRole('button', { name: 'Экспорт в JSON' })).toBeVisible();
});

test('локальный backend /api/health', async ({ request }) => {
  const res = await request.get('http://127.0.0.1:3001/api/health');
  expect(res.ok()).toBeTruthy();
  const j = await res.json();
  expect(j.ok).toBeTruthy();
});

test('локальный backend /api/fx (кэш или ЦБР)', async ({ request }) => {
  const res = await request.get(
    'http://127.0.0.1:3001/api/fx?currency=USD&dateISO=2024-06-01T00:00:00.000Z'
  );
  expect(res.ok()).toBeTruthy();
  const j = await res.json();
  expect(typeof j.rate).toBe('number');
  expect(j.rate).toBeGreaterThan(0);
});
