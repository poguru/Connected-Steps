import { Suspense } from "react";
import CoachInbox from "@/components/dashboard/CoachInbox";

export const metadata = {
  title: "Messages | Connected Steps",
  description: "Coach inbox — view and reply to athlete messages.",
};

export default function MessagesPage() {
  return (
    <Suspense>
      <CoachInbox />
    </Suspense>
  );
}
