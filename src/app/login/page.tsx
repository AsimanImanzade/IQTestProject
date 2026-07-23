import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";
import { getSessionUser } from "@/server/auth/session";
import { getServerT } from "@/i18n/server";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  // Next.js 16: searchParams is a Promise.
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const { next } = await searchParams;
  // Only accept internal paths: an open redirect here would let a phishing link bounce through
  // this domain to an attacker's site after a successful login.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const { t } = await getServerT();

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-md px-6 pb-24 pt-16">
        <Card>
          <CardTitle>{t("auth.signInTitle")}</CardTitle>
          <CardDescription>{t("auth.signInSubtitle")}</CardDescription>
          <div className="mt-6">
            <AuthForm mode="login" nextPath={safeNext} />
          </div>
        </Card>
      </main>
    </>
  );
}
