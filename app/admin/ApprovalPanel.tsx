"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

type Decision = "approved" | "disapproved";

function Actions({ current }: { current: Decision | null }) {
  const { pending } = useFormStatus();
  return (
    <div className="ap-actions">
      <button
        className="btn ap-yes"
        type="submit"
        name="decision"
        value="approved"
        disabled={pending}
      >
        {pending ? "Saving…" : "✓ Approve"}
      </button>
      <button
        className="btn ghost ap-no"
        type="submit"
        name="decision"
        value="disapproved"
        disabled={pending}
      >
        ✕ Disapprove
      </button>
      {current && (
        <span className="ap-hint">Replaces your previous decision</span>
      )}
    </div>
  );
}

/**
 * One approver's sign-off.
 *
 * A recorded decision is shown as a settled result rather than a pre-filled
 * form: the buttons are put away behind "Change decision" so the same person
 * cannot approve the same submission twice by resubmitting, while a genuine
 * correction is still one click away. The database backs this up with a unique
 * index on (submission, approver), so a second row cannot exist regardless of
 * what the client sends.
 */
export default function ApprovalPanel({
  action,
  submissionId,
  current,
  currentNotes,
  decidedAt,
}: {
  action: (fd: FormData) => void;
  submissionId: string;
  current: Decision | null;
  currentNotes: string | null;
  decidedAt: string | null;
}) {
  const [editing, setEditing] = useState(false);

  if (current && !editing) {
    const yes = current === "approved";
    return (
      <div className={`ap-done ${yes ? "is-yes" : "is-no"}`}>
        <span className="ap-mark" aria-hidden="true">{yes ? "✓" : "✕"}</span>
        <div className="ap-done-body">
          <b>You {yes ? "approved" : "disapproved"} this submission</b>
          {decidedAt && <span className="ap-when">on {decidedAt}</span>}
          {currentNotes && <p className="ap-done-notes">{currentNotes}</p>}
        </div>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setEditing(true)}
        >
          Change decision
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="ap-panel">
      <input type="hidden" name="submissionId" value={submissionId} />
      <label className="flabel" htmlFor={`notes-${submissionId}`}>
        {current ? "Revise your decision" : "Your decision"}
      </label>
      <textarea
        id={`notes-${submissionId}`}
        name="notes"
        rows={3}
        defaultValue={currentNotes ?? ""}
        placeholder="Comments or notes for the record (optional)"
        maxLength={2000}
      />
      <Actions current={current} />
      {current && (
        <button
          type="button"
          className="auth-link ap-cancel"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      )}
    </form>
  );
}
