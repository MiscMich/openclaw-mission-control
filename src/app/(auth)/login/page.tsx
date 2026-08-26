"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Radio } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(response.status === 503 ? "Authentication is not configured." : "Invalid credentials.");
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#0b0d12] text-[#eef0f6] grid place-items-center p-5" id="main-content">
      <section className="w-full max-w-sm border border-[#282c37] bg-[#11141a] rounded-2xl p-6 shadow-2xl">
        <div className="w-10 h-10 rounded-xl bg-[#7164e8] grid place-items-center mb-5"><Radio size={19} /></div>
        <p className="text-[10px] tracking-[.15em] text-[#747a8b] font-semibold">OPENCLAW MISSION CONTROL</p>
        <h1 className="text-xl font-semibold tracking-tight mt-2">Operator sign in</h1>
        <p className="text-xs leading-relaxed text-[#818797] mt-2">Production access requires a configured password hash and session secret.</p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          <label className="text-[11px] text-[#b5b9c4]">Password
            <div className="mt-2 flex items-center gap-2 border border-[#303542] bg-[#171a22] rounded-lg px-3 focus-within:border-[#7164e8]">
              <LockKeyhole size={15} className="text-[#72798a]" />
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={1024} autoComplete="current-password" className="h-10 flex-1 min-w-0 bg-transparent outline-none text-sm" />
            </div>
          </label>
          {error && <p className="text-[11px] text-[#f08b8f]" role="alert">{error}</p>}
          <button disabled={busy || !password} className="h-10 rounded-lg bg-[#7164e8] hover:bg-[#7c70ec] disabled:opacity-50 text-xs font-semibold mt-2">{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
