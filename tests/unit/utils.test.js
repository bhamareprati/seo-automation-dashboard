import { describe, expect, it } from 'vitest';
import { cn } from '../../src/lib/utils.js';

describe('cn', () => {
  it('keeps a custom font size next to a text colour', () => {
    expect(cn('text-data', 'text-ink')).toBe('text-data text-ink');
    expect(cn('text-label', 'text-poor')).toBe('text-label text-poor');
  });

  it('still lets a later size replace an earlier one', () => {
    expect(cn('text-data', 'text-title')).toBe('text-title');
    expect(cn('text-ink', 'text-poor')).toBe('text-poor');
  });
});
