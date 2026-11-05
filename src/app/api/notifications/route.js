import { handleListNotifications } from '@/lib/handlers/audit';
import { auditDeps } from '../_deps';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return handleListNotifications(request, auditDeps());
}
