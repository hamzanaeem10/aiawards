import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, inArray, sql } from "drizzle-orm";
import { db, submissions, users, evaluations } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { CRITERIA, TIERS, tierFor } from "@/lib/rubric";

const PAGE_SIZE = 25;

// short column headers for the evaluator × criterion matrix
const SHORT: Record<string, string> = {
  impact: "Impact",
  evidence: "Evidence",
  innovation: "Innovation",
  scalability: "Scale & App.",
  responsible: "Resp. AI",
};

const LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  MONTHLY_HERO: "Monthly AI Hero",
  BIMONTHLY_REVIEW: "Bi-Monthly Review",
  QUARTERLY_FINALIST: "Quarterly Finalist",
  AWARD: "JW AI Impact Award",
  PILOT_SCALE: "Pilot & Scale",
  NOT_PROGRESSED: "Not progressed",
};
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const s = await getSession();
  if (!s || (s.role !== "admin" && s.role !== "chair")) redirect("/login");

  const { page: pageRaw } = await searchParams;
  const page = Math.max(0, Number(pageRaw) - 1 || 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(submissions);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const subs = await db
    .select()
    .from(submissions)
    .orderBy(desc(submissions.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  const ids = subs.map((x) => x.id);
  const scope = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];

  const evaluators = await db.select().from(users);
  const allEvals = await db
    .select()
    .from(evaluations)
    .where(inArray(evaluations.submissionId, scope));

  return (
    <div className="wrap stack">
      <div>
        <div className="eyebrow">Administration</div>
        <h1>Submissions overview</h1>
        <div className="btn-row" style={{ marginTop: 14 }}>
          <a className="btn ghost sm" href="/admin/export/submissions" download>
            ⤓ Export submissions (CSV)
          </a>
          <a className="btn ghost sm" href="/admin/export/evaluations" download>
            ⤓ Export evaluations (CSV)
          </a>
        </div>
      </div>

      {subs.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No submissions yet.</p>
        </div>
      )}

      {subs.map((sub) => {
        const evals = allEvals
          .filter((e) => e.submissionId === sub.id)
          .sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt));

        const n = evals.length;
        const avg = n
          ? evals.reduce((a, e) => a + e.weightedTotal / 10, 0) / n
          : null;
        const avgTier = avg != null ? tierFor(avg) : null;
        const spread =
          n > 1
            ? (Math.max(...evals.map((e) => e.weightedTotal)) -
                Math.min(...evals.map((e) => e.weightedTotal))) /
              10
            : 0;
        // mean score per criterion across the panel
        const critAvg = (key: string) =>
          n
            ? evals.reduce(
                (a, e) => a + (Number((e.scores as Record<string, number>)[key]) || 0),
                0,
              ) / n
            : 0;

        return (
          <div className="card pad-lg" key={sub.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "1.2rem" }}>{sub.initiativeName}</h2>
              <span className="badge b-neutral">{LABELS[sub.status] ?? sub.status}</span>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              {sub.theme} · {sub.functionArea} · {sub.useCaseStage} · {sub.submitterName} ·{" "}
              <Link href={`/status/${sub.id}`}>status page</Link>
            </p>

            {/* ---- cumulative panel score ---- */}
            <div className="cume">
              {avg == null ? (
                <span className="muted">No assessment recorded yet.</span>
              ) : (
                <>
                  <div className="cume-num">
                    {avg.toFixed(1)}
                    <span>/ 100</span>
                  </div>
                  <div className="cume-meta">
                    <span className="badge b-info">{avgTier?.label}</span>
                    <span className="muted">
                      cumulative across {n} evaluator{n === 1 ? "" : "s"}
                    </span>
                    {spread >= 15 && (
                      <span className="badge b-amber">divergence {spread.toFixed(1)}</span>
                    )}
                  </div>
                </>
              )}
            </div>

            {n > 0 && (
              <div className="field" style={{ marginTop: 16 }}>
                <label className="flabel">
                  Each evaluator&apos;s scoring
                </label>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Evaluator</th>
                        {CRITERIA.map((c) => (
                          <th key={c.key} style={{ textAlign: "center" }}>
                            {SHORT[c.key] ?? c.label}
                            <br />
                            <span className="muted" style={{ fontWeight: 400 }}>{c.weight}%</span>
                          </th>
                        ))}
                        <th style={{ textAlign: "center" }}>Total</th>
                        <th>Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evals.map((e) => {
                        const r = evaluators.find((x) => x.id === e.reviewerUserId);
                        const sc = e.scores as Record<string, number>;
                        return (
                          <tr key={e.id}>
                            <td>{r?.name ?? "Evaluator"}</td>
                            {CRITERIA.map((c) => (
                              <td key={c.key} style={{ textAlign: "center" }}>
                                {sc[c.key] ?? "—"}
                              </td>
                            ))}
                            <td style={{ textAlign: "center", fontWeight: 600 }}>
                              {(e.weightedTotal / 10).toFixed(1)}
                            </td>
                            <td>{TIERS.find((t) => t.key === e.tier)?.label ?? e.tier}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop: "2px solid var(--line)" }}>
                        <td style={{ fontWeight: 700 }}>Panel average</td>
                        {CRITERIA.map((c) => (
                          <td key={c.key} style={{ textAlign: "center", fontWeight: 600 }}>
                            {critAvg(c.key).toFixed(1)}
                          </td>
                        ))}
                        <td style={{ textAlign: "center", fontWeight: 700, color: "var(--maroon)" }}>
                          {avg!.toFixed(1)}
                        </td>
                        <td style={{ fontWeight: 600 }}>{avgTier?.label}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <ul className="eval-notes">
                  {evals.map((e) => {
                    const r = evaluators.find((x) => x.id === e.reviewerUserId);
                    return (
                      <li key={e.id}>
                        <b>{r?.name ?? "Evaluator"}</b>
                        {e.recommendation && e.recommendation !== "auto" && (
                          <span className="badge b-neutral" style={{ marginLeft: 6 }}>
                            recommends {e.recommendation}
                          </span>
                        )}
                        {e.additionalValidation && e.additionalValidation !== "None" && (
                          <span className="badge b-amber" style={{ marginLeft: 6 }}>
                            {e.additionalValidation}
                          </span>
                        )}
                        {e.rationale && (
                          <div className="muted" style={{ marginTop: 2 }}>{e.rationale}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      {totalPages > 1 && (
        <div className="btn-row" style={{ justifyContent: "space-between" }}>
          <span className="muted">
            {count} submissions · page {page + 1} of {totalPages}
          </span>
          <span className="btn-row">
            {page > 0 && (
              <Link className="btn ghost sm" href={`?page=${page}`}>
                ← Newer
              </Link>
            )}
            {page + 1 < totalPages && (
              <Link className="btn ghost sm" href={`?page=${page + 2}`}>
                Older →
              </Link>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
