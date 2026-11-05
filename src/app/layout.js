import './globals.css';

export const metadata = {
  title: 'SEO Automation Dashboard',
  description: 'Website audits with fixes you can check.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
