import { redirect } from "next/navigation";

export default function WorkersSettingsPage() {
  redirect("/settings?section=operations&ops=workers");
}
