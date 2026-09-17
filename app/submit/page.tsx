import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, submissions, attachments, statusHistory, auditLog } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ALLOWED_EMAIL_DOMAINS, isEmailAllowed, normalizeEmail } from "@/lib/otp";
import { readTeamMembers } from "@/lib/teamMembers";
import { newKey, putObject } from "@/lib/storage";
import { MAX_FILE_BYTES, MAX_FILES, humanSize } from "@/lib/uploads";
import Evidence from "./Evidence";
import TeamMembers from "./TeamMembers";
import SubmitButton from "./SubmitButton";

const FUNCTIONS = [
  "Jazz GSM",
  "Jazz Business",
  "Enterprise Solutions",
  "Consumer",
  "Technology",
  "Artificial Intelligence",
  "Cyber Security",
  "Teknosys",
  "JazzCash",
  "Jazz LifeStyle Ventures (JLV)",
  "Finance",
  "Strategy",
  "People & Organization",
  "Legal Affairs",
  "Compliance",
  "Internal Audit",
  "Corporate & Regulatory Affairs",
  "President Office",
  "Other",
];
const STAGES = ["Under Development", "Pilot or Testing", "Implemented"];
const TECH = [
  "Generative AI / LLM", "Machine Learning / Predictive", "Computer Vision",
  "NLP / Text Analytics", "RPA + AI", "Chatbot / Virtual Assistant",
];

async function submitInitiative(formData: FormData) {
  "use server";
  // A server action is its own POST endpoint, reachable by anyone who has seen
  // the page — the redirect guard on SubmitPage below protects the render only.
  // This action previously read the session without requiring it
  // (`session?.userId ?? null`), so an unauthenticated or signed-out client
  // could still file a submission. Authorise here, in the action itself.
  const session = await getSession();
  if (!session) redirect("/login");

  const g = (k: string) => String(formData.get(k) || "").trim();

  // Team members arrive as parallel repeated fields from the Section 2 repeater.
  // The list is stored only for a Team submission: the rows stay in the DOM when
  // the type is Individual (they are merely hidden by CSS), so the server is the
  // authority on whether they count, not the client.
  const submissionType = g("submissionType");
  const teamMembers =
    submissionType === "Team"
      ? readTeamMembers(
          formData.getAll("teamMemberName").map(String),
          formData.getAll("teamMemberContribution").map(String),
        )
      : [];

  const data: Record<string, unknown> = {
    submissionType,
    teamMembers,
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
    demoVideoUrl: g("demoVideoUrl"),
    liveLink: g("liveLink"),
    repoLink: g("repoLink"),
    additionalInfo: g("additionalInfo"),
  };

  const initiativeName = g("initiativeName");
  const submitterEmail = normalizeEmail(g("submitterEmail"));

  // VULN-004: the form previously accepted any address, so a submission could
  // be filed under an arbitrary external mailbox (e.g. @yopmail.com). The
  // browser's type="email" check is a usability aid only — an attacker posts
  // the action directly — so the domain is enforced here, server-side, using
  // the same allowlist that gates sign-in.
  if (!isEmailAllowed(submitterEmail)) redirect("/submit?e=domain");

  // Guard against a double-submit (fast double-click, browser retry): if an
  // identical submission landed in the last 2 minutes, reuse it.
  const [dupe] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.initiativeName, initiativeName),
        eq(submissions.submitterEmail, submitterEmail),
        gt(submissions.createdAt, new Date(Date.now() - 2 * 60 * 1000)),
      ),
    );
  if (dupe) redirect(`/status/${dupe.id}`);

  const [row] = await db
    .insert(submissions)
    .values({
      status: "SUBMITTED",
      data,
      submitterUserId: session.userId,
      submitterName: g("submitterName"),
      submitterEmail,
      initiativeName,
      theme: g("theme"),
      functionArea: g("functionArea"),
      useCaseStage: g("useCaseStage"),
    })
    .returning({ id: submissions.id });

  const supporting = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_FILES);

  for (const f of supporting) {
    if (f.size > MAX_FILE_BYTES) {
      throw new Error(`"${f.name}" exceeds the ${humanSize(MAX_FILE_BYTES)} file limit.`);
    }
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
      kind: "file",
    });
  }

  await db.insert(statusHistory).values({
    submissionId: row.id, from: null, to: "SUBMITTED", note: "Submitted",
  });
  await db.insert(auditLog).values({
    actorUserId: session.userId,
    action: "submission.create",
    target: row.id,
  });

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

export default async function SubmitPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  // Reachable only behind sign-in, same as the landing page.
  if (!(await getSession())) redirect("/login");
  const { e } = await searchParams;

  return (
    <div className="wrap stack">
      {/* Campaign banner. Plain <img> rather than next/image to match the
          Logo component and keep the standalone build free of the image
          optimiser. width/height are the intrinsic pixels, so the browser
          reserves the right box before the file loads and nothing shifts. */}
      <div className="form-banner">
        <img
          src="/ai-impact-banner.jpg"
          alt="AI Impact Awards 2026 — Think AI, Build Bold, Win Big"
          width={1920}
          height={640}
        />
      </div>

      {/* The banner carries the page's identity, so the maroon hero that used
          to sit here was removed. The heading stays for assistive tech and
          document structure — a page still needs an h1, and the banner is an
          image, not a heading. */}
      <h1 className="sr-only">AI Initiative Submission</h1>

      {e === "domain" && (
        <div className="notice n-danger" role="alert">
          Use your work email address (
          {ALLOWED_EMAIL_DOMAINS.map((d) => "@" + d).join(" or ")}) as the
          submitter email.
        </div>
      )}

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
              {/* Explicit value attributes matter: the CSS rule that reveals the
                  Section 2 team list keys off `option[value="Team"]:checked`,
                  and an attribute selector cannot see a value that is only
                  implied by the option's text. */}
              <select name="submissionType" defaultValue="Individual">
                <option value="Individual">Individual</option>
                <option value="Team">Team</option>
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
              <input
                type="email"
                name="submitterEmail"
                required
                placeholder={`you@${ALLOWED_EMAIL_DOMAINS[0] ?? "jazz.com.pk"}`}
              />
            </div>
          </div>
          <TeamMembers />
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

        <Section n={6} title="Supporting evidence">
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
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
