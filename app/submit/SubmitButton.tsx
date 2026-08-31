"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Submitting…" : "Submit initiative →"}
    </button>
  );
}
