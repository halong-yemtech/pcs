import type { ReactNode } from 'react';

// The operations UI is the static app in /public (served at "/"). This layout only exists
// because Next.js expects a root layout; no React pages are rendered.
export const metadata = { title: 'PCS Operations' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
