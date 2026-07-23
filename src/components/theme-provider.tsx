"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // Theme changes would otherwise animate every colour token on the page at once.
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
