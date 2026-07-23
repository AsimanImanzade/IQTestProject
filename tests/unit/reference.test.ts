import { describe, expect, it } from "vitest";
import { COUNTRIES, countryName, isValidCountryCode } from "@/core/reference/countries";
import { NATIONAL_IQ, nationalReference } from "@/core/reference/national-iq";
import { PROFESSIONS, professionReference } from "@/core/reference/professions";
import { compareToCountry, compareToProfession } from "@/core/reference/comparison";

describe("country catalogue", () => {
  it("has unique ISO codes and non-empty names", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.name.length).toBeGreaterThan(0);
    }
  });

  it("includes Azerbaijan and validates codes", () => {
    expect(isValidCountryCode("AZ")).toBe(true);
    expect(countryName("AZ")).toBe("Azerbaijan");
    expect(isValidCountryCode("ZZ")).toBe(false);
  });
});

describe("national reference figures", () => {
  it("every figure is a plausible whole number", () => {
    for (const [code, value] of Object.entries(NATIONAL_IQ)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(Number.isInteger(value)).toBe(true);
      // A whole-number sanity band; anything outside signals a transcription error.
      expect(value).toBeGreaterThanOrEqual(60);
      expect(value).toBeLessThanOrEqual(120);
    }
  });

  it("every country that has a figure is a selectable country", () => {
    for (const code of Object.keys(NATIONAL_IQ)) {
      expect(isValidCountryCode(code), `${code} has an IQ figure but is not selectable`).toBe(true);
    }
  });

  it("returns a sourced reference for a known country and null otherwise", () => {
    const az = nationalReference("AZ");
    expect(az).not.toBeNull();
    expect(az!.average).toBe(AZ_IQ);
    expect(az!.source.year).toBe(2025);
    expect(az!.source.url).toContain("http");

    expect(nationalReference("ZZ")).toBeNull();
    expect(nationalReference(null)).toBeNull();
  });

  it("does not imply false precision", () => {
    // Whole numbers only — "98.03" would claim certainty the estimate does not have.
    for (const value of Object.values(NATIONAL_IQ)) {
      expect(value % 1).toBe(0);
    }
  });
});

describe("profession reference figures", () => {
  it("has unique keys and monotonic-free but plausible figures", () => {
    const keys = PROFESSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);

    for (const profession of PROFESSIONS) {
      if (profession.average !== null) {
        expect(Number.isInteger(profession.average)).toBe(true);
        expect(profession.average).toBeGreaterThanOrEqual(80);
        expect(profession.average).toBeLessThanOrEqual(140);
      }
    }
  });

  it("carries grouping options that have no figure", () => {
    // Student / Other / Prefer-not-to-say must be selectable but produce no comparison.
    for (const key of ["STUDENT", "OTHER", "PREFER_NOT_TO_SAY"]) {
      expect(professionReference(key)).toBeNull();
    }
  });

  it("returns a labelled, sourced reference for a real profession", () => {
    const eng = professionReference("ENGINEERING");
    expect(eng).not.toBeNull();
    expect(eng!.label).toMatch(/engineering/i);
    expect(eng!.source.note).toMatch(/within-profession/i);
  });
});

// Azerbaijan is guaranteed present; pin it once so noUncheckedIndexedAccess is satisfied.
const AZ_IQ = NATIONAL_IQ.AZ ?? 0;

describe("score comparison", () => {
  it("reports the difference and direction against a country", () => {
    const comparison = compareToCountry(118, "AZ");
    expect(comparison).not.toBeNull();
    expect(comparison!.groupLabel).toBe("Azerbaijan");
    expect(comparison!.referenceAverage).toBe(AZ_IQ);
    expect(comparison!.difference).toBe(118 - AZ_IQ);
    expect(comparison!.direction).toBe("above");
    expect(comparison!.caveat).toMatch(/not on the same calibrated scale/i);
  });

  it("reports a below-average direction", () => {
    const comparison = compareToCountry(90, "AZ");
    expect(comparison!.direction).toBe("below");
    expect(comparison!.difference).toBeLessThan(0);
  });

  it("rounds the user's score so the arithmetic is consistent", () => {
    const comparison = compareToCountry(117.6, "AZ");
    // Displayed score and difference must agree: round(117.6)=118, 118-98=20.
    expect(comparison!.userScore).toBe(118);
    expect(comparison!.difference).toBe(118 - AZ_IQ);
  });

  it("compares against a profession with its own caveat", () => {
    const comparison = compareToProfession(130, "MEDICINE");
    expect(comparison!.groupLabel).toMatch(/medicine/i);
    expect(comparison!.caveat).toMatch(/within any profession is far larger/i);
  });

  it("returns null when there is no reference to compare against", () => {
    expect(compareToCountry(120, "ZZ")).toBeNull();
    expect(compareToCountry(120, null)).toBeNull();
    expect(compareToProfession(120, "STUDENT")).toBeNull();
    expect(compareToProfession(120, null)).toBeNull();
  });
});
