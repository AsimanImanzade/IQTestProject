import { getSessionUser } from "./auth/session";
import { getGuestKey } from "./auth/guest";
import type { AttemptOwner } from "./services/attempts";

/**
 * Resolve the current owner inside a server component.
 *
 * Unlike the API helper this never creates a guest identity: server components cannot set
 * cookies during render in the App Router, and attempting to would throw. Pages only ever need to
 * *read* who the visitor is; identities are issued by the route handler that starts a test.
 */
export async function resolveOwnerForPage(): Promise<AttemptOwner | null> {
  const user = await getSessionUser();
  if (user) return { userId: user.id };

  const guestKey = await getGuestKey();
  if (guestKey) return { guestKey };

  return null;
}
