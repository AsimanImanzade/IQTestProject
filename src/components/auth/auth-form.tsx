"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 10;

export function AuthForm({ mode, nextPath }: { mode: "login" | "register"; nextPath?: string }) {
  const router = useRouter();
  const t = useT();
  const isRegister = mode === "register";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? { email, password, displayName: displayName || undefined }
            : { email, password },
        ),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error?.message ?? t("auth.genericError"));
        setBusy(false);
        return;
      }

      router.push(nextPath ?? "/dashboard");
      router.refresh();
    } catch {
      setError(t("auth.networkError"));
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 h-12 w-full rounded-xl border border-border bg-surface px-4 text-[0.95rem] " +
    "transition-colors placeholder:text-content-subtle focus:border-accent";

  return (
    <form onSubmit={submit} noValidate>
      {isRegister ? (
        <div className="mb-4">
          <label htmlFor="displayName" className="text-sm font-medium">
            {t("auth.name")} <span className="font-normal text-content-subtle">({t("common.optional")})</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
            maxLength={60}
          />
        </div>
      ) : null}

      <div className="mb-4">
        <label htmlFor="email" className="text-sm font-medium">
          {t("auth.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="password" className="text-sm font-medium">
          {t("auth.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete={isRegister ? "new-password" : "current-password"}
          minLength={isRegister ? MIN_PASSWORD_LENGTH : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
          aria-describedby={isRegister ? "password-hint" : undefined}
        />
        {isRegister ? (
          <p id="password-hint" className="mt-1.5 text-xs text-content-subtle">
{t("auth.passwordHint", { min: MIN_PASSWORD_LENGTH })}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className={cn(
            "mb-4 rounded-lg border border-negative/40 bg-negative-soft px-4 py-3 text-sm",
          )}
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy
          ? isRegister
            ? t("auth.creatingAccount")
            : t("auth.signingIn")
          : isRegister
            ? t("auth.createAccount")
            : t("common.signIn")}
      </Button>

      <p className="mt-5 text-center text-sm text-content-muted">
        {isRegister ? (
          <>
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              {t("common.signIn")}
            </Link>
          </>
        ) : (
          <>
            {t("auth.noAccount")}{" "}
            <Link href="/register" className="font-medium text-accent hover:underline">
              {t("auth.createOne")}
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
