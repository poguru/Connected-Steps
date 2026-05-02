import { Suspense } from "react";
import Achievements from "@/components/achievements/Achievements";

export default function AchievementsPage() {
  return (
    <Suspense>
      <Achievements />
    </Suspense>
  );
}
