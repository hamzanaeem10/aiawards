"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CRITERIA,
  TIERS,
  weightedTotal,
  tierFor,
  nextStepText,
} from "@/lib/rubric";
import { recordAssessment } from "./actions";
import WeightBar from "./WeightBar";

function RecordButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Recording…" : label}
    </button>
  );
}

const TIER_CLASS: Record<string, string> = {
  award: "tier-award",
  finalist: "tier-finalist",
  hero: "tier-hero",
  develop: "tier-develop",
  noprogress: "tier-noprogress",
};

/** "Evidence", "Evidence and Responsible AI", "A, B and C" */
function list(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

type Initial = {
  scores: Record<string, number>;
  rationale?: string | null;
  recommendation?: string;
  additionalValidation?: string;
};

export default function Scorecard({
  submissionId,
  initial,
  children,
}: {
  submissionId: string;
  initial?: Initial;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState<Record<string, number>>(initial?.scores ?? {});
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [recommendation, setRecommendation] = useState(initial?.recommendation ?? "auto");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const total = useMemo(() => weightedTotal(scores), [scores]);
  const unscored = CRITERIA.filter((c) => !scores[c.key]);
  const scoredCount = CRITERIA.length - unscored.length;
  const allScored = unscored.length === 0;
  const autoTier = allScored ? tierFor(total) : null;
  const outcome = recommendation === "auto" ? autoTier?.key : recommendation;

  const overridden = recommendation !== "auto";
  const tierLabel = allScored
    ? (TIERS.find((t) => t.key === outcome)?.label ?? "") +
      (overridden ? " · override" : "")
    : "Indicative tier appears once all five are scored";
  const tierClass = allScored && outcome ? TIER_CLASS[outcome] : "tier-pending";

  const hasRecorded = !!initial?.scores && Object.keys(initial.scores).length > 0;
  const action = recordAssessment.bind(null, submissionId);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes the drawer. It is non-modal — the submission stays readable
  // and interactive behind it, and closing keeps everything already entered.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Move focus with the drawer — into it on open, back to the trigger on close.
  // Deferred to the effect so the trigger is no longer `hidden` when we call it.
  const opened = useRef(false);
  useEffect(() => {
    if (open) headingRef.current?.focus();
    else if (opened.current) triggerRef.current?.focus();
    opened.current = open;
  }, [open]);

  // What still stands between here and a recordable assessment.
  const blockers: string[] = [];
  if (!allScored) blockers.push(`scores for ${list(unscored.map((c) => c.label))}`);
  if (!rationale.trim()) blockers.push("a rationale");

  return (
    <div className="eval-shell" data-open={open}>
      <div className="wrap eval-page stack eval-doc">{children}</div>

      {/* Sheet-mode only: tapping beside the sheet closes it. */}
      <button
        type="button"
        className="eval-scrim"
        tabIndex={-1}
        aria-hidden="true"
        onClick={close}
      />

      <div className="eval-cta" hidden={open}>
        <span className="eval-cta-state">
          {hasRecorded ? "Assessment recorded" : "Not yet assessed"}
        </span>
        <button
          ref={triggerRef}
          type="button"
          className="btn"
          onClick={() => setOpen(true)}
        >
          {hasRecorded ? "Edit assessment" : "Record assessment"}
        </button>
      </div>

      <form action={action} className="eval-drawer" aria-label="Your assessment">
        <div className="drawer-head">
          <h2 ref={headingRef} tabIndex={-1}>
            Your assessment
          </h2>
          <span className="drawer-progress">
            {scoredCount}/{CRITERIA.length} scored
          </span>
          <button
            type="button"
            className="drawer-x"
            onClick={close}
            aria-label="Close assessment"
          >
            ✕
          </button>
        </div>

        <div className="drawer-body">
          {CRITERIA.map((c) => {
            const v = scores[c.key];
            return (
              <fieldset className={v ? "critb done" : "critb"} key={c.key}>
                <legend className="sr-only">{c.label}</legend>
                <div className="critb-top">
                  <b>{c.label}</b>
                  <span className="critb-word">{v ? c.scale[v - 1] : ""}</span>
                  <span className="wt">{c.weight}%</span>
                </div>
                <div className="scale compact">
                  {c.scale.map((lbl, i) => {
                    const val = i + 1;
                    return (
                      <label key={val} title={lbl}>
                        <input
                          type="radio"
                          name={`score_${c.key}`}
                          value={val}
                          required
                          checked={v === val}
                          onChange={() => setScores((s) => ({ ...s, [c.key]: val }))}
                        />
                        <span aria-hidden="true">{val}</span>
                        <span className="sr-only">
                          {val} — {lbl}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="critb-desc">{c.desc}</p>
              </fieldset>
            );
          })}

          <div className="rail-field">
            <label className="flabel" htmlFor="rationale">
              Rationale for scores <span className="req">*</span>
            </label>
            <textarea
              id="rationale"
              name="rationale"
              required
              rows={4}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Brief justification — especially any score of 1–2 or 5."
            />
          </div>

          <div className="rail-field">
            <label className="flabel" htmlFor="recommendation">
              Overall recommendation
            </label>
            <select
              id="recommendation"
              name="recommendation"
              value={recommendation}
              onChange={(e) => setRecommendation(e.target.value)}
            >
              <option value="auto">Auto-suggested outcome (recommended)</option>
              <option value="award">JW AI Impact Award</option>
              <option value="finalist">Quarterly Finalist</option>
              <option value="hero">Monthly AI Hero</option>
              <option value="develop">Return for Development</option>
              <option value="noprogress">Do Not Progress</option>
            </select>
          </div>

          <div className="rail-field">
            <label className="flabel" htmlFor="additionalValidation">
              Additional validation required?
            </label>
            <select
              id="additionalValidation"
              name="additionalValidation"
              defaultValue={initial?.additionalValidation ?? "None"}
            >
              <option>None</option>
              <option>Business case clarification</option>
              <option>Technical / safety review</option>
              <option>Legal &amp; Privacy review</option>
              <option>Further data / results verification</option>
            </select>
          </div>
        </div>

        <div className="drawer-foot">
          <div className="foot-total">
            <WeightBar scores={scores} />
            <div className="foot-num">
              <b>{total.toFixed(1)}</b>
              <span>/ 100 · indicative</span>
            </div>
          </div>

          <div className={`tierbanner ${tierClass}`}>{tierLabel}</div>

          <RecordButton label={hasRecorded ? "Update assessment" : "Record assessment"} />

          <p className="foot-note" role="status">
            {blockers.length ? (
              <>Still needed: {blockers.join("; ")}.</>
            ) : (
              <>
                <b>Next step:</b> {nextStepText(outcome ?? "")}
              </>
            )}
          </p>
        </div>
      </form>
    </div>
  );
}
