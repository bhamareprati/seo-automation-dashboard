import { handleGetReport } from '@/lib/handlers/audit';
import { auditDeps } from '../../../_deps';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  return handleGetReport(request, params.id, auditDeps());
}
