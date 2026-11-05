'use client';

import { Toaster as Sonner } from 'sonner';

// Light theme only (docs/UI_UX_DESIGN.md section 3.1), so the theme provider from the template is not needed.
const Toaster = (props) => (
  <Sonner
    theme="light"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast: 'group toast group-[.toaster]:bg-sheet group-[.toaster]:text-ink group-[.toaster]:border-rule',
        description: 'group-[.toast]:text-muted-foreground',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
      },
    }}
    {...props}
  />
);

export { Toaster };
