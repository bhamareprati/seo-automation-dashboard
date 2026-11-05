import { handleRetryAudit } from '@/lib/handlers/audit';
import { auditDeps } from '../../../_deps';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request, { params }) {
  return handleRetryAudit(request, params.id, auditDeps());
}
