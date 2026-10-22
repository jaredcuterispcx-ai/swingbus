import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${mono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
