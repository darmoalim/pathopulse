import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PathoPulse Command Center",
  description: "Next-Gen Genomic Surveillance Platform for J&K Region.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', async function() {
                  var isProd = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';

                  if (isProd) {
                    navigator.serviceWorker.register('/sw.js').then(
                      function(registration) { console.log('PWA ServiceWorker registered with scope: ', registration.scope); },
                      function(err) { console.log('PWA ServiceWorker registration failed: ', err); }
                    );
                    return;
                  }

                  try {
                    var regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(function(reg) { return reg.unregister(); }));

                    if (window.caches && caches.keys) {
                      var keys = await caches.keys();
                      await Promise.all(
                        keys
                          .filter(function(key) { return key.indexOf('pathopulse-') === 0 || key === 'pathopulse-v1'; })
                          .map(function(key) { return caches.delete(key); })
                      );
                    }
                  } catch (e) {
                    console.warn('Failed to cleanup service workers/caches in dev', e);
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
