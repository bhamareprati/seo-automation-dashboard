import { getEnv } from '@/lib/env';
import { handleLogin } from '@/lib/handlers/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  return handleLogin(request, {
    env: getEnv(),
    findClientByEmail: (email) =>
      prisma.client.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      }),
  });
}
