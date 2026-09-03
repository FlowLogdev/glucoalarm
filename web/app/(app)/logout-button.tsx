"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function onLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={onLogout}
      style={{ background: "transparent", color: "var(--text-dim)", padding: 0, fontWeight: 400 }}
    >
      Log out
    </button>
  );
}
