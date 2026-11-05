import { message } from '@/lib/messages';

export const metadata = { title: 'Worklist | SEO Automation Dashboard' };

export default function WorklistPage() {
  return (
    <>
      <h1 className="text-title">Worklist</h1>
      <p className="mt-4 text-muted-foreground">{message('M-EMPTY-AUDITS')}</p>
    </>
  );
}
