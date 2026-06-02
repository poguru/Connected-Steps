import { Suspense } from "react";
import Dashboard from "@/components/dashboard/Dashboard";

export const metadata = {
  title: "My Dashboard",
  description: "Your personalised running dashboard — track sessions, points, training plan, and membership all in one place.",
};

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
