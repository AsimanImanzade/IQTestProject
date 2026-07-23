"use client";

import { cn } from "@/lib/utils";
import { MAX_SUPPORTED_AGE, MIN_SUPPORTED_AGE } from "@/core/psychometrics/age-norms";
import { useT } from "@/i18n/client";

/**
 * Shared demographic inputs, used both by the guest pre-test screen and the profile page.
 *
 * Only age affects a score. The copy says so explicitly next to the gender and education fields —
 * people are reasonably suspicious of being asked for these, and the honest answer is that they
 * are recorded for reporting and bias checking and are never used in any calculation.
 *
 * Option values are stable enum keys; the visible labels are translation keys resolved at render
 * time, so the same option set works in any language. Both this component and the profile form
 * consume these.
 */

export const GENDERS = [
  { value: "FEMALE", labelKey: "demographics.female" },
  { value: "MALE", labelKey: "demographics.male" },
  { value: "OTHER", labelKey: "demographics.other" },
  { value: "PREFER_NOT_TO_SAY", labelKey: "common.preferNotToSay" },
] as const;

export const EDUCATION_LEVELS = [
  { value: "PRIMARY", labelKey: "demographics.eduPrimary" },
  { value: "SECONDARY", labelKey: "demographics.eduSecondary" },
  { value: "VOCATIONAL", labelKey: "demographics.eduVocational" },
  { value: "BACHELORS", labelKey: "demographics.eduBachelors" },
  { value: "MASTERS", labelKey: "demographics.eduMasters" },
  { value: "DOCTORATE", labelKey: "demographics.eduDoctorate" },
  { value: "PREFER_NOT_TO_SAY", labelKey: "common.preferNotToSay" },
] as const;

export interface DemographicsValue {
  age: string;
  gender: string;
  educationLevel: string;
}

const fieldClass =
  "mt-1.5 h-12 w-full rounded-xl border border-border bg-surface px-4 text-[0.95rem] " +
  "transition-colors focus:border-accent";

export function DemographicsFields({
  value,
  onChange,
  className,
}: {
  value: DemographicsValue;
  onChange: (next: DemographicsValue) => void;
  className?: string;
}) {
  const t = useT();
  const set = (patch: Partial<DemographicsValue>) => onChange({ ...value, ...patch });

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <label htmlFor="age" className="text-sm font-medium">
          {t("demographics.age")} <span className="text-negative">*</span>
        </label>
        <input
          id="age"
          name="age"
          type="number"
          inputMode="numeric"
          required
          min={MIN_SUPPORTED_AGE}
          max={MAX_SUPPORTED_AGE}
          value={value.age}
          onChange={(e) => set({ age: e.target.value })}
          className={fieldClass}
          aria-describedby="age-hint"
        />
        <p id="age-hint" className="mt-1.5 text-xs text-content-subtle">
          {t("demographics.ageHint", { min: MIN_SUPPORTED_AGE, max: MAX_SUPPORTED_AGE })}
        </p>
      </div>

      <div>
        <label htmlFor="gender" className="text-sm font-medium">
          {t("demographics.gender")}
        </label>
        <select
          id="gender"
          name="gender"
          value={value.gender}
          onChange={(e) => set({ gender: e.target.value })}
          className={fieldClass}
          aria-describedby="gender-hint"
        >
          <option value="">{t("common.select")}</option>
          {GENDERS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
        <p id="gender-hint" className="mt-1.5 text-xs text-content-subtle">
          {t("demographics.genderHint")}
        </p>
      </div>

      <div>
        <label htmlFor="education" className="text-sm font-medium">
          {t("demographics.education")}
        </label>
        <select
          id="education"
          name="education"
          value={value.educationLevel}
          onChange={(e) => set({ educationLevel: e.target.value })}
          className={fieldClass}
          aria-describedby="education-hint"
        >
          <option value="">{t("common.select")}</option>
          {EDUCATION_LEVELS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
        <p id="education-hint" className="mt-1.5 text-xs text-content-subtle">
          {t("demographics.educationHint")}
        </p>
      </div>
    </div>
  );
}
