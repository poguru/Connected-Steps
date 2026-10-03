"use client";
import OperationPage from "@/components/OperationPage";

export default function BibCollectPage() {
  return (
    <OperationPage
      config={{
        title: "BIB Collection",
        icon: "🎫",
        entitlementType: "BIB",
        color: "#e8620a",
        instruction: "Scan participant QR or registration code to collect BIB",
      }}
    />
  );
}
