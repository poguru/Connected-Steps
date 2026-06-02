import { Suspense } from "react";
import AuthPage from "@/components/auth/AuthPage";

export const metadata = {
  title: "Sign In",
  description: "Sign in to your Connected Steps account to access your dashboard, training plan, and community.",
};

export default function Page() {
  return (
    <Suspense>
      <AuthPage />
    </Suspense>
  );
}
