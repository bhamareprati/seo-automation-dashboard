const bcrypt = require('bcryptjs');
const { SignJWT, jwtVerify } = require('jose');
const { ForbiddenError, UnauthenticatedError } = require('./errors');

const SESSION_COOKIE = 'seo_session';
const SESSION_SECONDS = 8 * 60 * 60;

const keyFrom = (secret) => new TextEncoder().encode(secret);

/**
 * Creates a signed session token.
 * @param {{ role: 'admin' | 'client', clientId?: string }} session
 */
async function signSession(session, secret) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(keyFrom(secret));
}

/** Returns the session, or null if the token is missing, forged or expired. */
async function verifySession(token, secret) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keyFrom(secret), { algorithms: ['HS256'] });
    if (payload.role === 'admin') return { role: 'admin' };
    if (payload.role === 'client' && payload.clientId) return { role: 'client', clientId: payload.clientId };
    return null;
  } catch {
    return null;
  }
}

/**
 * Checks a login. Returns null for every kind of failure, so the caller can't reveal which part was wrong.
 * @param {{ email: string, password: string }} credentials
 * @param {{ env: object, findClientByEmail: (email: string) => Promise<{ id: string } | null> }} deps
 */
async function authenticate({ email, password }, { env, findClientByEmail }) {
  const normalised = email.trim().toLowerCase();
  if (normalised === env.ADMIN_EMAIL.toLowerCase()) {
    return (await bcrypt.compare(password, env.ADMIN_PASSWORD_HASH)) ? { role: 'admin' } : null;
  }
  if (!(await bcrypt.compare(password, env.CLIENT_PASSWORD_HASH))) return null;
  const client = await findClientByEmail(normalised);
  return client ? { role: 'client', clientId: client.id } : null;
}

/** Reads the session cookie from a standard Request. */
function readSessionCookie(request) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return null;
}

function sessionCookie(token, env) {
  const secure = env.APP_URL.startsWith('https://') ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearedSessionCookie(env) {
  const secure = env.APP_URL.startsWith('https://') ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** Throws unless the session has one of the allowed roles. */
function requireRole(session, ...roles) {
  if (!session) throw new UnauthenticatedError('Sign in to continue.');
  if (!roles.includes(session.role)) throw new ForbiddenError('You do not have access to this.');
  return session;
}

/** Throws unless this session may see the given audit. Admins see all, clients only their own. */
function requireAuditAccess(session, audit) {
  requireRole(session, 'admin', 'client');
  if (session.role === 'client' && audit.clientId !== session.clientId) {
    throw new ForbiddenError('This report belongs to another account.');
  }
  return session;
}

/** Blocks state-changing requests sent from another website. Browsers always send Origin on POST. */
function requireSameOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(env.APP_URL).origin) {
    throw new ForbiddenError('This request came from another website.');
  }
}

module.exports = {
  SESSION_COOKIE,
  signSession,
  verifySession,
  authenticate,
  readSessionCookie,
  sessionCookie,
  clearedSessionCookie,
  requireRole,
  requireAuditAccess,
  requireSameOrigin,
};
