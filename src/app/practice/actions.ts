"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { drawForGuest, drawForMember, shuffle } from "@/lib/draw";
import { GUEST_COOKIE } from "@/lib/guest";
import { isGroupNumber } from "@/lib/groups";
import { withProgress } from "@/lib/progress";
import { MAX_ATTEMPTS, QUESTIONS_PER_QUIZ } from "@/lib/quiz-meta";
import { findQuestion, QUIZZES, type Quiz } from "@/lib/quizzes";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLearner, needsGroup } from "@/lib/supabase/learner";
import { loadProgress } from "@/lib/supabase/progress";
import { createClient } from "@/lib/supabase/server";
import { MODULES } from "@/lib/topics";

/** A question as the browser sees it: shuffled choices and no answer. */
export type PublicQuestion = { id: string; question: string; code?: string; preview?: string; choices: string[] };

/** Feedback for one answered question. */
export type Feedback = { chosen: string; correct: boolean; answer: string; explain: string };

export type Round = {
  mode: "member" | "guest";
  /** null for guests: nothing is saved. */
  attemptId: number | null;
  attemptNo: number | null;
  questions: PublicQuestion[];
  /** Answers already saved, by question position (0-based), when resuming an attempt. */
  answered: (Feedback | null)[];
};

export type StartResult = { ok: true; round: Round } | { ok: false; error: string };
export type AnswerResult = ({ ok: true } & Feedback & { finished: boolean; score: number | null }) | { ok: false; error: string };

const NOT_CONFIGURED = "Scores can't be saved right now. Tell a mentor (the server is missing SUPABASE_SECRET_KEY).";

function toPublic(quiz: Quiz, ids: string[]): PublicQuestion[] | null {
  const questions: PublicQuestion[] = [];
  for (const id of ids) {
    const q = findQuestion(quiz, id);
    if (!q) return null;
    questions.push({ id: q.id, question: q.question, code: q.code, preview: q.preview, choices: shuffle(q.choices) });
  }
  return questions;
}

function feedbackFor(quiz: Quiz, questionId: string, chosen: string): Feedback | null {
  const q = findQuestion(quiz, questionId);
  if (!q) return null;
  return { chosen, correct: chosen === q.choices[0], answer: q.choices[0], explain: q.explain };
}

async function isGuest() {
  return (await cookies()).get(GUEST_COOKIE)?.value === "1";
}

/**
 * Starts (or resumes) a quiz.
 * Signed in: resumes an unfinished attempt, or starts the next one (up to MAX_ATTEMPTS).
 * Members get the questions for their group and seat; registered guests (no ITCamp group)
 * get a random set, saved like a member's. Guest mode (not signed in): a random set that
 * is never saved.
 */
export async function startQuiz(slug: string): Promise<StartResult> {
  const quiz = QUIZZES[slug];
  if (!quiz) return { ok: false, error: "That quiz does not exist." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (!(await isGuest())) return { ok: false, error: "Log in, or continue as a guest, to try this quiz." };
    const questions = toPublic(quiz, drawForGuest(quiz.questions, QUESTIONS_PER_QUIZ));
    if (!questions) return { ok: false, error: "Could not load the questions." };
    return { ok: true, round: { mode: "guest", attemptId: null, attemptNo: null, questions, answered: questions.map(() => null) } };
  }

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NOT_CONFIGURED };

  const loadAttempts = () =>
    admin
      .from("quiz_attempts")
      .select("id, attempt_no, question_ids, finished_at")
      .eq("user_id", user.id)
      .eq("topic_slug", slug)
      .order("attempt_no");

  // One round trip: progress (for the lock), the learner (group) and attempts are fetched together.
  const [progress, learner, firstLoad] = await Promise.all([
    loadProgress(supabase, user.id),
    loadLearner(supabase),
    loadAttempts(),
  ]);
  const topic = withProgress(MODULES, progress)
    .flatMap((m) => m.topics)
    .find((t) => t.slug === slug);
  if (topic?.lockedReason) return { ok: false, error: topic.lockedReason };
  if (!learner) return { ok: false, error: "We could not load your account. Please refresh the page." };
  if (needsGroup(learner) || (learner.group_number && !learner.group_seat)) {
    return { ok: false, error: "Choose your ITCamp group first." };
  }

  let { data: attempts, error } = firstLoad;
  if (error || !attempts) {
    console.error("startQuiz: loading attempts failed", error);
    return { ok: false, error: "We could not load your attempts. Please try again." };
  }

  let current = attempts.find((a) => !a.finished_at);
  let isNew = false;
  if (!current) {
    if (attempts.length >= MAX_ATTEMPTS) return { ok: false, error: "You have used both attempts for this quiz." };
    const attemptNo = attempts.length + 1;
    // Teammates get different questions by group and seat; a registered guest has no group.
    const ids =
      learner.group_number && learner.group_seat
        ? drawForMember(quiz.questions, QUESTIONS_PER_QUIZ, {
            slug,
            group: learner.group_number,
            seat: learner.group_seat,
            attempt: attemptNo,
          })
        : drawForGuest(quiz.questions, QUESTIONS_PER_QUIZ);
    const insert = await admin
      .from("quiz_attempts")
      .insert({ user_id: user.id, topic_slug: slug, attempt_no: attemptNo, question_ids: ids, total: ids.length })
      .select("id, attempt_no, question_ids, finished_at")
      .single();
    if (insert.error) {
      // Started in another tab at the same moment: use that one.
      if (insert.error.code !== "23505") {
        console.error("startQuiz: starting an attempt failed", insert.error);
        return { ok: false, error: "We could not start your attempt. Please try again." };
      }
      ({ data: attempts, error } = await loadAttempts());
      current = attempts?.find((a) => !a.finished_at);
      if (error || !current) return { ok: false, error: "We could not start your attempt. Please refresh the page." };
    } else {
      current = insert.data;
      isNew = true;
    }
  }

  const questions = toPublic(quiz, current.question_ids);
  if (!questions) return { ok: false, error: "A question in this attempt was removed from the bank. Tell a mentor." };

  // Only a resumed attempt can have saved answers.
  const { data: saved } = isNew
    ? { data: [] as { position: number; question_id: string; chosen: string }[] }
    : await admin.from("quiz_answers").select("position, question_id, chosen").eq("attempt_id", current.id);
  const answered: (Feedback | null)[] = questions.map(() => null);
  for (const row of saved ?? []) answered[row.position - 1] = feedbackFor(quiz, row.question_id, row.chosen);

  return { ok: true, round: { mode: "member", attemptId: current.id, attemptNo: current.attempt_no, questions, answered } };
}

/**
 * Grades one answer. Members: saved straight away and can't be changed, so refreshing
 * the page never gives a second try. Guests: graded only.
 */
export async function answerQuestion(
  slug: string,
  attemptId: number | null,
  position: number,
  questionId: string,
  chosen: string,
): Promise<AnswerResult> {
  const quiz = QUIZZES[slug];
  const question = quiz && findQuestion(quiz, questionId);
  if (!quiz || !question || !question.choices.includes(chosen)) return { ok: false, error: "That answer is not valid." };
  const feedback = feedbackFor(quiz, questionId, chosen)!;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (attemptId === null) {
    if (user || !(await isGuest())) return { ok: false, error: "Please refresh the page and start again." };
    return { ok: true, ...feedback, finished: false, score: null };
  }
  if (!user) return { ok: false, error: "Your session ended. Log in again to keep going." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: NOT_CONFIGURED };

  // One database call (the club database's learning_hub.submit_answer, service role only): it
  // checks the attempt is yours, saves the answer and returns the score.
  const { data, error } = await admin.rpc("submit_answer", {
    p_user: user.id,
    p_attempt: attemptId,
    p_position: position,
    p_question: questionId,
    p_chosen: chosen,
    p_correct: feedback.correct,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "That attempt is not yours." };
    if (error.code !== "23505") console.error("answerQuestion: saving the answer failed", error);
    return { ok: false, error: answerError(error) };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, ...feedback, finished: !!row?.finished, score: row?.score ?? null };
}

function answerError(error: { code?: string; message?: string }) {
  if (error.code === "23505") return "You already answered this question. Refresh the page.";
  if (error.message?.includes("already finished")) return "This attempt is already finished.";
  if (error.message?.includes("not part of this attempt")) return "That question is not in this attempt.";
  return "We could not save your answer. Please try again.";
}

/** For members the club has no ITCamp group for. The group can only be set once. */
export async function setMyGroup(group: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isGroupNumber(group)) return { ok: false, error: "Choose a valid group number." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_group", { group_no: group });
  if (error) {
    return {
      ok: false,
      error: error.message.includes("already set") ? "Your group is already set. Ask a mentor to change it." : "We could not save your group. Please try again.",
    };
  }
  refresh();
  return { ok: true };
}
