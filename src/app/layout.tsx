import type { Metadata, Viewport } from "next";
// Bundled locally: next/font/google downloads at boot, which fails on
// restricted networks and takes the whole app down.
import "@fontsource-variable/outfit";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swing Bus · XSI",
  description:
    "XSI shuttle ground control — request a seat, drive a vehicle, dispatch like Uber for campus.",
  applicationName: "Swing Bus",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Swing Bus",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/xsi-mark.svg",
    apple: "/xsi-mark.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#050507",
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
        <footer className="mx-auto max-w-[480px] px-5 pt-2 pb-8 text-center text-[11px] leading-relaxed text-ink-soft/60">
          Swingbus brought to you by your friends in Transportation and
          Observability Software.
        </footer>
      </body>
    </html>
  );
}
