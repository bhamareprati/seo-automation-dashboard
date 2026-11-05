import { message } from '@/lib/messages';

export const metadata = { title: 'Your report | SEO Automation Dashboard' };

export default function ClientHomePage() {
  return (
    <>
      <h1 className="text-title">Your report</h1>
      <p className="mt-4 text-muted-foreground">{message('M-CLIENT-EMPTY')}</p>
    </>
  );
}
