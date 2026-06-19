import { Suspense } from "react";
import Dashboard from "@/components/dashboard/Dashboard";
import ErrorBoundary from "@/components/ui/ErrorBoundary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Dashboard",
  description: "Your personalised running dashboard — track sessions, points, training plan, and membership all in one place.",
};

export default function DashboardPage() {
  return (
    <ErrorBoundary>
      <Suspense>
        <Dashboard />
      </Suspense>
    </ErrorBoundary>
  );
}
