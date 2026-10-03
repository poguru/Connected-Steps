"use client";
import OperationPage from "@/components/OperationPage";

export default function GoodiesPage() {
  return <OperationPage config={{ title: "Goodies Distribution", icon: "🎁", entitlementType: "GOODIES", color: "#8b5cf6", instruction: "Scan participant QR to distribute goodies" }} />;
}
