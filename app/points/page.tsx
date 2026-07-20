import { Suspense } from "react";
import MyPoints from "@/components/points/MyPoints";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Points",
  description: "Track your Connected Steps points, weekly progress, and full transaction history.",
};

export default function MyPointsPage() {
  return (
    <Suspense>
      <MyPoints />
    </Suspense>
  );
}
