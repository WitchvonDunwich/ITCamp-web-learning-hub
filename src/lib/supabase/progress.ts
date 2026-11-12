import { bestScores, type Progress } from "@/lib/progress";
import { loadLearner, type HubClient } from "@/lib/supabase/learner";

/** The learner's admin flag and best finished score per quiz. Works with the server or browser client. */
export async function loadProgress(supabase: HubClient, userId: string): Promise<Progress> {
  const [learner, { data: attempts }] = await Promise.all([
    loadLearner(supabase),
    supabase
      .from("quiz_attempts")
      .select("quiz_slug:topic_slug, score, total")
      .eq("user_id", userId)
      .not("finished_at", "is", null),
  ]);
  return { isAdmin: !!learner?.is_admin, best: bestScores(attempts ?? []) };
}
