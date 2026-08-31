"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  CRITERIA,
  TIERS,
  weightedTotal,
  tierFor,
  nextStepText,
} from "@/lib/rubric";
import { recordAssessment } from "./actions";

function RecordButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Submitting…" : label}
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
  const [scores, setScores] = useState<Record<string, number>>(initial?.scores ?? {});
  const [recommendation, setRecommendation] = useState(initial?.recommendation ?? "auto");

  const total = useMemo(() => weightedTotal(scores), [scores]);
  const scoredCount = CRITERIA.filter((c) => scores[c.key]).length;
  const allScored = scoredCount === CRITERIA.length;
  const autoTier = allScored ? tierFor(total) : null;
  const outcome = recommendation === "auto" ? autoTier?.key : recommendation;

  const overridden = recommendation !== "auto";
  const bannerLabel = !allScored
    ? `${scoredCount} of ${CRITERIA.length} scored`
    : (TIERS.find((t) => t.key === outcome)?.label ?? "") +
      (overridden ? " · override" : "");
  const bannerClass = allScored && outcome ? TIER_CLASS[outcome] : "tier-develop";

  const hasRecorded = !!initial?.scores && Object.keys(initial.scores).length > 0;
  const action = recordAssessment.bind(null, submissionId);

  return (
    <form action={action} className="eval-grid">
      {/* ---- LEFT: the submission to read ---- */}
      <div className="eval-read">{children}</div>

      {/* ---- RIGHT: the scorecard, always in view ---- */}
      <aside className="eval-rail">
        <div className="rail-scroll">
          <div className="rail-head">
            <h2>Your assessment</h2>
            <span className="rail-progress">
              {scoredCount}/{CRITERIA.length}
            </span>
          </div>

          {CRITERIA.map((c) => {
            const v = scores[c.key];
            return (
              <div className={v ? "critb done" : "critb"} key={c.key}>
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
                        {val}
                      </label>
                    );
                  })}
                </div>
                <p className="critb-desc">{c.desc}</p>
              </div>
            );
          })}

          <div className="rail-total">
            <div className="num">{total.toFixed(1)}</div>
            <div className="of">/ 100 · indicative</div>
            <div className={`tierbanner ${bannerClass}`}>{bannerLabel}</div>
            {allScored && (
              <p className="rail-next">
                <b>Next step:</b> {nextStepText(outcome ?? "")}
              </p>
            )}
          </div>

          <div className="rail-field">
            <label className="flabel">
              Rationale for scores <span className="req">*</span>
            </label>
            <textarea
              name="rationale"
              required
              rows={3}
              defaultValue={initial?.rationale ?? ""}
              placeholder="Brief justification — especially any score of 1–2 or 5."
            />
          </div>

          <div className="rail-field">
            <label className="flabel">Overall recommendation</label>
            <select
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
            <label className="flabel">Additional validation required?</label>
            <select
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

        <div className="rail-foot">
          <RecordButton label={hasRecorded ? "Update assessment" : "Record assessment"} />
        </div>
      </aside>
    </form>
  );
}
