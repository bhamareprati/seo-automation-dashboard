import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const { SignJWT } = require('jose');
const {
  requireAuditAccess,
  requireRole,
  sessionCookie,
  signSession,
  verifySession,
} = require('../../src/lib/auth.js');
const { handleLogin, handleLogout } = require('../../src/lib/handlers/auth.js');
const { message } = require('../../src/lib/messages.js');

const SECRET = 's'.repeat(32);
const env = {
  ADMIN_EMAIL: 'admin@demo.test',
  ADMIN_PASSWORD_HASH: bcrypt.hashSync('admin-pass', 4),
  CLIENT_PASSWORD_HASH: bcrypt.hashSync('client-pass', 4),
  SESSION_SECRET: SECRET,
  APP_URL: 'https://app.example.test',
};
const findClientByEmail = vi.fn(async (email) => (email === 'client@demo.test' ? { id: 'client-1' } : null));
const deps = { env, findClientByEmail };

const loginRequest = (body, headers = {}) =>
  new Request('https://app.example.test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const cookieToken = (response) => response.headers.get('set-cookie').match(/seo_session=([^;]+)/)[1];

describe('sign-in', () => {
  it('admin login succeeds', async () => {
    const res = await handleLogin(loginRequest({ email: 'ADMIN@demo.test ', password: 'admin-pass' }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'admin' });
    expect(await verifySession(cookieToken(res), SECRET)).toEqual({ role: 'admin' });
  });

  it('client login succeeds', async () => {
    const res = await handleLogin(loginRequest({ email: 'client@demo.test', password: 'client-pass' }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: 'client' });
    expect(await verifySession(cookieToken(res), SECRET)).toEqual({ role: 'client', clientId: 'client-1' });
  });

  it('wrong password gets a generic error', async () => {
    const attempts = [
      { email: 'admin@demo.test', password: 'wrong' },
      { email: 'client@demo.test', password: 'wrong' },
      { email: 'nobody@demo.test', password: 'client-pass' },
    ];
    for (const attempt of attempts) {
      const res = await handleLogin(loginRequest(attempt), deps);
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe(message('M-LOGIN-FAIL'));
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('an incomplete login body gets a 400', async () => {
    const res = await handleLogin(loginRequest({ email: 'admin@demo.test' }), deps);
    expect(res.status).toBe(400);
  });

  it('POST with foreign Origin is rejected', async () => {
    const foreign = { origin: 'https://evil.example.test' };
    const login = await handleLogin(loginRequest({ email: 'admin@demo.test', password: 'admin-pass' }, foreign), deps);
    expect(login.status).toBe(403);
    const logout = await handleLogout(
      new Request('https://app.example.test/api/auth/logout', { method: 'POST', headers: foreign }),
      deps,
    );
    expect(logout.status).toBe(403);
    const sameSite = await handleLogin(
      loginRequest({ email: 'admin@demo.test', password: 'admin-pass' }, { origin: 'https://app.example.test' }),
      deps,
    );
    expect(sameSite.status).toBe(200);
  });
});

describe('sessions', () => {
  it('tampered session is rejected', async () => {
    const token = await signSession({ role: 'client', clientId: 'client-1' }, SECRET);
    const [header, payload, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ role: 'admin' })).toString('base64url');
    expect(await verifySession(`${header}.${forged}.${signature}`, SECRET)).toBeNull();
    expect(await verifySession(`${header}.${payload}.AAAA`, SECRET)).toBeNull();
    expect(await verifySession(token, 'x'.repeat(32))).toBeNull();
    expect(await verifySession(null, SECRET)).toBeNull();
  });

  it('expired session is rejected', async () => {
    const expired = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySession(expired, SECRET)).toBeNull();
  });

  it('session cookie is HttpOnly, SameSite and Secure on https', () => {
    const cookie = sessionCookie('t', env);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(sessionCookie('t', { APP_URL: 'http://localhost:3000' })).not.toContain('Secure');
  });
});

describe('access rules', () => {
  it('requireRole rejects a missing session and the wrong role', () => {
    expect(() => requireRole(null, 'admin')).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => requireRole({ role: 'client', clientId: 'c' }, 'admin')).toThrow(expect.objectContaining({ status: 403 }));
    expect(requireRole({ role: 'admin' }, 'admin')).toEqual({ role: 'admin' });
  });

  it('requireAuditAccess limits a client to their own audits', () => {
    const audit = { clientId: 'client-1' };
    expect(() => requireAuditAccess({ role: 'client', clientId: 'client-2' }, audit)).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(requireAuditAccess({ role: 'client', clientId: 'client-1' }, audit)).toBeTruthy();
    expect(requireAuditAccess({ role: 'admin' }, audit)).toBeTruthy();
    expect(() => requireAuditAccess(null, audit)).toThrow(expect.objectContaining({ status: 401 }));
  });
});
