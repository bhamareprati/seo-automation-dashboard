/** Design tokens from docs/UI_UX_DESIGN.md section 3. @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,jsx}', './src/components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Named tokens
        slide: '#F4F7F8',
        sheet: '#FFFFFF',
        ink: '#1B2A33',
        rule: '#D3DCE0',
        methylene: '#17507F',
        good: '#1E7F5C',
        watch: '#8F6200',
        poor: '#B3261E',
        'tint-good': '#CFE8DC',
        'tint-watch': '#F5E6C4',
        'tint-poor': '#F3D5D2',
        // shadcn/ui names, mapped to the same tokens in globals.css
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'var(--radius)',
        sm: 'calc(var(--radius) - 2px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        result: ['1.75rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        title: ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        section: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '700' }],
        body: ['1rem', { lineHeight: '1.625rem' }],
        data: ['0.875rem', { lineHeight: '1.375rem' }],
        label: ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '500' }],
      },
      maxWidth: {
        prose: '72ch',
        sheet: '760px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
