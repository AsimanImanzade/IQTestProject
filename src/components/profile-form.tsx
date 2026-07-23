"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EDUCATION_LEVELS, GENDERS } from "@/components/demographics-fields";
import { MAX_SUPPORTED_AGE, MIN_SUPPORTED_AGE } from "@/core/psychometrics/age-norms";
import { COUNTRIES } from "@/core/reference/countries";
import { PROFESSIONS } from "@/core/reference/professions";
import { useT } from "@/i18n/client";

interface ProfileValues {
  displayName: string;
  birthYear: string;
  gender: string;
  educationLevel: string;
  nationality: string;
  profession: string;
}

const fieldClass =
  "mt-1.5 h-12 w-full rounded-xl border border-border bg-surface px-4 text-[0.95rem] " +
  "transition-colors focus:border-accent";

export function ProfileForm({
  initial,
  currentAge,
  email,
  nextPath,
}: {
  initial: ProfileValues;
  currentAge: number | null;
  email: string;
  nextPath: string;
}) {
  const router = useRouter();
  const t = useT();
  const [values, setValues] = useState<ProfileValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const thisYear = new Date().getFullYear();
  // Derived live so the person can see the consequence of what they typed before saving.
  const previewAge = values.birthYear ? thisYear - Number(values.birthYear) : null;

  const set = (patch: Partial<ProfileValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setSaved(false);
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const birthYear = values.birthYear ? Number(values.birthYear) : null;
    if (birthYear !== null) {
      const age = thisYear - birthYear;
      if (age < MIN_SUPPORTED_AGE || age > MAX_SUPPORTED_AGE) {
        setError(t("profile.ageRangeError", { age, min: MIN_SUPPORTED_AGE, max: MAX_SUPPORTED_AGE }));
        setBusy(false);
        return;
      }
    }

    try {
      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: values.displayName.trim() || null,
          birthYear,
          gender: values.gender || null,
          educationLevel: values.educationLevel || null,
          nationality: values.nationality || null,
          profession: values.profession || null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error?.message ?? t("profile.saveError"));
        setBusy(false);
        return;
      }

      setSaved(true);
      setBusy(false);
      router.refresh();
      if (nextPath && nextPath !== "/profile") router.push(nextPath);
    } catch {
      setError(t("auth.networkError"));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <div className="mb-4">
        <label className="text-sm font-medium" htmlFor="email">
          {t("profile.emailLabel")}
        </label>
        <input
          id="email"
          value={email}
          disabled
          className={`${fieldClass} cursor-not-allowed opacity-60`}
        />
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium" htmlFor="displayName">
          {t("profile.nameLabel")} <span className="font-normal text-content-subtle">({t("common.optional")})</span>
        </label>
        <input
          id="displayName"
          value={values.displayName}
          onChange={(e) => set({ displayName: e.target.value })}
          maxLength={60}
          className={fieldClass}
        />
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium" htmlFor="birthYear">
          {t("profile.birthYear")} <span className="text-negative">*</span>
        </label>
        <input
          id="birthYear"
          type="number"
          inputMode="numeric"
          value={values.birthYear}
          onChange={(e) => set({ birthYear: e.target.value })}
          min={thisYear - MAX_SUPPORTED_AGE}
          max={thisYear - MIN_SUPPORTED_AGE}
          placeholder="e.g. 1994"
          className={fieldClass}
          aria-describedby="birthYear-hint"
        />
        <p id="birthYear-hint" className="mt-1.5 text-xs text-content-subtle">
          {previewAge !== null && !Number.isNaN(previewAge)
            ? t("profile.birthYearAge", { age: previewAge })
            : currentAge !== null
              ? t("profile.birthYearCurrent", { age: currentAge })
              : ""}
          {t("profile.birthYearHint")}
        </p>
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium" htmlFor="profile-gender">
          {t("demographics.gender")}
        </label>
        <select
          id="profile-gender"
          value={values.gender}
          onChange={(e) => set({ gender: e.target.value })}
          className={fieldClass}
        >
          <option value="">{t("common.select")}</option>
          {GENDERS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-content-subtle">{t("demographics.genderHint")}</p>
      </div>

      <div className="mb-5">
        <label className="text-sm font-medium" htmlFor="profile-education">
          {t("demographics.education")}
        </label>
        <select
          id="profile-education"
          value={values.educationLevel}
          onChange={(e) => set({ educationLevel: e.target.value })}
          className={fieldClass}
        >
          <option value="">{t("common.select")}</option>
          {EDUCATION_LEVELS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-content-subtle">{t("demographics.educationHint")}</p>
      </div>

      <div className="mb-4">
        <label className="text-sm font-medium" htmlFor="profile-nationality">
          {t("profile.country")}
        </label>
        <select
          id="profile-nationality"
          value={values.nationality}
          onChange={(e) => set({ nationality: e.target.value })}
          className={fieldClass}
        >
          <option value="">{t("common.select")}</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-content-subtle">{t("profile.countryHint")}</p>
      </div>

      <div className="mb-5">
        <label className="text-sm font-medium" htmlFor="profile-profession">
          {t("profile.professionLabel")}
        </label>
        <select
          id="profile-profession"
          value={values.profession}
          onChange={(e) => set({ profession: e.target.value })}
          className={fieldClass}
        >
          <option value="">{t("common.select")}</option>
          {PROFESSIONS.map((p) => (
            <option key={p.key} value={p.key}>
              {t(`professions.${p.key}`)}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-content-subtle">
{t("profile.professionHint")}
        </p>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-lg border border-negative/40 bg-negative-soft px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      {saved && !error ? (
        <p role="status" className="mb-4 rounded-lg border border-positive/40 bg-positive-soft px-4 py-3 text-sm">
          {t("profile.saved")}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? t("profile.saving") : t("profile.saveProfile")}
      </Button>
    </form>
  );
}
