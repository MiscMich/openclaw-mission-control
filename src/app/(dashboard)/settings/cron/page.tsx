import { redirect } from "next/navigation";

export default function CronSettingsPage() {
  redirect("/settings?section=operations&ops=cron");
}
