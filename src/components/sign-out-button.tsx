"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/client";

export function SignOutButton() {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    // refresh() re-runs the server components so the header reflects the signed-out state.
    router.replace("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="rounded-xl px-4 py-2.5 text-sm font-medium text-content-muted transition-colors hover:bg-surface-sunken hover:text-content disabled:opacity-50"
    >
      {busy ? t("common.signingOut") : t("common.signOut")}
    </button>
  );
}
