"use client";
import OperationPage from "@/components/OperationPage";

export default function MedalPage() {
  return <OperationPage config={{ title: "Medal Distribution", icon: "🏅", entitlementType: "MEDAL", color: "#fbbf24", instruction: "Scan participant QR to award medal" }} />;
}
