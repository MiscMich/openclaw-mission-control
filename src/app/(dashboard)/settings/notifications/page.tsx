import { redirect } from "next/navigation";

export default function NotificationsSettingsPage() {
  redirect("/settings?section=notifications");
}
