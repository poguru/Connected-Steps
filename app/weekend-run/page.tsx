import { Suspense } from "react";
import WeekendRunForm from "@/components/runs/WeekendRunForm";

export const metadata = {
  title: "Weekend Run Registration | Connected Steps",
  description: "Register for the Connected Steps weekend special run — every last Sunday of the month.",
};

export default function WeekendRunPage() {
  return (
    <Suspense>
      <WeekendRunForm />
    </Suspense>
  );
}
