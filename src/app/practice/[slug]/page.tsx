import { PageVeil } from "@/components/layout/PageVeil";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { GroupPicker } from "@/components/account/GroupPicker";
import { Quiz } from "@/components/practice/Quiz";
import { formatDateTime } from "@/lib/format";
import { GUEST_COOKIE } from "@/lib/guest";
import { bestScores, withProgress } from "@/lib/progress";
import { MAX_ATTEMPTS } from "@/lib/quiz-meta";
import { findQuestion, QUIZZES } from "@/lib/quizzes";
import { loadLearner, needsGroup } from "@/lib/supabase/learner";
import { createClient } from "@/lib/supabase/server";
import { MODULES } from "@/lib/topics";

// Checks the member's progress, so this page renders per request.
export const instant = false;

export async function generateMetadata(props: PageProps<"/practice/[slug]">): Promise<Metadata> {
  const quiz = QUIZZES[(await props.params).slug];
  return { title: quiz ? `${quiz.title} challenge · ITCamp Learning Hub` : "Challenge · ITCamp Learning Hub" };
}

type AnswerRow = { position: number; question_id: string; chosen: string; is_correct: boolean; answered_at: string };
type AttemptRow = {
  id: number;
  attempt_no: number;
  score: number;
  total: number;
  started_at: string;
  finished_at: string | null;
  quiz_answers: AnswerRow[];
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-3 sm:px-8">
      <PageVeil />
      <Link href="/practice" className="font-mono text-sm tracking-wider text-dim uppercase hover:text-accent">
        ← All challenges
      </Link>
      <div className="mt-3 flex flex-col gap-6">{children}</div>
    </main>
  );
}

export default async function QuizPage(props: PageProps<"/practice/[slug]">) {
  await connection();
  const { slug } = await props.params;
  const quiz = QUIZZES[slug];
  if (!quiz) notFound();

  // src/proxy.ts sends visitors who are neither logged in nor guests to the login page.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const guest = (await cookies()).get(GUEST_COOKIE)?.value === "1";
    return (
      <Shell>
        {guest ? (
          <Quiz slug={slug} title={quiz.title} lesson={quiz.lesson} mode="guest" />
        ) : (
          <section className="border border-violet bg-bg p-6 sm:p-8">
            <p className="text-lg">Log in, or continue as a guest, to try this quiz.</p>
            <Link href={`/login?next=/practice/${slug}`} className="cta mt-6">
              Log in
            </Link>
          </section>
        )}
      </Shell>
    );
  }

  // One round trip: the learner (made on their first visit) and the attempts (with their
  // answers) are fetched together, and the lock for this quiz is worked out from the same attempts.
  const [learner, { data: attemptData }, { data: allAttempts }] = await Promise.all([
    loadLearner(supabase),
    supabase
      .from("quiz_attempts")
      .select("id, attempt_no, score, total, started_at, finished_at, quiz_answers(position, question_id, chosen, is_correct, answered_at)")
      .eq("user_id", user.id)
      .eq("topic_slug", slug)
      .order("attempt_no"),
    supabase.from("quiz_attempts").select("quiz_slug:topic_slug, score, total").eq("user_id", user.id).not("finished_at", "is", null),
  ]);
  const progress = { isAdmin: !!learner?.is_admin, best: bestScores(allAttempts ?? []) };
  const lockedReason = withProgress(MODULES, progress)
    .flatMap((m) => m.topics)
    .find((t) => t.slug === slug)?.lockedReason;
  if (lockedReason) {
    return (
      <Shell>
        <section className="border border-violet bg-bg p-6 sm:p-8">
          <p className="font-mono text-sm tracking-wider text-accent uppercase">Locked</p>
          <h1 className="mt-2 text-4xl font-semibold">{quiz.title} challenge</h1>
          <p className="mt-3 text-lg text-dim">{lockedReason} first, then come back for this mission.</p>
          <Link href="/practice" className="cta mt-6">
            Back to Challenge
          </Link>
        </section>
      </Shell>
    );
  }

  const attempts = (attemptData ?? []) as AttemptRow[];
  const finished = attempts.filter((a) => a.finished_at);
  const open = attempts.find((a) => !a.finished_at);
  const best = finished.length ? Math.max(...finished.map((a) => a.score)) : null;

  return (
    <Shell>
      {needsGroup(learner) ? (
        <>
          <section className="border border-violet bg-bg p-6 sm:p-8">
            <h1 className="text-4xl font-semibold">{quiz.title} challenge</h1>
            <p className="mt-3 text-lg text-dim">
              Teammates get different questions, so we need your ITCamp group before you start.
            </p>
          </section>
          <GroupPicker />
        </>
      ) : open || finished.length < MAX_ATTEMPTS ? (
        <Quiz
          // A new key after each finished attempt, so the next one starts fresh.
          key={`${finished.length}-${open?.id ?? "new"}`}
          slug={slug}
          title={quiz.title}
          lesson={quiz.lesson}
          mode="member"
          attemptNo={open?.attempt_no ?? finished.length + 1}
          resuming={!!open && open.quiz_answers.length > 0}
        />
      ) : (
        <section className="border border-violet bg-bg p-6 sm:p-10">
          <p className="font-mono text-sm tracking-wider text-accent uppercase">Mission complete</p>
          <h1 className="mt-2 text-5xl font-semibold">{quiz.title} challenge</h1>
          <p className="mt-4 text-lg text-dim">
            You have used both attempts. Your score for this quiz is your best one: {best} / {finished[0].total}.
          </p>
        </section>
      )}

      {attempts.length > 0 && (
        <section aria-labelledby="record-heading" className="border border-violet bg-bg/90 p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="record-heading" className="text-2xl font-semibold">
              Your record
            </h2>
            <p className="font-mono text-sm text-dim">
              Attempts used: {finished.length} / {MAX_ATTEMPTS}
              {best !== null && ` · Best: ${best} / ${finished[0].total}`}
            </p>
          </div>
          <ol className="mt-4 flex flex-col gap-5">
            {attempts.map((attempt) => (
              <li key={attempt.id} className="border border-grid p-4">
                <p className="font-medium">
                  Attempt {attempt.attempt_no}:{" "}
                  {attempt.finished_at
                    ? `${attempt.score} / ${attempt.total}`
                    : `in progress (${attempt.quiz_answers.length} / ${attempt.total} answered)`}
                </p>
                <p className="mt-0.5 font-mono text-xs text-dim">
                  Started {formatDateTime(attempt.started_at)}
                  {attempt.finished_at && ` · Finished ${formatDateTime(attempt.finished_at)}`}
                </p>
                <ol className="mt-3 flex flex-col gap-2">
                  {[...attempt.quiz_answers]
                    .sort((a, b) => a.position - b.position)
                    .map((answer) => {
                      const question = findQuestion(quiz, answer.question_id);
                      return (
                        <li key={answer.position} className="text-sm">
                          <p>
                            <span className={answer.is_correct ? "text-accent" : "text-[#ffb38a]"}>
                              {answer.is_correct ? "✓" : "✗"}
                            </span>{" "}
                            Q{answer.position}. {question?.question ?? answer.question_id}
                          </p>
                          <p className="ml-5 text-dim">
                            Your answer: <span className="font-mono text-ink">{answer.chosen}</span>
                            {!answer.is_correct && question && (
                              <>
                                {" "}
                                · Correct: <span className="font-mono text-ink">{question.choices[0]}</span>
                              </>
                            )}
                          </p>
                          <p className="ml-5 font-mono text-xs text-dim">Answered {formatDateTime(answer.answered_at)}</p>
                        </li>
                      );
                    })}
                </ol>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Shell>
  );
}
