import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The IT Run Sprint-2 | Hyderabad | February 7, 2027",
  description: "The IT Run Sprint-2 - Exclusive running event for IT professionals in Hyderabad. 10K, 5K Timed, 5K Fun Run, Duo Challenge and Run with Kid categories. Hitec City, February 7, 2027.",
  openGraph: {
    title: "The IT Run Sprint-2",
    description: "Exclusive for IT Professionals | Hyderabad | Feb 7, 2027",
    images: [{ url: "/it-run/og-image.jpg", width: 1200, height: 630 }],
  },
};

export default function ItRunLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
