import { redirect } from "next/navigation";
import { db, submissions, attachments, statusHistory, auditLog } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { newKey, putObject } from "@/lib/storage";
import { enqueue, QUEUES } from "@/lib/queue";
import {
  MAX_VIDEO_BYTES,
  MAX_FILE_BYTES,
  MAX_FILES,
  humanSize,
  isVideo,
} from "@/lib/uploads";
import Evidence from "./Evidence";

const FUNCTIONS = [
  "Commercial", "Technology", "People & Organization", "Finance",
  "Customer Care", "Risk, Compliance & Privacy", "Corporate & Regulatory Affairs", "Other",
];
const STAGES = ["Under Development", "Pilot or Testing", "Implemented"];
const TECH = [
  "Generative AI / LLM", "Machine Learning / Predictive", "Computer Vision",
  "NLP / Text Analytics", "RPA + AI", "Chatbot / Virtual Assistant",
];

async function submitInitiative(formData: FormData) {
  "use server";
  const session = await getSession();
  const g = (k: string) => String(formData.get(k) || "").trim();

  const data: Record<string, unknown> = {
    submissionType: g("submissionType"),
    teamMembers: g("teamMembers"),
    sponsorName: g("sponsorName"),
    sponsorRole: g("sponsorRole"),
    challenge: g("challenge"),
    solution: g("solution"),
    aiTech: formData.getAll("aiTech").map(String),
    aiTechOther: g("aiTechOther"),
    targetUsers: g("targetUsers"),
    whatsNew: g("whatsNew"),
    impact: g("impact"),
    financialImpact: g("financialImpact"),
    financialImpactDetail: g("financialImpactDetail"),
    evidenceStage: g("evidenceStage"),
    scalability: g("scalability"),
    keyMetrics: g("keyMetrics"),
    responsibleAI: g("responsibleAI"),
    adoptionReadiness: g("adoptionReadiness"),
    liveLink: g("liveLink"),
    repoLink: g("repoLink"),
    additionalInfo: g("additionalInfo"),
  };

  const [row] = await db
    .insert(submissions)
    .values({
      status: "SUBMITTED",
      data,
      submitterUserId: session?.userId ?? null,
      submitterName: g("submitterName"),
      submitterEmail: g("submitterEmail"),
      initiativeName: g("initiativeName"),
      theme: g("theme"),
      functionArea: g("functionArea"),
      useCaseStage: g("useCaseStage"),
    })
    .returning({ id: submissions.id });

  const video = formData.get("demoVideo");
  const supporting = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_FILES);

  const uploads: { file: File; kind: "video" | "file" }[] = [];
  if (video instanceof File && video.size > 0) {
    if (!isVideo(video) || video.size > MAX_VIDEO_BYTES) {
      throw new Error(
        `Demo video must be mp4/mov/webm and under ${humanSize(MAX_VIDEO_BYTES)}.`,
      );
    }
    uploads.push({ file: video, kind: "video" });
  }
  for (const f of supporting) {
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(`"${f.name}" exceeds the ${humanSize(MAX_FILE_BYTES)} file limit.`);
    }
    uploads.push({ file: f, kind: "file" });
  }

  for (const { file: f, kind } of uploads) {
    const key = newKey(f.name);
    await putObject(
      key,
      Buffer.from(await f.arrayBuffer()),
      f.type || "application/octet-stream",
    );
    await db.insert(attachments).values({
      submissionId: row.id,
      filename: f.name,
      contentType: f.type || "application/octet-stream",
      size: f.size,
      storageKey: key,
      kind,
    });
  }

  await db.insert(statusHistory).values({
    submissionId: row.id, from: null, to: "SUBMITTED", note: "Submitted",
  });
  await db.insert(auditLog).values({
    actorUserId: session?.userId ?? null,
    action: "submission.create",
    target: row.id,
  });

  await enqueue(QUEUES.intake, { submissionId: row.id });

  redirect(`/status/${row.id}`);
}

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card pad-lg">
      <div className="section-head">
        <span className="n">{n}</span>
        <h2>{title}</h2>
      </div>
      {hint && <p className="section-hint">{hint}</p>}
      {children}
    </div>
  );
}

export default async function SubmitPage() {
  return (
    <div className="wrap stack">
      <section className="hero">
        <div className="eyebrow">Share your idea or use case</div>
        <h1>AI Initiative Submission</h1>
        <p>
          The more concrete, the less back-and-forth later. Ideas at any stage are
          welcome. A short demo video is required — the evaluator sees your full
          submission, the demo, and every link and file you add.
        </p>
      </section>

      <form action={submitInitiative} className="stack">
        <Section n={1} title="Initiative overview">
          <div className="field">
            <label className="flabel">
              Initiative / project name <span className="req">*</span>
            </label>
            <input
              type="text"
              name="initiativeName"
              required
              placeholder="e.g. Smart Ticket Triage Assistant"
            />
          </div>
          <div className="row2">
            <div className="field">
              <label className="flabel">Submission type</label>
              <select name="submissionType" defaultValue="Individual">
                <option>Individual</option>
                <option>Team</option>
              </select>
            </div>
            <div className="field">
              <label className="flabel">
                AI1440 theme <span className="req">*</span>
              </label>
              <select name="theme" required defaultValue="">
                <option value="" disabled>Select…</option>
                <option>Consumer</option>
                <option>Corporate</option>
                <option>Enterprise</option>
              </select>
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label className="flabel">
                Business / function <span className="req">*</span>
              </label>
              <select name="functionArea" required defaultValue="">
                <option value="" disabled>Select…</option>
                {FUNCTIONS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="flabel">
                Use case stage <span className="req">*</span>
              </label>
              <select name="useCaseStage" required defaultValue="">
                <option value="" disabled>Select…</option>
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        <Section n={2} title="Submitter & team">
          <div className="row2">
            <div className="field">
              <label className="flabel">
                Submitter name <span className="req">*</span>
              </label>
              <input type="text" name="submitterName" required />
            </div>
            <div className="field">
              <label className="flabel">
                Submitter email <span className="req">*</span>
              </label>
              <input type="email" name="submitterEmail" required />
            </div>
          </div>
          <div className="field">
            <label className="flabel">
              Team members <span className="opt">optional</span>
            </label>
            <textarea
              name="teamMembers"
              placeholder="Name — role / function, one per line"
            />
          </div>
          <div className="row2">
            <div className="field">
              <label className="flabel">
                Project owner / sponsor <span className="req">*</span>
              </label>
              <input type="text" name="sponsorName" required />
            </div>
            <div className="field">
              <label className="flabel">
                Sponsor role / title <span className="opt">optional</span>
              </label>
              <input type="text" name="sponsorRole" />
            </div>
          </div>
        </Section>

        <Section n={3} title="Challenge, solution & innovation">
          <div className="field">
            <label className="flabel">
              Business challenge or opportunity <span className="req">*</span>
            </label>
            <textarea
              name="challenge"
              required
              placeholder="What problem were you solving, and for whom?"
            />
          </div>
          <div className="field">
            <label className="flabel">
              Description of the AI solution <span className="req">*</span>
            </label>
            <textarea
              name="solution"
              required
              placeholder="What did you build or implement, in plain language?"
            />
          </div>
          <div className="field">
            <label className="flabel">
              AI technology / approach used <span className="opt">optional</span>
            </label>
            {TECH.map((t) => (
              <label key={t} className="checkline">
                <input type="checkbox" name="aiTech" value={t} /> {t}
              </label>
            ))}
            <input
              type="text"
              name="aiTechOther"
              placeholder="Other approach"
              style={{ marginTop: 8 }}
            />
          </div>
          <div className="row2">
            <div className="field">
              <label className="flabel">
                Target users / customers <span className="req">*</span>
              </label>
              <input type="text" name="targetUsers" required />
            </div>
            <div className="field">
              <label className="flabel">
                What&apos;s new or different <span className="req">*</span>
              </label>
              <input type="text" name="whatsNew" required />
            </div>
          </div>
        </Section>

        <Section n={4} title="Impact & scalability">
          <div className="field">
            <label className="flabel">
              Impact <span className="req">*</span>
            </label>
            <textarea
              name="impact"
              required
              placeholder="Who benefits and how — customers, employees, and/or the business?"
            />
          </div>
          <div className="row2">
            <div className="field">
              <label className="flabel">
                Financial impact type <span className="opt">optional</span>
              </label>
              <select name="financialImpact" defaultValue="">
                <option value="">Select…</option>
                <option>Revenue generated / enabled</option>
                <option>Cost savings</option>
                <option>Cost avoidance</option>
                <option>Productivity / efficiency value</option>
                <option>Not applicable</option>
              </select>
            </div>
            <div className="field">
              <label className="flabel">
                Quantify <span className="opt">optional</span>
              </label>
              <input
                type="text"
                name="financialImpactDetail"
                placeholder="e.g. PKR 2.4M/yr in cost savings"
              />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label className="flabel">
                Evidence stage <span className="req">*</span>
              </label>
              <select name="evidenceStage" required defaultValue="">
                <option value="" disabled>Select…</option>
                <option>Concept only — no data yet</option>
                <option>Feasibility validated</option>
                <option>Pilot data available</option>
                <option>Full results measured</option>
              </select>
            </div>
            <div className="field">
              <label className="flabel">
                Scalability potential <span className="req">*</span>
              </label>
              <select name="scalability" required defaultValue="">
                <option value="" disabled>Select…</option>
                <option>Team-only</option>
                <option>Function-wide</option>
                <option>Company-wide (JazzWorld)</option>
                <option>Multi-market potential (VEON OpCos)</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label className="flabel">
              Key metrics <span className="opt">optional</span>
            </label>
            <textarea
              name="keyMetrics"
              placeholder="e.g. Avg. handling time: 8 min → 3 min"
            />
          </div>
        </Section>

        <Section n={5} title="Responsible AI & adoption">
          <div className="field">
            <label className="flabel">
              Responsible AI details <span className="req">*</span>
            </label>
            <textarea
              name="responsibleAI"
              required
              placeholder="Data handling, privacy, fairness, human oversight"
            />
          </div>
          <div className="field">
            <label className="flabel">
              Adoption readiness <span className="req">*</span>
            </label>
            <select name="adoptionReadiness" required defaultValue="">
              <option value="" disabled>Select…</option>
              <option>Not yet adopted — concept stage</option>
              <option>Early adoption — limited users</option>
              <option>Broad adoption within team / function</option>
              <option>Fully embedded in business-as-usual</option>
            </select>
          </div>
        </Section>

        <Section
          n={6}
          title="Supporting evidence"
          hint="The evaluator watches the demo and opens every file and link you add here."
        >
          <Evidence />
          <div className="field" style={{ marginTop: 20 }}>
            <label className="flabel">
              Additional information <span className="opt">optional</span>
            </label>
            <input
              type="text"
              name="additionalInfo"
              placeholder="Anything else the panel should know"
            />
          </div>
        </Section>

        <Section n={7} title="Declaration">
          <label className="consent">
            <input type="checkbox" required />
            <span>
              I confirm the information is accurate, I have the approvals to share it,
              and applicable data privacy and Responsible AI requirements have been
              followed.
            </span>
          </label>
        </Section>

        <div className="btn-row">
          <button className="btn" type="submit">
            Submit initiative →
          </button>
        </div>
      </form>
    </div>
  );
}
