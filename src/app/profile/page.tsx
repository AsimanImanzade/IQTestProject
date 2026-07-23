import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile-form";
import { getSessionUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/demographics";
import { getServerT } from "@/i18n/server";

export const metadata: Metadata = { title: "Your profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/profile");

  const profile = await getProfile(user.id);
  const { next } = await searchParams;
  // Only internal paths, so this cannot be used as an open redirect.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const { t } = await getServerT();

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-lg px-6 pb-24 pt-12">
        <Card>
          <CardTitle>{t("profile.title")}</CardTitle>
          <CardDescription>{t("profile.subtitle")}</CardDescription>

          <div className="mt-6">
            <ProfileForm
              initial={{
                displayName: profile.displayName ?? "",
                birthYear: profile.birthYear === null ? "" : String(profile.birthYear),
                gender: profile.gender ?? "",
                educationLevel: profile.educationLevel ?? "",
                nationality: profile.nationality ?? "",
                profession: profile.profession ?? "",
              }}
              currentAge={profile.ageYears}
              email={user.email}
              nextPath={safeNext}
            />
          </div>
        </Card>
      </main>
    </>
  );
}
