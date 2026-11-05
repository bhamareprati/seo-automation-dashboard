import { getEnv } from '@/lib/env';
import { handleLogout } from '@/lib/handlers/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  return handleLogout(request, { env: getEnv() });
}
