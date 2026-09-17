"use client";

import { useRef, useState } from "react";
import { CONTRIBUTIONS } from "@/lib/teamMembers";

/** Rows rendered before any JS runs, so a no-JS submitter can still list a few. */
const INITIAL_ROWS = 3;
const MAX_ROWS = 15;

/**
 * Repeatable name + contribution rows, submitted as parallel `teamMemberName`
 * and `teamMemberContribution` fields and zipped server-side.
 *
 * Visibility is NOT handled here. The submission type lives in Section 1 and
 * this list in Section 2, and the two are linked by a CSS `:has()` rule in
 * globals.css rather than shared client state — see the note there. This
 * component only owns which rows exist.
 *
 * Rows are tracked by a stable id, not a count: the inputs are uncontrolled, so
 * keying by id lets React keep each row's DOM node when one in the middle is
 * removed. Keying by index would shift everyone's typed values up a row.
 *
 * Blank rows are harmless — the server drops any row without a name, and stores
 * an empty list outright for an Individual submission.
 */
export default function TeamMembers() {
  const [ids, setIds] = useState<number[]>(() =>
    Array.from({ length: INITIAL_ROWS }, (_, i) => i),
  );
  const nextId = useRef(INITIAL_ROWS);

  function addRow() {
    setIds((prev) =>
      prev.length >= MAX_ROWS ? prev : [...prev, nextId.current++],
    );
  }

  function removeRow(id: number) {
    setIds((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x !== id)));
  }

  return (
    <div className="field team-members">
      <label className="flabel">
        Team members <span className="opt">optional</span>
      </label>
      <p className="fhelp">
        Who worked on this, and what they contributed. Leave any row blank to
        skip it.
      </p>

      <div className="tm-rows">
        {ids.map((id, i) => (
          <div className="tm-row" key={id}>
            <input
              type="text"
              name="teamMemberName"
              placeholder="Full name"
              aria-label={`Team member ${i + 1} name`}
            />
            <select
              name="teamMemberContribution"
              defaultValue=""
              aria-label={`Team member ${i + 1} contribution`}
            >
              <option value="">Contribution…</option>
              {CONTRIBUTIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {ids.length > 1 && (
              <button
                type="button"
                className="tm-remove"
                onClick={() => removeRow(id)}
                aria-label={`Remove team member ${i + 1}`}
                title="Remove this row"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {ids.length < MAX_ROWS && (
        <button type="button" className="btn ghost sm tm-add" onClick={addRow}>
          + Add team member
        </button>
      )}
    </div>
  );
}
