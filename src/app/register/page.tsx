import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { AuthForm } from "@/components/auth/auth-form";
import { getSessionUser } from "@/server/auth/session";
import { getServerT } from "@/i18n/server";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");
  const { t } = await getServerT();

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-md px-6 pb-24 pt-16">
        <Card>
          <CardTitle>{t("auth.registerTitle")}</CardTitle>
          <CardDescription>{t("auth.registerSubtitle")}</CardDescription>
          <div className="mt-6">
            <AuthForm mode="register" />
          </div>
        </Card>
      </main>
    </>
  );
}
