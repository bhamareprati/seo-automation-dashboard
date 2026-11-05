import { getEnv } from '@/lib/env';
import { handleCreateClient, handleListClients } from '@/lib/handlers/clients';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return handleListClients(request, { env: getEnv(), prisma });
}

export async function POST(request) {
  return handleCreateClient(request, { env: getEnv(), prisma });
}
