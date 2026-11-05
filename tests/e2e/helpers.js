const fs = require('node:fs');

// Demo logins live in the README, as the spec asks.
const readme = fs.readFileSync('README.md', 'utf8');
const passwordFor = (email) => readme.match(new RegExp(`\\| ${email} \\| (\\S+) \\|`))[1];

async function signIn(page, email) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(passwordFor(email));
  await page.getByRole('button', { name: 'Sign in' }).click();
}

module.exports = { passwordFor, signIn };
