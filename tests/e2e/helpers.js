const fs = require('node:fs');

// Demo passwords live in a local file that Git ignores, because this repository is public.
const logins = Object.fromEntries(
  fs
    .readFileSync('.env.test-logins', 'utf8')
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1).trim()];
    }),
);

const passwordFor = (email) => (email.startsWith('admin@') ? logins.E2E_ADMIN_PASSWORD : logins.E2E_CLIENT_PASSWORD);

async function signIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(passwordFor(email));
  await page.getByRole('button', { name: 'Sign in' }).click();
}

module.exports = { passwordFor, signIn };
