const { expect, test } = require('@playwright/test');

test('unauthenticated visitor is redirected to sign in', async ({ page }) => {
  for (const path of ['/', '/admin', '/admin/clients', '/client']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  await expect(page.getByRole('heading', { name: 'SEO Automation Dashboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('a forged session cookie cannot open the admin portal', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'seo_session', value: 'forged.token.value', url: baseURL }]);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
});
