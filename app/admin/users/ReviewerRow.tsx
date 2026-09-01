"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetReviewerPassword, setReviewerActive } from "./actions";

export default function ReviewerRow({
  userId,
  name,
  email,
  active,
}: {
  userId: string;
  name: string;
  email: string;
  active: boolean;
}) {
  const [pending, start] = useTransition();
  const [pw, setPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  return (
    <>
      <tr>
        <td>{name}</td>
        <td className="muted">{email}</td>
        <td>
          <span className={`badge ${active ? "b-good" : "b-neutral"}`}>
            {active ? "Active" : "Inactive"}
          </span>
        </td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <button
            type="button"
            className="btn ghost sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await resetReviewerPassword(userId);
                if (r.ok) {
                  setPw(r.password!);
                  setCopied(false);
                }
                router.refresh();
              })
            }
          >
            Reset password
          </button>{" "}
          <button
            type="button"
            className="btn ghost sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setReviewerActive(userId, !active);
                router.refresh();
              })
            }
          >
            {active ? "Deactivate" : "Reactivate"}
          </button>
        </td>
      </tr>

      {pw && (
        <tr className="cred-row">
          <td colSpan={4}>
            <div className="cred-panel">
              <div className="cred-panel-txt">
                <span className="cred-panel-k">New password — shown once</span>
                <code>{pw}</code>
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(pw);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setPw(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
