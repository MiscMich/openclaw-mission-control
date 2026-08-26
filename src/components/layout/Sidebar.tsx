"use client";

import Link from "next/link";

export function Sidebar() {
  return (
    <aside className="hidden h-[calc(100vh-72px)] w-56 flex-col border-r border-zinc-900 bg-black/50 px-4 py-6 lg:flex">
      <div className="mb-6 text-xs font-semibold uppercase tracking-widest text-zinc-500">Navigate</div>
      <nav className="flex flex-col gap-3 text-sm text-zinc-400">
        <Link href="/" className="rounded-lg px-2 py-1.5 transition hover:bg-zinc-900 hover:text-zinc-100">
          Dashboard
        </Link>
        <Link href="/agents/coordinator" className="rounded-lg px-2 py-1.5 transition hover:bg-zinc-900 hover:text-zinc-100">
          Agents
        </Link>
      </nav>
    </aside>
  );
}
