const { z } = require('zod');
const { getRequestSession, requireRole, requireSameOrigin } = require('../auth');
const { ConflictError, ValidationError, toErrorResponse } = require('../errors');
const { message } = require('../messages');
const { normalizeWebsiteUrl } = require('../url');

const BUSINESS_TYPES = ['Dental clinic', 'Healthcare', 'Real estate', 'Other'];
const FIELD_NAMES = {
  name: 'a name',
  websiteUrl: 'a website address',
  businessType: 'a business type',
  city: 'a city',
  state: 'a state',
};

const text = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => value || null);

const NewClient = z.object({
  name: text(120),
  websiteUrl: text(500),
  businessType: z.enum(BUSINESS_TYPES),
  city: text(80),
  state: text(80),
  whatsapp: optionalText(30),
  email: z
    .union([z.literal(''), z.email().max(200)])
    .optional()
    .nullable()
    .transform((value) => value || null),
});

function errorResponse(err) {
  const { status, body } = toErrorResponse(err);
  return Response.json(body, { status });
}

/**
 * POST /api/clients
 * @param {Request} request
 * @param {{ env: object, prisma: object }} deps
 */
async function handleCreateClient(request, { env, prisma }) {
  try {
    requireSameOrigin(request, env);
    requireRole(await getRequestSession(request, env), 'admin');

    const parsed = NewClient.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      if (field === 'email') throw new ValidationError('Enter a valid email address, or leave it empty.');
      throw new ValidationError(message('M-FIELD-REQUIRED', { field: FIELD_NAMES[field] || 'all required details' }));
    }

    const data = { ...parsed.data, websiteUrl: normalizeWebsiteUrl(parsed.data.websiteUrl) };
    try {
      const client = await prisma.client.create({ data, select: { id: true } });
      return Response.json({ id: client.id }, { status: 201 });
    } catch (err) {
      if (err?.code === 'P2002') throw new ConflictError(message('M-CLIENT-DUP'));
      throw err;
    }
  } catch (err) {
    return errorResponse(err);
  }
}

/**
 * GET /api/clients
 * @param {Request} request
 * @param {{ env: object, prisma: object }} deps
 */
async function handleListClients(request, { env, prisma }) {
  try {
    requireRole(await getRequestSession(request, env), 'admin');
    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        websiteUrl: true,
        businessType: true,
        city: true,
        state: true,
        audits: { take: 1, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, overallScore: true } },
      },
    });
    return Response.json({ clients });
  } catch (err) {
    return errorResponse(err);
  }
}

module.exports = { BUSINESS_TYPES, handleCreateClient, handleListClients };
