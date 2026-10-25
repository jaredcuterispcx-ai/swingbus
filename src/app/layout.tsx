import type { Metadata, Viewport } from "next";
// Bundled locally: next/font/google downloads at boot, which fails on
// restricted networks and takes the whole app down.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "swingbus",
  description: "Campus shuttles — pick your stop, see the next bus.",
  applicationName: "swingbus",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "swingbus",
    statusBarStyle: "black",
  },
  icons: {
    icon: "/bolt.svg",
    apple: "/bolt.svg",
  },
};

// No themeColor: the boot script owns the theme-color meta (src/lib/theme.ts).
export const viewport: Viewport = {
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
    // The boot script sets data-theme before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="antialiased">
        {children}
        <footer className="mx-auto max-w-[480px] px-5 pt-2 pb-8 text-center text-[11px] leading-relaxed text-ink-soft">
          <p>
            swingbus brought to you by your friends in Transportation and
            Observability Software.
          </p>
          <p className="mt-1">
            Feedback? Find us at{" "}
            <span className="font-semibold text-ink">#memphis-transportation</span> on
            Slack.
          </p>
        </footer>
      </body>
    </html>
  );
}
