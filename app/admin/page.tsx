import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import {
  db, submissions, users, evaluations, decisions, aiInsights,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import { TIERS } from "@/lib/rubric";
import { saveFeedback, generateConsensus } from "./actions";
import type { ConsensusDraft } from "@/lib/ai/synthesis";

const PAGE_SIZE = 25;

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
  const allDec = await db
    .select()
    .from(decisions)
    .where(inArray(decisions.submissionId, scope));
  const consensus = await db
    .select()
    .from(aiInsights)
    .where(
      and(
        eq(aiInsights.type, "consensus_draft"),
        inArray(aiInsights.submissionId, scope),
      ),
    );

  return (
    <div className="wrap stack">
      <div>
        <div className="eyebrow">Administration</div>
        <h1>Submissions overview</h1>
        <p className="lede">
          Every submission and its recorded assessment. Evaluators score and set the
          outcome; here you compose and release feedback to the nominee.
        </p>
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
        const evals = allEvals.filter((e) => e.submissionId === sub.id);
        const dec = allDec.find((d) => d.submissionId === sub.id);
        const cons = consensus.find((c) => c.submissionId === sub.id)
          ?.content as ConsensusDraft | undefined;
        const avg = evals.length
          ? Math.round(
              (evals.reduce((a, e) => a + e.weightedTotal / 10, 0) / evals.length) * 10,
            ) / 10
          : null;
        const spread =
          evals.length > 1
            ? Math.max(...evals.map((e) => e.weightedTotal)) -
              Math.min(...evals.map((e) => e.weightedTotal))
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

            <div className="field" style={{ marginTop: 16 }}>
              <label className="flabel">Recorded assessments</label>
              {evals.length === 0 ? (
                <p className="muted">No assessment recorded yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Evaluator</th>
                        <th>Total</th>
                        <th>Tier</th>
                        <th>Recommendation</th>
                        <th>Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evals.map((e) => {
                        const r = evaluators.find((x) => x.id === e.reviewerUserId);
                        return (
                          <tr key={e.id}>
                            <td>{r?.name ?? "Evaluator"}</td>
                            <td>{(e.weightedTotal / 10).toFixed(1)}</td>
                            <td>{TIERS.find((t) => t.key === e.tier)?.label ?? e.tier}</td>
                            <td>{e.recommendation}</td>
                            <td className="muted">{e.rationale}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {avg != null && (
                <p style={{ fontSize: "0.86rem", marginTop: 8 }}>
                  <b>Average: {avg.toFixed(1)} / 100</b>{" "}
                  {spread >= 15 && (
                    <span className="badge b-amber">
                      evaluator divergence {(spread / 10).toFixed(1)}
                    </span>
                  )}
                </p>
              )}
            </div>

            <form action={generateConsensus} style={{ marginBottom: 14 }}>
              <input type="hidden" name="submissionId" value={sub.id} />
              <button className="btn ghost sm" disabled={evals.length === 0}>
                Generate AI feedback draft (advisory)
              </button>
            </form>

            <form action={saveFeedback}>
              <input type="hidden" name="submissionId" value={sub.id} />
              <div className="field">
                <label className="flabel">
                  Feedback letter to nominee{" "}
                  {cons && <span className="badge b-amber">AI draft — edit before saving</span>}
                </label>
                <textarea
                  name="feedbackLetter"
                  defaultValue={dec?.feedbackLetter ?? cons?.feedbackLetter ?? ""}
                />
              </div>
              <label className="checkline">
                <input
                  type="checkbox"
                  name="feedbackReleased"
                  defaultChecked={dec?.feedbackReleased}
                />
                <span>Release this feedback to the nominee&apos;s status page</span>
              </label>
              <button className="btn" style={{ marginTop: 8 }}>Save feedback</button>
            </form>
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
