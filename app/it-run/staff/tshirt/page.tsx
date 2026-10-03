"use client";
import OperationPage from "@/components/OperationPage";

export default function TshirtPage() {
  return (
    <OperationPage
      config={{
        title: "T-Shirt Issuance",
        icon: "👕",
        entitlementType: "TSHIRT",
        color: "#06b6d4",
        instruction: "Scan participant QR and confirm t-shirt size",
        fields: [{ key: "size", label: "T-Shirt Size", type: "select" }],
      }}
    />
  );
}
