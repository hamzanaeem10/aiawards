import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq, and, desc } from "drizzle-orm";
import {
  db, submissions, attachments, evaluations, aiInsights,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import { signedDownloadUrl } from "@/lib/storage";
import { TIERS } from "@/lib/rubric";
import Scorecard from "./Scorecard";
import type { IntakeSummary } from "@/lib/ai/intake";

function isEmpty(v: unknown) {
  return v == null || v === "" || (Array.isArray(v) && !v.length);
}
function text(v: unknown) {
  return Array.isArray(v) ? v.join(", ") : String(v);
}

/** A prose field: label above a full-width paragraph. */
function Read({ label, value }: { label: string; value?: unknown }) {
  if (isEmpty(value)) return null;
  return (
    <div className="readfield">
      <div className="k">{label}</div>
      <div className="v">{text(value)}</div>
    </div>
  );
}

/** A compact metadata row: label | value. */
function Meta({ label, value }: { label: string; value?: unknown }) {
  if (isEmpty(value)) return null;
  return (
    <div className="read-meta-row">
      <dt>{label}</dt>
      <dd>{text(value)}</dd>
    </div>
  );
}

export default async function EvaluatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const s = await getSession();
  if (!s || (s.role !== "reviewer" && s.role !== "chair")) redirect("/login");

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, id));
  if (!sub) notFound();

  const files = await db
    .select()
    .from(attachments)
    .where(eq(attachments.submissionId, id));
  const withUrls = await Promise.all(
    files
      .filter((f) => f.kind === "file" || f.kind === "video")
      .map(async (f) => ({
        ...f,
        href: await signedDownloadUrl(f.storageKey, f.filename),
      })),
  );
  const videos = withUrls.filter((f) => f.kind === "video");
  const docs = withUrls.filter((f) => f.kind !== "video");

  const [intake] = await db
    .select()
    .from(aiInsights)
    .where(
      and(eq(aiInsights.submissionId, id), eq(aiInsights.type, "intake_summary")),
    )
    .orderBy(desc(aiInsights.createdAt));
  const ai = intake?.content as IntakeSummary | undefined;

  const [mine] = await db
    .select()
    .from(evaluations)
    .where(
      and(
        eq(evaluations.submissionId, id),
        eq(evaluations.reviewerUserId, s.userId),
      ),
    );

  const d = sub.data as Record<string, unknown>;
  const hasAi = !!(ai && (ai.overview || ai.clarifyingQuestions?.length));
  const mineTier =
    mine && TIERS.find((t) => t.key === mine.tier)?.label;

  return (
    <div className="wrap eval-page stack">
      <div className="eval-title">
        <div>
          <Link href="/committee/queue" className="eval-back">
            ← Evaluation queue
          </Link>
          <div className="eyebrow">Evaluation &amp; scoring</div>
          <h1>{sub.initiativeName}</h1>
          <p className="lede">
            {sub.theme} · {sub.functionArea} · {sub.useCaseStage} · {sub.submitterName}
          </p>
        </div>
      </div>

      {saved && mine && (
        <div className="eval-done">
          <div>
            <b>✓ Assessment recorded.</b>{" "}
            <span className="muted">
              {sub.initiativeName} is now {mineTier}. You can revise this below
              until the cycle closes.
            </span>
          </div>
          <Link href="/committee/queue" className="btn sm">
            Back to queue →
          </Link>
        </div>
      )}

      <Scorecard
        submissionId={id}
        done={!!saved && !!mine}
        initial={
          mine
            ? {
                scores: mine.scores,
                rationale: mine.rationale,
                recommendation: mine.recommendation,
                additionalValidation: mine.additionalValidation ?? "None",
              }
            : undefined
        }
      >
        {hasAi && (
          <details className="ai-block" open>
            <summary className="tag">
              ● AI orientation — advisory only, verify against the submission
            </summary>
            {ai!.overview && <p style={{ margin: "8px 0 0" }}>{ai!.overview}</p>}
            {ai!.themeSuggestion && (
              <p className="muted" style={{ margin: "6px 0 0" }}>
                Theme read: {ai!.themeSuggestion}
              </p>
            )}
            {!!ai!.reportedMetrics?.length && (
              <p className="muted" style={{ margin: "4px 0 0" }}>
                Reported (unverified): {ai!.reportedMetrics.join("; ")}
              </p>
            )}
            {!!ai!.clarifyingQuestions?.length && (
              <>
                <p className="muted" style={{ fontWeight: 700, margin: "10px 0 0" }}>
                  Questions to consider asking
                </p>
                <ul>
                  {ai!.clarifyingQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </>
            )}
            {!!ai!.completenessFlags?.length && (
              <>
                <p className="muted" style={{ fontWeight: 700, margin: "10px 0 0" }}>
                  Completeness flags
                </p>
                <ul>
                  {ai!.completenessFlags.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </>
            )}
          </details>
        )}

        {(videos.length > 0 || !!d.liveLink || !!d.repoLink || docs.length > 0) && (
          <div className="card">
            <div className="section-head">
              <span className="n">▶</span>
              <h2>Demo, links &amp; files</h2>
            </div>

            {videos.map((f) => (
              <div key={f.id} className="ev-uploaded" style={{ marginBottom: 14 }}>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video className="ev-video" src={f.href} controls preload="metadata" />
                <div className="ev-file-row">
                  <span>
                    <b>{f.filename}</b>
                    <span className="muted"> · {(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  </span>
                  <a className="btn ghost sm" href={f.href} target="_blank" rel="noreferrer">
                    Download
                  </a>
                </div>
              </div>
            ))}

            {(!!d.liveLink || !!d.repoLink || docs.length > 0) && (
              <ul className="attach">
                {d.liveLink ? (
                  <li>
                    <a href={String(d.liveLink)} target="_blank" rel="noreferrer">
                      {String(d.liveLink)}
                    </a>
                    <span className="muted">live link</span>
                  </li>
                ) : null}
                {d.repoLink ? (
                  <li>
                    <a href={String(d.repoLink)} target="_blank" rel="noreferrer">
                      {String(d.repoLink)}
                    </a>
                    <span className="muted">repository</span>
                  </li>
                ) : null}
                {docs.map((f) => (
                  <li key={f.id}>
                    <a href={f.href} target="_blank" rel="noreferrer">
                      {f.filename}
                    </a>
                    <span className="muted">{(f.size / 1024).toFixed(0)} KB</span>
                  </li>
                ))}
              </ul>
            )}
            {withUrls.length > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                Links are valid for 5 minutes — reload to refresh.
              </p>
            )}
          </div>
        )}

        <div className="card">
          <div className="section-head">
            <span className="n">i</span>
            <h2>Full submission</h2>
          </div>

          <div className="read-prose">
            <Read label="Business challenge / opportunity" value={d.challenge} />
            <Read label="AI solution" value={d.solution} />
            <Read label="What's new or different" value={d.whatsNew} />
            <Read label="Impact" value={d.impact} />
            <Read label="Key metrics" value={d.keyMetrics} />
            <Read label="Responsible AI" value={d.responsibleAI} />
            <Read label="Additional information" value={d.additionalInfo} />
          </div>

          <dl className="read-meta">
            <Meta
              label="AI technology / approach"
              value={[...((d.aiTech as string[]) ?? []), d.aiTechOther].filter(Boolean)}
            />
            <Meta label="Target users / customers" value={d.targetUsers} />
            <Meta
              label="Financial impact (reported)"
              value={[d.financialImpact, d.financialImpactDetail]
                .filter(Boolean)
                .join(" — ")}
            />
            <Meta label="Evidence stage" value={d.evidenceStage} />
            <Meta label="Scalability potential" value={d.scalability} />
            <Meta label="Adoption readiness" value={d.adoptionReadiness} />
            <Meta label="Team" value={d.teamMembers} />
            <Meta
              label="Sponsor"
              value={[d.sponsorName, d.sponsorRole].filter(Boolean).join(" — ")}
            />
          </dl>
        </div>
      </Scorecard>
    </div>
  );
}
