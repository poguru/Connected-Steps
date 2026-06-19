import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";
import CookieBanner from "@/components/ui/CookieBanner";
import NativeShell from "@/components/mobile/NativeShell";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default:  "Connected Steps — Your Goal, Our Plan",
    template: "%s | Connected Steps",
  },
  description:
    "Expert coaching, personalised training plans, and a community built to help you hit every running goal. Your first 5K or a full marathon — we run with you.",
  metadataBase: new URL("https://www.connectedsteps.in"),
  icons: {
    icon:    "/logo.png",
    apple:   "/logo.png",
    shortcut:"/logo.png",
  },
  openGraph: {
    title: "Connected Steps — Your Goal, Our Plan",
    description: "Expert coaching and a community built around your running goals.",
    url: "https://www.connectedsteps.in",
    siteName: "Connected Steps",
    type: "website",
    locale: "en_IN",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Connected Steps",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cormorant.variable} ${dmSans.variable}`}>
      <body className="antialiased">
        <NativeShell>
          {children}
        </NativeShell>
        <CookieBanner />
      </body>
    </html>
  );
}
