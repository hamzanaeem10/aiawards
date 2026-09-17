"use client";

import { useFormStatus } from "react-dom";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn auth-submit"
      type="submit"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? "Sending code…" : "Email me a code →"}
    </button>
  );
}

export default function EmailForm({
  action,
}: {
  action: (fd: FormData) => void;
}) {
  return (
    <form action={action} className="auth-fields">
      <div className="field">
        <label className="flabel" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          type="email"
          name="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@jazz.com.pk"
          inputMode="email"
        />
      </div>
      <Submit />
    </form>
  );
}
