import { Suspense } from "react";
import Community from "@/components/community/Community";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find Runners",
  description: "Connect with fellow runners in Hyderabad. Find training partners and build your running community with Connected Steps.",
};

export default function CommunityPage() {
  return (
    <Suspense>
      <Community />
    </Suspense>
  );
}
