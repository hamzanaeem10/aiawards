import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, inArray, sql } from "drizzle-orm";
import { db, submissions, users, evaluations, approvals } from "@/lib/db";
import { canApprove, canSeeAggregate, getSession } from "@/lib/auth";
import { recordApproval } from "./actions";
import ApprovalPanel from "./ApprovalPanel";
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
  if (!s || !canSeeAggregate(s.role)) redirect("/login");
  const mayApprove = canApprove(s.role);

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
  const allApprovals = await db
    .select()
    .from(approvals)
    .where(inArray(approvals.submissionId, scope));

  // Everyone who is expected to sign off, so the view can show what is still
  // outstanding rather than only what has happened.
  const approverRoster = evaluators.filter((u) => u.role === "approver" && u.active);
  const approverCount = approverRoster.length;

  const fmt = (d: Date) =>
    new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="wrap stack">
      <div>
        <div className="eyebrow">{mayApprove ? "Approvals" : "Administration"}</div>
        <h1>Submissions overview</h1>
        {mayApprove ? (
          <p className="muted" style={{ marginTop: 6 }}>
            Review the panel&apos;s cumulative scoring and record your approval on
            each submission.
          </p>
        ) : (
          <div className="btn-row" style={{ marginTop: 14 }}>
            <a className="btn ghost sm" href="/admin/export/submissions" download>
              ⤓ Export submissions (CSV)
            </a>
            <a className="btn ghost sm" href="/admin/export/evaluations" download>
              ⤓ Export evaluations (CSV)
            </a>
          </div>
        )}
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

        const subApprovals = allApprovals
          .filter((a) => a.submissionId === sub.id)
          .sort((a, b) => +new Date(a.decidedAt) - +new Date(b.decidedAt));
        const mine = subApprovals.find((a) => a.approverUserId === s.userId) ?? null;
        const yes = subApprovals.filter((a) => a.decision === "approved").length;
        const no = subApprovals.filter((a) => a.decision === "disapproved").length;
        const decidedBy = new Set(subApprovals.map((a) => a.approverUserId));
        const pendingApprovers = approverRoster.filter((u) => !decidedBy.has(u.id));

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

            {/* ---- approvals: sign-off recorded beside the panel score ---- */}
            <div className="field" style={{ marginTop: 18 }}>
              <label className="flabel">
                Approvals
                <span className="ap-tally" style={{ fontWeight: 400, marginLeft: 8 }}>
                  <span className="muted">
                    {subApprovals.length} of {approverCount} decided
                  </span>
                  {yes > 0 && <span className="badge b-good">{yes} approved</span>}
                  {no > 0 && <span className="badge b-danger">{no} disapproved</span>}
                </span>
              </label>

              {subApprovals.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No approver has recorded a decision yet.
                </p>
              ) : (
                <ul className="eval-notes">
                  {subApprovals.map((a) => {
                    const who = evaluators.find((x) => x.id === a.approverUserId);
                    return (
                      <li key={a.id}>
                        <b>{who?.name ?? "Approver"}</b>
                        <span
                          className={
                            a.decision === "approved"
                              ? "badge b-good"
                              : "badge b-danger"
                          }
                          style={{ marginLeft: 6 }}
                        >
                          {a.decision === "approved" ? "Approved" : "Disapproved"}
                        </span>
                        <span className="muted" style={{ marginLeft: 6 }}>
                          {fmt(a.decidedAt)}
                        </span>
                        {a.notes && (
                          <div className="muted" style={{ marginTop: 2 }}>{a.notes}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {pendingApprovers.length > 0 && subApprovals.length > 0 && (
                <p className="ap-pending" style={{ margin: "8px 0 0" }}>
                  Awaiting: {pendingApprovers.map((u) => u.name).join(", ")}
                </p>
              )}

              {mayApprove && (
                <ApprovalPanel
                  action={recordApproval}
                  submissionId={sub.id}
                  current={mine ? (mine.decision as "approved" | "disapproved") : null}
                  currentNotes={mine?.notes ?? null}
                  decidedAt={mine ? fmt(mine.decidedAt) : null}
                />
              )}
            </div>
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
