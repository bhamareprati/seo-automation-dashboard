import Link from 'next/link';
import { message } from '@/lib/messages';

export const metadata = { title: 'Not found | SEO Automation Dashboard' };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-prose px-4 py-16">
      <h1 className="text-title">{message('M-NOT-FOUND')}</h1>
      <p className="mt-6">
        <Link href="/" className="text-methylene underline-offset-4 hover:underline">
          Go back to the start
        </Link>
      </p>
    </main>
  );
}
