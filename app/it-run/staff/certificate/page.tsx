"use client";
import OperationPage from "@/components/OperationPage";

export default function CertificatePage() {
  return <OperationPage config={{ title: "Certificate Issuance", icon: "📜", entitlementType: "CERTIFICATE", color: "#60a5fa", instruction: "Scan participant QR to issue certificate" }} />;
}
