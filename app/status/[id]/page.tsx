import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db, submissions, statusHistory, decisions } from "@/lib/db";

const LABELS: Record<string, string> = {
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  MONTHLY_HERO: "Monthly AI Hero",
  BIMONTHLY_REVIEW: "Bi-Monthly Review",
  QUARTERLY_FINALIST: "Quarterly Finalist",
  AWARD: "JW AI Impact Award",
  PILOT_SCALE: "Pilot & Scale",
  NOT_PROGRESSED: "Not progressed this cycle",
};

const BLURB: Record<string, string> = {
  SUBMITTED: "Received. It's in the queue for the awards panel to review.",
  IN_REVIEW: "An evaluator is reviewing your submission.",
  MONTHLY_HERO: "Recognised as a Monthly AI Hero.",
  BIMONTHLY_REVIEW: "In the Bi-Monthly Review for feedback and development support.",
  QUARTERLY_FINALIST: "Shortlisted as a Quarterly Finalist.",
  AWARD: "Selected for the JW AI Impact Award.",
  PILOT_SCALE: "Moving into pilot and scale support.",
  NOT_PROGRESSED: "Not progressed this cycle — resubmission is welcome in a future cycle.",
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

export default async function StatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!sub) notFound();

  const history = await db
    .select()
    .from(statusHistory)
    .where(eq(statusHistory.submissionId, id))
    .orderBy(asc(statusHistory.at));

  const [dec] = await db
    .select()
    .from(decisions)
    .where(eq(decisions.submissionId, id));

  return (
    <div className="wrap narrow stack">
      <div>
        <div className="eyebrow">Submission status</div>
        <h1>{sub.initiativeName}</h1>
        <p className="lede">
          Submitted by {sub.submitterName} · {sub.theme} · {sub.functionArea}
        </p>
      </div>

      <div className="card">
        <span className={`badge ${BADGE[sub.status] ?? "b-neutral"} dot`}>
          {LABELS[sub.status] ?? sub.status}
        </span>
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          {BLURB[sub.status] ?? "Your submission is being processed."}
        </p>
      </div>

      {dec?.feedbackReleased && dec.feedbackLetter && (
        <div className="card">
          <h2>Panel feedback</h2>
          <p style={{ whiteSpace: "pre-wrap", marginTop: 12, marginBottom: 0 }}>
            {dec.feedbackLetter}
          </p>
        </div>
      )}

      {history.length > 1 && (
        <div className="card">
          <h2>History</h2>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(h.at).toLocaleString()}
                    </td>
                    <td>{LABELS[h.to] ?? h.to}</td>
                    <td className="muted">{h.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
