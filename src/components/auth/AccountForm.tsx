"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  userId: string;
  initialName: string;
  /** Admins are kept off the leaderboard. */
  onLeaderboard: boolean;
};

export function AccountForm({ userId, initialName, onLeaderboard }: Props) {
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  function show(text: string, error: boolean) {
    setMessage(text);
    setIsError(error);
    setBusy(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = String(new FormData(event.currentTarget).get("displayName")).trim();
    setBusy(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.from("learners").update({ display_name: displayName }).eq("user_id", userId);
    if (error) {
      show(
        error.code === "23505"
          ? "That display name is taken. Try a different one."
          : error.code === "23514"
            ? "Use 2 to 30 characters."
            : "We could not save your display name. Please try again.",
        true,
      );
      return;
    }
    // The header reads the name from the session, so keep it in step.
    await supabase.auth.updateUser({ data: { display_name: displayName } });
    show("Display name saved.", false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label htmlFor="displayName" className="flex flex-col gap-2">
        Display name
        <input
          id="displayName"
          name="displayName"
          required
          minLength={2}
          maxLength={30}
          defaultValue={initialName}
          autoComplete="nickname"
          className="w-full border border-violet bg-bg/85 px-3.5 py-3 text-ink"
        />
        <span className="text-sm text-dim">
          {onLeaderboard ? "Shown on the leaderboard, which members can see." : "Shown in the header and on your account."}
        </span>
      </label>
      {message && (
        <p role={isError ? "alert" : "status"} className="border border-accent bg-bg/85 px-3.5 py-3">
          {message}
        </p>
      )}
      <button type="submit" disabled={busy} className="cta self-start disabled:opacity-60">
        {busy ? "Saving" : "Save changes"}
      </button>
    </form>
  );
}
