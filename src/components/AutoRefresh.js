'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Reloads a server-rendered page's data on a timer, but not while the tab is hidden. */
export function AutoRefresh({ everyMs }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);

  return null;
}
