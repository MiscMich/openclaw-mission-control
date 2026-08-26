import { redirect } from "next/navigation";

export default function OpenClawSettingsPage() {
  redirect("/settings?section=openclaw");
}
