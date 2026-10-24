import './globals.css';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Toaster } from 'sonner';
import Shell from '@/components/Shell';
import { ThemeInitScript } from '@/theme/ThemeInitScript';
import { ThemeProvider } from '@/theme/ThemeProvider';

const inter = localFont({ src: '../theme/fonts/InterVariable.woff2', weight: '100 900', style: 'normal', display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = { title: 'Sahayogi Catalyst', description: 'Product lifecycle, Phase 0 to 12' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head><ThemeInitScript /></head>
      <body>
        <ThemeProvider><Shell>{children}</Shell></ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
