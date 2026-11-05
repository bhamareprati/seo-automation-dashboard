const { expect, test } = require('@playwright/test');
const { signIn } = require('./helpers');

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

test('admin signs in and reaches the worklist', async ({ page }) => {
  await signIn(page, 'admin@demo.test');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Worklist' })).toBeVisible();
});

test('client signs in and sees their business name from the database', async ({ page }) => {
  await signIn(page, 'client@demo.test');
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByText('Example Dental Clinic')).toBeVisible();
});

test('each client sees their own business name', async ({ page }) => {
  await signIn(page, 'client2@demo.test');
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByText('Demo Client')).toBeVisible();
  await expect(page.getByText('Example Dental Clinic')).toHaveCount(0);
});

test('a signed-in client is kept out of the admin portal', async ({ page }) => {
  await signIn(page, 'client@demo.test');
  await expect(page).toHaveURL(/\/client$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/client$/);
});

test('a wrong password shows the catalogue message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('client@demo.test');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Scoped to the form, because Next.js adds its own role="alert" route announcer to every page.
  await expect(page.locator('form').getByRole('alert')).toHaveText(
    "That email and password don't match. Check them and try again.",
  );
  await expect(page).toHaveURL(/\/login$/);
});

test('signing out ends the session', async ({ page }) => {
  await signIn(page, 'admin@demo.test');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
});
