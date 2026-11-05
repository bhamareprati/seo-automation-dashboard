import { LoginForm } from '@/components/LoginForm';
import { message } from '@/lib/messages';

export const metadata = { title: 'Sign in | SEO Automation Dashboard' };

export default function LoginPage() {
  return (
    <main id="main" className="mx-auto max-w-sm px-4 py-16 md:py-24">
      <h1 className="text-title">SEO Automation Dashboard</h1>
      <p className="mb-8 mt-1 text-muted-foreground">Website audits with fixes you can check.</p>
      <LoginForm />
      <p className="mt-8 text-data text-muted-foreground">{message('M-LOGIN-HINT')}</p>
    </main>
  );
}
