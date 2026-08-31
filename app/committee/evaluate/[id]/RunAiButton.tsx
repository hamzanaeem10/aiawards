"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAiAssessment } from "./actions";

// Plain button, not a <form> — this renders inside the Scorecard's <form> and a
// nested form would be invalid. The server action is invoked directly.
export default function RunAiButton({
  submissionId,
  label,
}: {
  submissionId: string;
  label: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  return (
    <span className="run-ai">
      <button
        type="button"
        className="btn ghost sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            try {
              await runAiAssessment(submissionId);
              router.refresh();
            } catch {
              setErr("Couldn't reach the AI service — try again.");
            }
          })
        }
      >
        {pending ? "Assessing…" : label}
      </button>
      {err && (
        <span className="ev-err" style={{ marginLeft: 10 }}>
          {err}
        </span>
      )}
    </span>
  );
}
