const { expect, test } = require('@playwright/test');
const { signIn } = require('./helpers');

/** Starts an audit for a client from the clients page and waits for it to finish. Returns its URL. */
async function runAudit(page, clientName) {
  await page.goto('/admin/clients');
  const row = page.getByRole('row', { name: new RegExp(clientName) });
  await row.getByRole('button', { name: /Run (audit|again)/ }).click();
  await expect(page).toHaveURL(/\/admin\/audits\/\w+$/);
  await expect(page.getByTestId('audit-status')).toHaveText('Complete', { timeout: 150000 });
  return page.url();
}

test('admin downloads the PDF and sees every tab', async ({ page }) => {
  await signIn(page, 'admin@demo.test');
  await expect(page).toHaveURL(/\/admin$/);
  await runAudit(page, 'Example Dental Clinic');

  const report = page.getByRole('tab', { name: 'Report' });
  await expect(report).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Your website scored 58 out of 100.')).toBeVisible();
  await expect(page.getByTestId('sample-data-notice')).toBeVisible();
  await expect(page.getByTestId('keyword-rank')).toContainText('ranks 4,');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download PDF' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^seo-report-example-dental-clinic-\d{4}-\d{2}-\d{2}\.pdf$/);

  await page.getByRole('tab', { name: 'Claude JSON' }).click();
  await expect(page.getByTestId('json-source')).toContainText('Sample analysis');
  await expect(page.getByRole('tabpanel')).toContainText('"audit_version": "v1.0"');

  await page.getByRole('tab', { name: 'Delivery' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('mock_sent');
  await expect(page.getByRole('tabpanel')).toContainText('WhatsApp');

  await page.getByRole('tab', { name: 'Job' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('seo-audit-jobs');

  await page.getByRole('tab', { name: 'Signals' }).click();
  await page.getByText('On-page', { exact: true }).click();
  await expect(page.getByRole('tabpanel')).toContainText('titleLength');
});

test('client sees only their own report', async ({ page, request }) => {
  await signIn(page, 'admin@demo.test');
  await expect(page).toHaveURL(/\/admin$/);
  const auditUrl = await runAudit(page, 'Example Dental Clinic');
  const auditId = auditUrl.split('/').pop();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, 'client@demo.test');
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByRole('heading', { name: 'Your website scored 58 out of 100.' })).toBeVisible();
  await expect(page.getByText('How we\'ll know it worked:').first()).toBeVisible();
  await expect(page.getByTestId('sample-data-notice')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download PDF' }).click()]);
  expect(download.suggestedFilename()).toContain('example-dental-clinic');
  for (const internal of ['Claude JSON', 'Signals', 'Job ID', 'seo-audit-jobs']) {
    await expect(page.getByText(internal)).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await signIn(page, 'client3@demo.test');
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByText('Overdue Dental').first()).toBeVisible();
  await expect(page.getByText('Example Dental Clinic')).toHaveCount(0);
  const context = page.context();
  const other = await context.request.get(`/api/audit/${auditId}`);
  expect(other.status()).toBe(403);
  const otherPdf = await context.request.get(`/api/audit/${auditId}/report`);
  expect(otherPdf.status()).toBe(403);
});

test('the worklist summarises the state of the work', async ({ page }) => {
  await signIn(page, 'admin@demo.test');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('finished this month');
  await expect(page.getByRole('heading', { name: 'Running now' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently finished' })).toBeVisible();
});

test('adding a client explains what is wrong', async ({ page }) => {
  await signIn(page, 'admin@demo.test');
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/clients');
  await page.getByRole('button', { name: 'Add client' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Should not be saved');
  await dialog.getByLabel('Website address').fill('http://169.254.169.254/');
  await dialog.getByLabel('City').fill('Pune');
  await dialog.getByLabel('State').fill('Maharashtra');
  await dialog.getByRole('button', { name: 'Add client' }).click();
  await expect(dialog.getByRole('alert')).toHaveText("This address can't be audited because it points to a private network.");
  await dialog.getByLabel('Website address').fill('example.com');
  await dialog.getByRole('button', { name: 'Add client' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a full website address starting with http:// or https://.');
});

test('a phone-sized client page has no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signIn(page, 'client@demo.test');
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
