import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CONVRT — Browser Video Converter',
  description:
    'Convert, compress, and optimize videos entirely in your browser. No uploads. Powered by FFmpeg.wasm.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
