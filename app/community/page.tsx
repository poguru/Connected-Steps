import { Suspense } from "react";
import Community from "@/components/community/Community";

export default function CommunityPage() {
  return (
    <Suspense>
      <Community />
    </Suspense>
  );
}
