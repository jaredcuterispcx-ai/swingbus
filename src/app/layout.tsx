import type { Metadata, Viewport } from "next";
import { Fraunces, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Swing Bus · XSI",
  description:
    "Passenger and driver shuttle dispatch for XSI — scan a stop, request a ride, route shuttles intelligently.",
  applicationName: "Swing Bus",
  appleWebApp: {
    capable: true,
    title: "Swing Bus",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f7a5c",
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
      <body className={`${sora.variable} ${fraunces.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
