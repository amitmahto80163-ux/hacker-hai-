import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'AetherStudio Pro — NLE, 3D Stage & VFX Compositor',
  description:
    'Flagship web-based Non-Linear Video Editor (NLE), 3D Modeling Environment, and Node/Layer-based Visual Effects (VFX) Compositor.',
  openGraph: {
    title: 'AetherStudio Pro — NLE, 3D Stage & VFX Compositor',
    description:
      'Flagship web-based Non-Linear Video Editor (NLE), 3D Modeling Environment, and Node/Layer-based Visual Effects (VFX) Compositor.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AetherStudio Pro — NLE, 3D Stage & VFX Compositor',
    description:
      'Flagship web-based Non-Linear Video Editor (NLE), 3D Modeling Environment, and Node/Layer-based Visual Effects (VFX) Compositor.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${jetbrainsMono.variable} dark`}>
      <body
        suppressHydrationWarning
        className="bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-amber-500/30 selection:text-amber-200 overflow-hidden select-none"
      >
        {children}
      </body>
    </html>
  );
}
