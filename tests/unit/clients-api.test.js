import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { signSession } = require('../../src/lib/auth.js');
const { handleCreateClient, handleListClients } = require('../../src/lib/handlers/clients.js');
const { message } = require('../../src/lib/messages.js');

const env = { SESSION_SECRET: 's'.repeat(32), APP_URL: 'https://app.example.test' };
const cookie = (session) => signSession(session, env.SESSION_SECRET).then((t) => `seo_session=${t}`);
const valid = { name: 'New Clinic', websiteUrl: 'https://New-Clinic.example/', businessType: 'Dental clinic', city: 'Pune', state: 'Maharashtra', whatsapp: '', email: '' };

const post = async (body, session = { role: 'admin' }, headers = {}) =>
  new Request('https://app.example.test/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(session ? { cookie: await cookie(session) } : {}), ...headers },
    body: JSON.stringify(body),
  });

const prismaOk = () => ({ client: { create: vi.fn(async () => ({ id: 'new' })), findMany: vi.fn(async () => []) } });

describe('POST /api/clients', () => {
  it('creates a client with a cleaned address and empty contacts as null', async () => {
    const prisma = prismaOk();
    const res = await handleCreateClient(await post(valid), { env, prisma });
    expect(res.status).toBe(201);
    expect(prisma.client.create.mock.calls[0][0].data).toMatchObject({
      websiteUrl: 'https://new-clinic.example',
      whatsapp: null,
      email: null,
    });
  });

  it('duplicate client URL returns 409', async () => {
    const prisma = prismaOk();
    prisma.client.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = await handleCreateClient(await post(valid), { env, prisma });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(message('M-CLIENT-DUP'));
  });

  it('refuses private addresses and bad input before touching the database', async () => {
    const prisma = prismaOk();
    const cases = [
      [{ ...valid, websiteUrl: 'http://169.254.169.254/' }, message('M-URL-BLOCKED')],
      [{ ...valid, websiteUrl: 'not a url' }, message('M-URL-INVALID')],
      [{ ...valid, name: ' ' }, message('M-FIELD-REQUIRED', { field: 'a name' })],
      [{ ...valid, city: '' }, message('M-FIELD-REQUIRED', { field: 'a city' })],
      [{ ...valid, businessType: 'Space travel' }, message('M-FIELD-REQUIRED', { field: 'a business type' })],
      [{ ...valid, email: 'nope' }, 'Enter a valid email address, or leave it empty.'],
    ];
    for (const [body, expected] of cases) {
      const res = await handleCreateClient(await post(body), { env, prisma });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error).toBe(expected);
    }
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('is for admins only, from this site only', async () => {
    const prisma = prismaOk();
    expect((await handleCreateClient(await post(valid, null), { env, prisma })).status).toBe(401);
    expect((await handleCreateClient(await post(valid, { role: 'client', clientId: 'c1' }), { env, prisma })).status).toBe(403);
    expect((await handleCreateClient(await post(valid, { role: 'admin' }, { origin: 'https://evil.example.test' }), { env, prisma })).status).toBe(403);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/clients', () => {
  it('is for admins only', async () => {
    const prisma = prismaOk();
    const request = async (session) =>
      new Request('https://app.example.test/api/clients', { headers: session ? { cookie: await cookie(session) } : {} });
    expect((await handleListClients(await request({ role: 'admin' }), { env, prisma })).status).toBe(200);
    expect((await handleListClients(await request({ role: 'client', clientId: 'c1' }), { env, prisma })).status).toBe(403);
    expect((await handleListClients(await request(null), { env, prisma })).status).toBe(401);
  });
});
