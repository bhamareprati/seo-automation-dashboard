const { z } = require('zod');
const { authenticate, clearedSessionCookie, requireSameOrigin, sessionCookie, signSession } = require('../auth');
const { UnauthenticatedError, ValidationError, toErrorResponse } = require('../errors');
const { message } = require('../messages');

const LoginBody = z.object({ email: z.string().min(1), password: z.string().min(1) });

/**
 * POST /api/auth/login
 * @param {Request} request
 * @param {{ env: object, findClientByEmail: Function }} deps
 */
async function handleLogin(request, deps) {
  try {
    requireSameOrigin(request, deps.env);
    const body = LoginBody.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new ValidationError(message('M-LOGIN-EMPTY'));

    const session = await authenticate(body.data, deps);
    if (!session) throw new UnauthenticatedError(message('M-LOGIN-FAIL'));

    const token = await signSession(session, deps.env.SESSION_SECRET);
    return Response.json(
      { role: session.role },
      { headers: { 'Set-Cookie': sessionCookie(token, deps.env) } },
    );
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return Response.json(body, { status });
  }
}

/**
 * POST /api/auth/logout
 * @param {Request} request
 * @param {{ env: object }} deps
 */
async function handleLogout(request, { env }) {
  try {
    requireSameOrigin(request, env);
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearedSessionCookie(env) } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return Response.json(body, { status });
  }
}

module.exports = { handleLogin, handleLogout };
