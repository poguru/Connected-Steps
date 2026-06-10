import { Suspense } from "react";
import FeedPageClient from "./FeedPageClient";

export const metadata = {
  title: "Community Feed — Connected Steps",
  description: "See what runners are up to. Sessions, achievements, and photos from the Connected Steps community.",
};

export default function FeedPage() {
  return (
    <Suspense>
      <FeedPageClient />
    </Suspense>
  );
}
