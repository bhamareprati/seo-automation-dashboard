'use client';

import { Button } from '@/components/ui/button';
import { message } from '@/lib/messages';

export default function ErrorPage({ reset }) {
  return (
    <main id="main" className="mx-auto max-w-prose px-4 py-16">
      <h1 className="text-title">{message('M-LOAD-FAIL')}</h1>
      <Button className="mt-6" onClick={reset}>
        Reload
      </Button>
    </main>
  );
}
