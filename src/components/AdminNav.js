'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'Worklist' },
  { href: '/admin/clients', label: 'Clients' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 md:flex-col">
      {LINKS.map(({ href, label }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-2 text-data hover:bg-accent',
              active ? 'font-bold text-methylene' : 'text-ink',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
