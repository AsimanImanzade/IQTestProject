/**
 * Shaping a generated item for the database.
 *
 * The persistence layer stores each localized string twice: the English form in a plain column
 * (the always-present fallback and the query/signature path) and the full localized object in a
 * companion JSON column. This helper performs that split once so the seed script and the
 * integration-test seeder stay identical.
 */

import { commonLocales, type LocalizedString } from "../i18n";
import type { GeneratedItem } from "../types";

export interface PersistableChoice {
  ordinal: number;
  text: string | null;
  textI18n: LocalizedString | null;
  svg: string | null;
  isCorrect: boolean;
  rationale: string;
  rationaleI18n: LocalizedString;
}

export interface PersistableItem {
  stem: string;
  stemI18n: LocalizedString;
  explanation: string;
  explanationI18n: LocalizedString;
  /** Languages the whole item is fully usable in. */
  locales: string[];
  choices: PersistableChoice[];
}

export function toPersistable(item: GeneratedItem): PersistableItem {
  const strings: LocalizedString[] = [item.stem, item.explanation];
  for (const choice of item.choices) {
    if (choice.text) strings.push(choice.text);
    strings.push(choice.rationale);
  }

  return {
    stem: item.stem.en,
    stemI18n: item.stem,
    explanation: item.explanation.en,
    explanationI18n: item.explanation,
    locales: commonLocales(strings),
    choices: item.choices.map((choice, ordinal) => ({
      ordinal,
      text: choice.text ? choice.text.en : null,
      textI18n: choice.text ?? null,
      svg: choice.svg ?? null,
      isCorrect: choice.isCorrect,
      rationale: choice.rationale.en,
      rationaleI18n: choice.rationale,
    })),
  };
}
