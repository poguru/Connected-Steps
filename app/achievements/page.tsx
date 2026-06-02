import { Suspense } from "react";
import Achievements from "@/components/achievements/Achievements";

export const metadata = {
  title: "Achievements",
  description: "Track your running milestones and achievements with Connected Steps. Earn badges, hit personal bests, and celebrate your progress.",
};

export default function AchievementsPage() {
  return (
    <Suspense>
      <Achievements />
    </Suspense>
  );
}
