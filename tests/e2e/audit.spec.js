const { expect, test } = require('@playwright/test');
const { signIn } = require('./helpers');

test('admin runs an audit and sees progress', async ({ page }) => {
  await signIn(page, 'admin@demo.test');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: 'Clients' }).click();
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

  const row = page.getByRole('row', { name: /Example Dental Clinic/ });
  const startedAt = Date.now();
  await row.getByRole('button', { name: /Run (audit|again)/ }).click();
  await expect(page).toHaveURL(/\/admin\/audits\/\w+$/);
  expect(Date.now() - startedAt, 'the page opens without waiting for the audit').toBeLessThan(10000);

  // Watch the live progress bar until the audit finishes.
  const bar = page.getByRole('progressbar');
  const seen = new Set();
  await expect(async () => {
    seen.add(Number(await bar.getAttribute('aria-valuenow')));
    await expect(page.getByTestId('audit-status')).toHaveText('Complete', { timeout: 500 });
  }).toPass({ timeout: 150000, intervals: [500] });
  seen.add(Number(await bar.getAttribute('aria-valuenow')));

  const values = [...seen];
  expect(values.length, `progress values seen: ${values.join(', ')}`).toBeGreaterThan(2);
  expect(values, 'progress never goes backwards').toEqual([...values].sort((a, b) => a - b));
  expect(values.at(-1)).toBe(100);
});

test('the clients page shows each client', async ({ page }) => {
  await signIn(page, 'admin@demo.test');
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/clients');
  for (const name of ['Example Dental Clinic', 'Demo Client', 'Overdue Dental']) {
    await expect(page.getByRole('row', { name: new RegExp(name) })).toBeVisible();
  }
});
