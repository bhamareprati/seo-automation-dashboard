import { handleCronTick } from '@/lib/handlers/cron';
import { cronDeps } from '../../_deps';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  return handleCronTick(request, cronDeps());
}
