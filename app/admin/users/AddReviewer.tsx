"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createReviewer } from "./actions";

export default function AddReviewer() {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="card pad-lg">
      <div className="section-head">
        <span className="n">+</span>
        <h2>Add a reviewer</h2>
      </div>

      {created ? (
        <div className="reviewer-added">
          <div className="ra-head">
            <span className="ra-check" aria-hidden="true">✓</span>
            <b>Reviewer added</b>
          </div>

          <dl className="ra-creds">
            <div>
              <dt>Email</dt>
              <dd>{created.email}</dd>
            </div>
            <div>
              <dt>Password — shown once</dt>
              <dd className="ra-pw">
                <code>{created.password}</code>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => copy(created.password)}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </dd>
            </div>
          </dl>

          <p className="ra-hint">
            Send both to the reviewer. If it&apos;s lost, reset the password from
            the list below.
          </p>

          <button
            type="button"
            className="btn"
            onClick={() => {
              setCreated(null);
              setCopied(false);
              form.current?.reset();
            }}
          >
            + Add another
          </button>
        </div>
      ) : (
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setErr(null);
            start(async () => {
              const r = await createReviewer({
                name: String(fd.get("name") || ""),
                email: String(fd.get("email") || ""),
              });
              if (!r.ok) setErr(r.error ?? "Something went wrong.");
              else {
                setCreated({
                  email: String(fd.get("email")).trim().toLowerCase(),
                  password: r.password!,
                });
                router.refresh();
              }
            });
          }}
        >
          <div className="row2">
            <div className="field">
              <label className="flabel">
                Name <span className="req">*</span>
              </label>
              <input type="text" name="name" required autoComplete="off" />
            </div>
            <div className="field">
              <label className="flabel">
                Email <span className="req">*</span>
              </label>
              <input type="email" name="email" required autoComplete="off" />
            </div>
          </div>
          {err && <p className="ev-err" style={{ marginTop: 0 }}>{err}</p>}
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create reviewer"}
          </button>
        </form>
      )}
    </div>
  );
}
