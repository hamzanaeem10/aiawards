import Link from "next/link";
import { redirect } from "next/navigation";
import { inArray, desc, sql } from "drizzle-orm";
import { db, submissions, evaluations } from "@/lib/db";
import { getSession } from "@/lib/auth";

const PAGE_SIZE = 40;

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
const BADGE: Record<string, string> = {
  SUBMITTED: "b-info",
  IN_REVIEW: "b-info",
  MONTHLY_HERO: "b-amber",
  BIMONTHLY_REVIEW: "b-neutral",
  QUARTERLY_FINALIST: "b-info",
  AWARD: "b-good",
  PILOT_SCALE: "b-good",
  NOT_PROGRESSED: "b-danger",
};

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; recorded?: string }>;
}) {
  const s = await getSession();
  if (!s || (s.role !== "reviewer" && s.role !== "admin")) redirect("/login");

  const { page: pageRaw, recorded } = await searchParams;
  const page = Math.max(0, Number(pageRaw) - 1 || 0);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(submissions);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const rows = await db
    .select({
      id: submissions.id,
      name: submissions.initiativeName,
      theme: submissions.theme,
      fn: submissions.functionArea,
      stage: submissions.useCaseStage,
      status: submissions.status,
    })
    .from(submissions)
    .orderBy(desc(submissions.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);

  const done = new Set<string>();
  if (rows.length) {
    const mine = await db
      .select({ submissionId: evaluations.submissionId })
      .from(evaluations)
      .where(
        inArray(
          evaluations.submissionId,
          rows.map((r) => r.id),
        ),
      );
    for (const m of mine) done.add(m.submissionId);
  }

  return (
    <div className="wrap stack">
      <div>
        <div className="eyebrow">For panel evaluators</div>
        <h1>Submissions to evaluate</h1>
      </div>

      {recorded !== undefined && (
        <div className="notice n-good">
          ✓ Assessment recorded{recorded ? ` for ${recorded}` : ""}.
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        {count === 0 ? (
          <p className="muted" style={{ padding: 24, margin: 0 }}>
            No submissions yet.
          </p>
        ) : (
          <div className="table-wrap" style={{ border: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Initiative</th>
                  <th>Theme</th>
                  <th>Function</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.theme}</td>
                    <td>{r.fn}</td>
                    <td>{r.stage}</td>
                    <td>
                      <span className={`badge ${BADGE[r.status] ?? "b-neutral"}`}>
                        {LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="btn ghost sm" href={`/committee/evaluate/${r.id}`}>
                        {done.has(r.id) ? "View / revise" : "Evaluate →"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
