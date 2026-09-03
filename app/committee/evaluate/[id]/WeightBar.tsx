"use client";

import { CRITERIA } from "@/lib/rubric";

/**
 * The running total, drawn as its own arithmetic.
 *
 * Each criterion gets a slice of the bar sized to its weight, and fills that
 * slice to score/5 — so filled width over full width *is* the weighted total.
 * A panelist can see at a glance that Impact is nearly half the decision, and
 * where a 72 actually came from.
 */

// Abbreviations that survive a 44px slice. Falls back to the first word.
const SHORT: Record<string, string> = {
  impact: "Impact",
  evidence: "Evidence",
  innovation: "Innov.",
  scalability: "Scale",
  responsible: "RAI",
};

export default function WeightBar({
  scores,
}: {
  scores: Record<string, number>;
}) {
  return (
    <div className="wbar" aria-hidden="true">
      <div className="wbar-track">
        {CRITERIA.map((c) => {
          const v = scores[c.key] ?? 0;
          return (
            <div
              key={c.key}
              className={v ? "wseg scored" : "wseg"}
              style={{ flexGrow: c.weight }}
            >
              <span className="wseg-fill" style={{ width: `${(v / 5) * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="wbar-keys">
        {CRITERIA.map((c) => (
          <span
            key={c.key}
            className={scores[c.key] ? "wkey scored" : "wkey"}
            style={{ flexGrow: c.weight }}
          >
            {SHORT[c.key] ?? c.label.split(" ")[0]}
          </span>
        ))}
      </div>
    </div>
  );
}
