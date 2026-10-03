"use client";
import OperationPage from "@/components/OperationPage";

export default function BreakfastPage() {
  return <OperationPage config={{ title: "Breakfast", icon: "🍽", entitlementType: "BREAKFAST", color: "#ec4899", instruction: "Scan participant QR to issue breakfast" }} />;
}
