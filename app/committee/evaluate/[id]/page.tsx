import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq, and, desc } from "drizzle-orm";
import {
  db, submissions, attachments, evaluations, aiInsights,
} from "@/lib/db";
import { getSession } from "@/lib/auth";
import { signedDownloadUrl } from "@/lib/storage";
import { CRITERIA } from "@/lib/rubric";
import { videoEmbed } from "@/lib/videoEmbed";
import DemoPlayer from "./DemoPlayer";
import { GROQ_ENABLED } from "@/lib/ai/groq";
import Scorecard from "./Scorecard";
import RunAiButton from "./RunAiButton";
import type { IntakeSummary } from "@/lib/ai/intake";
import type { AiAssessment } from "@/lib/ai/assessment";

// The supplementary AI assessment calls Groq synchronously from a server action.
export const maxDuration = 60;

const TIER_CLASS: Record<string, string> = {
  award: "tier-award",
  finalist: "tier-finalist",
  hero: "tier-hero",
  develop: "tier-develop",
  noprogress: "tier-noprogress",
};

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
        // docs download; videos play inline
        href: await signedDownloadUrl(f.storageKey, f.filename, f.kind !== "video"),
      })),
  );
  const legacyVideos = withUrls.filter((f) => f.kind === "video");
  const docs = withUrls.filter((f) => f.kind !== "video");

  const [intake] = await db
    .select()
    .from(aiInsights)
    .where(
      and(eq(aiInsights.submissionId, id), eq(aiInsights.type, "intake_summary")),
    )
    .orderBy(desc(aiInsights.createdAt));
  const ai = intake?.content as IntakeSummary | undefined;

  const [assessRow] = await db
    .select()
    .from(aiInsights)
    .where(
      and(eq(aiInsights.submissionId, id), eq(aiInsights.type, "ai_assessment")),
    )
    .orderBy(desc(aiInsights.createdAt));
  const aiScore = assessRow?.content as AiAssessment | undefined;
  // The stored assessment is a snapshot — flag it if the model has changed since.
  const currentKeys = new Set(CRITERIA.map((c) => c.key));
  const aiScoreStale =
    !!aiScore &&
    (aiScore.perCriterion.length !== CRITERIA.length ||
      aiScore.perCriterion.some((c) => !currentKeys.has(c.key as never)));

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
  const demo = d.demoVideoUrl ? videoEmbed(String(d.demoVideoUrl)) : null;

  return (
    <div className="wrap eval-page stack">
      <div className="eval-title">
        <div>
          <Link href="/committee/queue" className="eval-back">
            <span aria-hidden="true">←</span> Evaluation queue
          </Link>
          <div className="eyebrow">Evaluation &amp; scoring</div>
          <h1>{sub.initiativeName}</h1>
          <p className="lede">
            {sub.theme} · {sub.functionArea} · {sub.useCaseStage} · {sub.submitterName}
          </p>
        </div>
      </div>

      {mine && (
        <div className="eval-done">
          <b>You&apos;ve recorded an assessment</b> — editing below overwrites it.
        </div>
      )}

      <Scorecard
        submissionId={id}
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

        {(aiScore || GROQ_ENABLED) && (
          <details className="ai-block ai-assess" open={!!aiScore}>
            <summary className="tag">
              ◆ AI assessment — supplementary, not the panel&apos;s decision
            </summary>

            {!aiScore ? (
              <div className="ai-assess-empty">
                <RunAiButton submissionId={id} label="Run AI assessment" />
              </div>
            ) : (
              <>
                {aiScoreStale && (
                  <div className="notice n-amber" style={{ margin: "8px 0 10px" }}>
                    Generated under a previous version of the Assessment Model —
                    re-run for the current criteria and weights.
                  </div>
                )}
                <p style={{ margin: "8px 0 10px" }}>{aiScore.summary}</p>

                <div className="table-wrap" style={{ margin: "0 0 10px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Criterion</th>
                        <th style={{ width: 60 }}>AI /5</th>
                        <th>Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiScore.perCriterion.map((c) => (
                        <tr key={c.key}>
                          <td>
                            {c.label}{" "}
                            <span className="muted">{c.weight}%</span>
                          </td>
                          <td>
                            <b>{c.score}</b>
                          </td>
                          <td className="muted">{c.rationale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={{ margin: "0 0 10px" }}>
                  <b>AI weighted total: {aiScore.weightedTotal.toFixed(1)} / 100</b>{" "}
                  <span className={`tierbanner ${TIER_CLASS[aiScore.tierKey] ?? ""}`}>
                    {aiScore.tierLabel}
                  </span>{" "}
                  <span className="muted">· confidence {aiScore.confidence}</span>
                </p>

                {!!aiScore.strengths?.length && (
                  <>
                    <p className="muted" style={{ fontWeight: 700, margin: "8px 0 0" }}>
                      Strengths
                    </p>
                    <ul>
                      {aiScore.strengths.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
                {!!aiScore.risks?.length && (
                  <>
                    <p className="muted" style={{ fontWeight: 700, margin: "8px 0 0" }}>
                      Risks &amp; gaps
                    </p>
                    <ul>
                      {aiScore.risks.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </details>
        )}

        {(demo || legacyVideos.length > 0 || !!d.liveLink || !!d.repoLink || docs.length > 0) && (
          <div className="card">
            <div className="section-head">
              <span className="n">▶</span>
              <h2>Demo, links &amp; files</h2>
            </div>

            {demo && <DemoPlayer demo={demo} />}

            {legacyVideos.map((f) => (
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

            {(!!d.liveLink || !!d.repoLink) && (
              <ul className="attach">
                {d.liveLink ? (
                  <li>
                    <span className="attach-tag">Live link</span>
                    <a href={String(d.liveLink)} target="_blank" rel="noreferrer">
                      {String(d.liveLink)}
                    </a>
                  </li>
                ) : null}
                {d.repoLink ? (
                  <li>
                    <span className="attach-tag">Repository</span>
                    <a href={String(d.repoLink)} target="_blank" rel="noreferrer">
                      {String(d.repoLink)}
                    </a>
                  </li>
                ) : null}
              </ul>
            )}

            {docs.length > 0 && (
              <div className="filelist">
                {docs.map((f) => (
                  <a key={f.id} className="filecard" href={f.href} download={f.filename}>
                    <span className="filecard-ext">
                      {(f.filename.split(".").pop() ?? "file").slice(0, 4).toUpperCase()}
                    </span>
                    <span className="filecard-name">{f.filename}</span>
                    <span className="filecard-size">
                      {f.size < 1024 * 1024
                        ? `${Math.round(f.size / 1024)} KB`
                        : `${(f.size / 1024 / 1024).toFixed(1)} MB`}
                    </span>
                    <span className="filecard-dl">Download ↓</span>
                  </a>
                ))}
              </div>
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
