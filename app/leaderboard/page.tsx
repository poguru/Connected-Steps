import { Suspense } from "react";
import Leaderboard from "@/components/leaderboard/Leaderboard";

export default function LeaderboardPage() {
  return (
    <Suspense>
      <Leaderboard />
    </Suspense>
  );
}
