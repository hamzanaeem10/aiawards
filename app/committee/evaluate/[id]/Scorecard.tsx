"use client";

import { useMemo, useState } from "react";
import {
  CRITERIA,
  TIERS,
  weightedTotal,
  tierFor,
  nextStepText,
  outcomeNeedsGovernance,
} from "@/lib/rubric";
import { recordAssessment } from "./actions";

const GOV_ITEMS: { key: string; label: string; note?: string }[] = [
  { key: "conflictsDeclared", label: "Conflicts of interest declared; sponsors did not judge this submission." },
  { key: "bizFinValidated", label: "Business & Finance have validated the reported impact figures." },
  { key: "techValidated", label: "Tech and control teams have validated safe, responsible use." },
  {
    key: "cpoCaioReviewed",
    label: "CPO & Chief AI Officer reviewed",
    note: "required at JW AI Impact Award tier; CEO approves the final award",
  },
];

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
  governance?: Record<string, boolean>;
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
  const [gov, setGov] = useState<Record<string, boolean>>(initial?.governance ?? {});

  const total = useMemo(() => weightedTotal(scores), [scores]);
  const allScored = CRITERIA.every((c) => scores[c.key]);
  const autoTier = allScored ? tierFor(total) : null;
  const outcome = recommendation === "auto" ? autoTier?.key : recommendation;

  const overridden = recommendation !== "auto";
  const bannerLabel = !allScored
    ? "Awaiting scores"
    : (TIERS.find((t) => t.key === outcome)?.label ?? "") +
      (overridden ? " (evaluator override)" : "");
  const bannerClass = allScored && outcome ? TIER_CLASS[outcome] : "tier-develop";

  const gateNeeded = !!outcome && outcomeNeedsGovernance(outcome);
  const gateOk =
    gov.bizFinValidated &&
    gov.techValidated &&
    (outcome !== "award" || gov.cpoCaioReviewed);
  const showWarn = allScored && gateNeeded && !gateOk;

  const action = recordAssessment.bind(null, submissionId);

  return (
    <form action={action}>
      <div className="grid-2col">
        <div className="stack">
          {children}

          {/* ---- 2. Scoring ---- */}
          <div className="card">
            <div className="section-head">
              <span className="n">2</span>
              <h2>Assessment Model scoring</h2>
            </div>
            <p className="section-hint">
              Score each criterion 1 (weak) to 5 (exceptional); the weight is applied
              automatically.
            </p>

            {CRITERIA.map((c) => (
              <div className="crit" key={c.key}>
                <div className="crit-top">
                  <b>{c.label}</b>
                  <span className="wt">{c.weight}%</span>
                </div>
                <div className="crit-desc">{c.desc}</div>
                <div className="scale">
                  {c.scale.map((lbl, i) => {
                    const val = i + 1;
                    return (
                      <label key={val}>
                        <input
                          type="radio"
                          name={`score_${c.key}`}
                          value={val}
                          required
                          checked={scores[c.key] === val}
                          onChange={() => setScores((s) => ({ ...s, [c.key]: val }))}
                        />
                        <b>{val}</b>
                        {lbl}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ---- 3. Governance ---- */}
          <div className="card">
            <div className="section-head">
              <span className="n">3</span>
              <h2>Governance &amp; validation</h2>
            </div>
            <p className="section-hint">
              Per the framework&apos;s governance controls — confirm before a score
              progresses past Quarterly Finalist.
            </p>
            {GOV_ITEMS.map((g) => (
              <label key={g.key} className="checkline">
                <input
                  type="checkbox"
                  name={g.key}
                  checked={!!gov[g.key]}
                  onChange={(e) =>
                    setGov((v) => ({ ...v, [g.key]: e.target.checked }))
                  }
                />
                <span>
                  {g.label}
                  {g.note && <span className="muted"> ({g.note})</span>}
                </span>
              </label>
            ))}
            {showWarn && (
              <div className="notice n-danger" style={{ margin: "12px 0 0" }}>
                This score qualifies for progression, but required validations are
                not yet complete.
              </div>
            )}
          </div>

          {/* ---- 4. Comments & recommendation ---- */}
          <div className="card">
            <div className="section-head">
              <span className="n">4</span>
              <h2>Evaluator comments &amp; recommendation</h2>
            </div>
            <div className="field">
              <label className="flabel">
                Rationale for scores <span className="req">*</span>
              </label>
              <textarea
                name="rationale"
                required
                defaultValue={initial?.rationale ?? ""}
                placeholder="Brief justification, especially for any score of 1–2 or 5."
              />
            </div>
            <div className="row2">
              <div className="field">
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
              <div className="field">
                <label className="flabel">Overall recommendation</label>
                <select
                  name="recommendation"
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                >
                  <option value="auto">Use auto-suggested outcome (recommended)</option>
                  <option value="award">Recommend for JW AI Impact Award</option>
                  <option value="finalist">Shortlist as Quarterly Finalist</option>
                  <option value="hero">Recognize as Monthly AI Hero</option>
                  <option value="develop">Return for Development (Bi-Monthly Review)</option>
                  <option value="noprogress">Do Not Progress at This Time</option>
                </select>
              </div>
            </div>
            <button
              className="btn"
              type="submit"
              style={{ width: "100%", marginTop: 6 }}
              disabled={showWarn}
            >
              Record assessment
            </button>
            {showWarn && (
              <p className="muted" style={{ textAlign: "center", marginTop: 8 }}>
                Complete the governance validations above to record this outcome.
              </p>
            )}
          </div>
        </div>

        {/* ---- sidebar: live score ---- */}
        <aside className="score-summary">
          <h3>Live score</h3>
          <div className="rows">
            {CRITERIA.map((c) => {
              const v = scores[c.key];
              return (
                <div key={c.key}>
                  <span>
                    {c.label} ({c.weight}%)
                  </span>
                  <b>{v ? `${((v / 5) * c.weight).toFixed(1)} / ${c.weight}` : "—"}</b>
                </div>
              );
            })}
          </div>
          <div className="total">
            <div className="num">{total.toFixed(1)}</div>
            <div className="of">out of 100 · indicative</div>
          </div>

          <div className={`tierbanner ${bannerClass}`}>{bannerLabel}</div>

          <div className="nextstep">
            {allScored ? (
              <>
                <b>Recommended next step:</b> {nextStepText(outcome ?? "")}
              </>
            ) : (
              "Score every criterion to see the recommended next step."
            )}
          </div>

          <div className="thresholds">
            {TIERS.map((t) => (
              <div key={t.key}>
                {t.label}
                <span>{t.min}+</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </form>
  );
}
