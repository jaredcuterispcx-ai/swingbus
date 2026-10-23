import type { Metadata, Viewport } from "next";
// Bundled locally: next/font/google downloads at boot, which fails on
// restricted networks and takes the whole app down.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "swingbus",
  description: "Campus shuttles — pick your stop, see the next bus.",
  applicationName: "swingbus",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "swingbus",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/bolt.svg",
    apple: "/bolt.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <footer className="mx-auto max-w-[480px] px-5 pt-2 pb-8 text-center text-[11px] leading-relaxed text-ink-soft">
          Swingbus brought to you by your friends in Transportation and
          Observability Software.
        </footer>
      </body>
    </html>
  );
}
