'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { message } from '@/lib/messages';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setBusy(false);
        return;
      }
      router.replace(data.role === 'admin' ? '/admin' : '/client');
      router.refresh();
    } catch {
      setError(message('M-LOAD-FAIL'));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required className="bg-sheet" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="bg-sheet" />
      </div>
      {error ? (
        <p role="alert" className="text-data text-poor">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        Sign in
      </Button>
    </form>
  );
}
