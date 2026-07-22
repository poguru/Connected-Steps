import { Suspense } from "react";
import Dashboard from "@/components/dashboard/Dashboard";
import { DashboardErrorBoundary } from "@/components/dashboard/DashboardErrorBoundary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Dashboard",
  description: "Your personalised running dashboard — track sessions, points, training plan, and membership all in one place.",
};

export default function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <Suspense fallback={null}>
        <Dashboard />
      </Suspense>
    </DashboardErrorBoundary>
  );
}
