import Link from 'next/link';
import { RunAuditButton } from '@/components/RunAuditButton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ACTIVE_STATUSES, STATUS_DISPLAY } from '@/lib/auditSteps';
import { message } from '@/lib/messages';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Clients | SEO Automation Dashboard' };

export default async function ClientsPage() {
  const clients = await prisma.client.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      city: true,
      audits: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, overallScore: true },
      },
    },
  });

  return (
    <>
      <h1 className="text-title">Clients</h1>
      {clients.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{message('M-EMPTY-CLIENTS')}</p>
      ) : (
        <div className="mt-6 overflow-x-auto bg-sheet">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>City</TableHead>
                <TableHead className="text-right">Latest score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Action</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => {
                const latest = client.audits[0];
                const status = latest ? STATUS_DISPLAY[latest.status] : null;
                const active = latest && ACTIVE_STATUSES.includes(latest.status);
                return (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell className="break-all text-muted-foreground">{client.websiteUrl}</TableCell>
                    <TableCell>{client.city}</TableCell>
                    <TableCell className="text-right">{latest?.overallScore ?? '—'}</TableCell>
                    <TableCell>
                      {latest ? (
                        <Link href={`/admin/audits/${latest.id}`} className={cn('hover:underline', status.className)}>
                          {status.label}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Never run</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {active ? (
                        <Link href={`/admin/audits/${latest.id}`} className="text-methylene hover:underline">
                          Running
                        </Link>
                      ) : (
                        <RunAuditButton clientId={client.id} label={latest ? 'Run again' : 'Run audit'} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
