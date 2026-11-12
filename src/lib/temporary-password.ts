/**
 * The shared temporary password the club gives new subcomm logins (TEMPORARY_PASSWORD,
 * the same value as on the club site). A subcomm who logs in with it is sent to
 * /account/password until they choose their own, as on the club site. Server code only.
 */
import { timingSafeEqual } from "node:crypto";

/** Cookie set at login with the temporary password; cleared once it's changed. */
export const PASSWORD_CHANGE_COOKIE = "itc_change_password";

/** Where subcomms go to replace the temporary password. */
export const PASSWORD_CHANGE_PATH = "/account/password";

/** How long the cookie lasts: one day, longer than any single visit. */
export const PASSWORD_CHANGE_COOKIE_SECONDS = 60 * 60 * 24;

/**
 * Whether a password is the shared temporary one. Compares in constant time, and is
 * false when no temporary password is configured.
 */
export function isTemporaryPassword(password: string, configured = process.env.TEMPORARY_PASSWORD) {
  if (!configured) return false;
  const given = Buffer.from(password, "utf8");
  const expected = Buffer.from(configured, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
