import type { User } from "firebase/auth";

/** Fixed admin identities (D74). Firestore Rules enforce it; this check only decides which controls are shown. */
export const ADMIN_EMAILS: readonly string[] = [
  "thirapong.pin@ascendcorp.com",
  "thitika.42@gmail.com",
];

/** @deprecated Use ADMIN_EMAILS. Kept for tests that need a single representative email. */
export const ADMIN_EMAIL = ADMIN_EMAILS[0];

export function isAdminUser(user: Pick<User, "email" | "emailVerified"> | null | undefined): boolean {
  return user?.email != null && ADMIN_EMAILS.includes(user.email) && user.emailVerified === true;
}
