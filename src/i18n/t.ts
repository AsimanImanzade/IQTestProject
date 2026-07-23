import type { Messages } from "./messages/en";

/**
 * The translation function.
 *
 * Keys are dot-paths into the message tree, e.g. `t("runner.question")`. `{placeholders}` in the
 * string are replaced from the params object. A missing key returns the key itself (visible in
 * development, harmless in production) rather than throwing — a broken string should never crash a
 * page.
 */
export type TranslateParams = Record<string, string | number>;
export type TranslateFn = (key: string, params?: TranslateParams) => string;

function lookup(messages: Messages, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), messages);
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

export function createTranslator(messages: Messages): TranslateFn {
  return (key, params) => {
    const template = lookup(messages, key);
    if (template === undefined) return key;
    return interpolate(template, params);
  };
}
