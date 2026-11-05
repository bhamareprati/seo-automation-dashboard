import { AdminNav } from '@/components/AdminNav';
import { SignOutButton } from '@/components/SignOutButton';
import { requirePageRole } from '../_server/session';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }) {
  await requirePageRole('admin');
  return (
    <div className="min-h-screen md:grid md:grid-cols-[208px_1fr]">
      <aside className="flex items-center justify-between gap-4 border-b bg-sheet px-4 py-3 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:border-b-0 md:border-r md:py-6">
        <div className="flex items-center gap-4 md:flex-col md:items-stretch md:gap-6">
          <p className="text-data font-bold leading-tight">SEO Automation Dashboard</p>
          <AdminNav />
        </div>
        <div className="md:self-start">
          <SignOutButton />
        </div>
      </aside>
      <main id="main" className="min-w-0 px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
