import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/i18n/client";
import { getServerT } from "@/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Cognitive Reasoning Assessment",
    template: "%s · Cognitive Reasoning Assessment",
  },
  description:
    "A 20-question reasoning assessment scored with item response theory. Provides an estimate of reasoning ability — not a clinically administered IQ test.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfd" },
    { media: "(prefers-color-scheme: dark)", color: "#14161f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getServerT();

  return (
    // lang is set from the active locale for correct screen-reader pronunciation and hyphenation.
    // suppressHydrationWarning is required: next-themes sets the class on <html> before React
    // hydrates, which is intentional (it prevents a flash of the wrong theme).
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale}>
          <ThemeProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-content"
            >
              {t("skipToContent")}
            </a>
            {children}
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
