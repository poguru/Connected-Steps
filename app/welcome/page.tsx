import { Suspense } from "react";
import AuthPage from "@/components/auth/AuthPage";

export default function Page() {
  return (
    <Suspense>
      <AuthPage />
    </Suspense>
  );
}
