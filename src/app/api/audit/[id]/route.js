import { handleGetAudit } from '@/lib/handlers/audit';
import { auditDeps } from '../../_deps';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  return handleGetAudit(request, params.id, auditDeps());
}
