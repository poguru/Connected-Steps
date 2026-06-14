import { Suspense } from "react";
import Leaderboard from "@/components/leaderboard/Leaderboard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Community Leaderboard",
  description: "See who's leading the Connected Steps community this month. Earn points by attending training sessions and climb the leaderboard.",
};

export default function LeaderboardPage() {
  return (
    <Suspense>
      <Leaderboard />
    </Suspense>
  );
}
