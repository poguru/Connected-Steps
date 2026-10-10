import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import CookieBanner from "@/components/ui/CookieBanner";
import NativeShell from "@/components/mobile/NativeShell";
import BugReportFab from "@/components/ui/BugReportFab";
import { ToastProvider } from "@/components/ui/ds";

// Self-hosted (latin subset of Google Fonts, OFL). The build no longer fetches fonts from Google,
// which made Vercel builds fail when the fetch was unavailable. Both files are variable fonts.
const cormorant = localFont({
  src: "./fonts/cormorant-garamond-latin.woff2",
  weight: "300 600",
  style: "normal",
  variable: "--font-cormorant",
  display: "swap",
});

const dmSans = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  weight: "400 500",
  style: "normal",
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
        <ToastProvider>
          <NativeShell>
            {children}
          </NativeShell>
          <CookieBanner />
          <BugReportFab />
        </ToastProvider>
      </body>
    </html>
  );
}
