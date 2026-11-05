import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Without this, tailwind-merge reads our custom sizes (text-data and so on) as colours,
// so a later text-ink would silently remove the size.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['result', 'title', 'section', 'body', 'data', 'label'] }],
    },
  },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
