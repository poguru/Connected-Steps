import { redirect } from "next/navigation";

// /training-plans — redirect to pricing page where training plans are explained
// The user-facing training plan view lives inside the member dashboard after signup.
export default function TrainingPlansPage() {
  redirect("/pricing");
}
