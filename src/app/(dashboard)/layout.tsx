import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionSecret, isAuthDisabled, SESSION_COOKIE, verifySessionToken } from "@/lib/security/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (isAuthDisabled()) {
    return <>{children}</>;
  }

  const cookieStore = await cookies();
  const authCookie = cookieStore.get(SESSION_COOKIE)?.value;
  const secret = getSessionSecret();

  if (!secret || !verifySessionToken(authCookie, { secret })) {
    redirect("/login");
  }

  return <>{children}</>;
}
