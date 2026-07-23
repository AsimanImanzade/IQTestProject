import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handleRouteError, parseBody } from "@/server/api-helpers";
import { setLocaleCookie } from "@/server/locale";
import { getSessionUser } from "@/server/auth/session";
import { updateProfile } from "@/server/services/demographics";
import { LOCALES } from "@/core/i18n";

const LocaleSchema = z.object({
  locale: z.enum(LOCALES),
});

/**
 * POST /api/locale — set the interface/test language.
 *
 * Works for everyone: the cookie is always written (that is what makes it work for guests). For a
 * signed-in user the choice is also saved to their profile so it follows them across devices.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { locale } = await parseBody(request, LocaleSchema);

    await setLocaleCookie(locale);

    const user = await getSessionUser();
    if (user) {
      await updateProfile(user.id, { language: locale });
    }

    return NextResponse.json({ locale });
  } catch (error) {
    return handleRouteError(error);
  }
}
