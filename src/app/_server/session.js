import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';
import { getEnv } from '@/lib/env';

/** The current user's session in a server component, or null. */
export async function getSession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token, getEnv().SESSION_SECRET);
}

/** Use at the top of a protected page. Sends the user to sign in, or to their own area. */
export async function requirePageRole(role) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== role) redirect(session.role === 'admin' ? '/admin' : '/client');
  return session;
}
