import type { SupabaseClient } from "@supabase/supabase-js";

/** The signed-in person's learner row, as the club database's ensure_learner() returns it. */
export type Learner = {
  display_name: string;
  /** member: a club account (subcomm or EXCO). guest: registered on the hub only. */
  account_type: "member" | "guest";
  group_number: number | null;
  group_seat: number | null;
  /** EXCO and above: every challenge unlocked, kept off the leaderboard, sees all results. */
  is_admin: boolean;
};

/** Any Supabase client of the hub's (server, browser or admin). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HubClient = SupabaseClient<any, any, any>;

/**
 * Returns the signed-in person's learner row, making it on their first visit: the club
 * database names it as they registered (or after their club profile) and gives a member
 * the ITCamp group the club has for them. Null when nobody is signed in or it failed.
 */
export async function loadLearner(supabase: HubClient): Promise<Learner | null> {
  const { data, error } = await supabase.rpc("ensure_learner");
  if (error) {
    // 42501 just means nobody is signed in.
    if (error.code !== "42501") console.error("loadLearner: ensure_learner failed", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as Learner | undefined) ?? null;
}

/** Guests have no ITCamp group; members need one before their questions can be drawn. */
export function needsGroup(learner: Learner | null) {
  return learner?.account_type === "member" && !learner.group_number;
}
