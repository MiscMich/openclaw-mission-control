import { redirect } from "next/navigation";

export default function AgentsSettingsPage() {
  redirect("/settings?section=agents");
}
