'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { message } from '@/lib/messages';

const BUSINESS_TYPES = ['Dental clinic', 'Healthcare', 'Real estate', 'Other'];

const FIELDS = [
  { name: 'name', label: 'Name', required: true },
  { name: 'websiteUrl', label: 'Website address', required: true, type: 'url', placeholder: 'https://example.com' },
  { name: 'city', label: 'City', required: true },
  { name: 'state', label: 'State', required: true },
  { name: 'whatsapp', label: 'WhatsApp (optional)', type: 'tel' },
  { name: 'email', label: 'Email (optional)', type: 'email' },
];

export function AddClientDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [businessType, setBusinessType] = useState('Dental clinic');
  const errorRef = useRef(null);

  function showError(text) {
    setError(text);
    // Moves focus to the message, so a screen reader announces what to fix.
    setTimeout(() => errorRef.current?.focus(), 0);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = event.currentTarget;
    const body = { ...Object.fromEntries(new FormData(form)), businessType };
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        toast('Client added');
        setOpen(false);
        form.reset();
        router.refresh();
      } else {
        const data = await res.json();
        showError(data.error);
      }
    } catch {
      showError(message('M-LOAD-FAIL'));
    }
    setBusy(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>Add client</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
          <DialogDescription>The website address can&apos;t point to a private network.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          {FIELDS.map(({ name, label, required, type = 'text', placeholder }) => (
            <div key={name} className="space-y-1">
              <Label htmlFor={`client-${name}`}>{label}</Label>
              <Input id={`client-${name}`} name={name} type={type} required={required} placeholder={placeholder} />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="client-businessType">Business type</Label>
            <Select value={businessType} onValueChange={setBusinessType}>
              <SelectTrigger id="client-businessType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? (
            <p ref={errorRef} tabIndex={-1} role="alert" className="text-data text-poor">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              Add client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
