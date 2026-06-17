import { redirect } from "next/navigation";

export default function BirthdaySettingsRedirect() {
  redirect("/admin/settings/notifications");
}
