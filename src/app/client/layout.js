import { SignOutButton } from '@/components/SignOutButton';
import { prisma } from '@/lib/prisma';
import { requirePageRole } from '../_server/session';

export const dynamic = 'force-dynamic';

export default async function ClientLayout({ children }) {
  const session = await requirePageRole('client');
  const client = await prisma.client.findUnique({
    where: { id: session.clientId },
    select: { name: true },
  });
  return (
    <div className="min-h-screen">
      <header className="border-b bg-sheet">
        <div className="mx-auto flex max-w-sheet items-center justify-between gap-4 px-4 py-3">
          <p className="truncate text-data font-bold">{client?.name}</p>
          <SignOutButton />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-sheet px-4 py-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
