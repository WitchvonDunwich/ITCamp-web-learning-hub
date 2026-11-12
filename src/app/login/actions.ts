"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GUEST_COOKIE, GUEST_COOKIE_SECONDS } from "@/lib/guest";
import { safeNext } from "@/lib/safe-next";
import { loadLearner } from "@/lib/supabase/learner";
import { createClient } from "@/lib/supabase/server";
import {
  isTemporaryPassword,
  PASSWORD_CHANGE_COOKIE,
  PASSWORD_CHANGE_COOKIE_SECONDS,
  PASSWORD_CHANGE_PATH,
} from "@/lib/temporary-password";

/**
 * Runs right after a successful login. Makes sure they have a learner row (made on the first
 * visit, with a member's ITCamp group from the club's records) and keeps the name the header
 * shows in step with it. Anyone who used the shared temporary password must choose their own
 * first, so this returns the change-password page for them, and null for everyone else.
 * Logging in also ends guest mode.
 */
export async function checkPasswordChange(password: string): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_COOKIE);

  // The header reads the name from the session (src/lib/use-session.ts).
  const learner = user ? await loadLearner(supabase) : null;
  if (user && learner && user.user_metadata?.display_name !== learner.display_name) {
    await supabase.auth.updateUser({ data: { display_name: learner.display_name } });
  }

  // Only club logins are ever given the temporary password, and most club logins don't carry
  // a role in their metadata, so the password itself is the check.
  if (user && isTemporaryPassword(password)) {
    cookieStore.set(PASSWORD_CHANGE_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PASSWORD_CHANGE_COOKIE_SECONDS,
    });
    return PASSWORD_CHANGE_PATH;
  }
  // Their own password: drop any leftover reminder from an earlier login.
  cookieStore.delete(PASSWORD_CHANGE_COOKIE);
  return null;
}

/** Guest mode: read the notes and try quizzes without an account. Nothing is saved. */
export async function continueAsGuest(next: string) {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_COOKIE, "1", {
    // The header reads it to show "Guest", so it isn't httpOnly. It grants nothing secret.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_COOKIE_SECONDS,
  });
  redirect(safeNext(next));
}

export async function leaveGuestMode() {
  (await cookies()).delete(GUEST_COOKIE);
}
