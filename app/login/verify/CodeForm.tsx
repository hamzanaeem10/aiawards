"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function Submit({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="btn auth-submit"
      type="submit"
      disabled={pending || !ready}
      aria-busy={pending}
    >
      {pending ? "Verifying…" : "Verify and continue →"}
    </button>
  );
}

export default function CodeForm({
  action,
  length,
}: {
  action: (fd: FormData) => void;
  length: number;
}) {
  const [code, setCode] = useState("");

  return (
    <form action={action} className="auth-fields">
      <div className="field">
        <label className="flabel" htmlFor="code">
          {length}-digit code
        </label>
        <input
          id="code"
          name="code"
          className="code-input"
          required
          autoFocus
          // A numeric one-time code: let the OS/browser autofill it from the
          // email and bring up the number pad on mobile.
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`\\d{${length}}`}
          maxLength={length}
          placeholder={"0".repeat(length)}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, length))}
        />
      </div>
      <Submit ready={code.length === length} />
    </form>
  );
}
