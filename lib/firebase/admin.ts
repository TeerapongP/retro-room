import type { User } from "firebase/auth";

/** Fixed admin identity (D74). Firestore Rules enforce it; this check only decides which controls are shown. */
export const ADMIN_EMAIL = "thirapong.pin@ascendcorp.com";

export function isAdminUser(user: Pick<User, "email" | "emailVerified"> | null | undefined): boolean {
  return user?.email === ADMIN_EMAIL && user.emailVerified === true;
}
