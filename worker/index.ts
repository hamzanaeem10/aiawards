import "dotenv/config";
import { eq, ne } from "drizzle-orm";
import { db, submissions, aiInsights } from "../lib/db";
import { generateIntakeSummary } from "../lib/ai/intake";
import { QUEUES, makeBoss } from "../lib/queue";

// Advisory work: keep concurrency low so a 3000-submission cycle can't stampede
// the Anthropic API or the database. ~batchSize jobs per poll.
const WORK_OPTS = { batchSize: 2, pollingIntervalSeconds: 3 } as const;

async function main() {
  const boss = makeBoss();
  boss.on("error", (e) => console.error("[pg-boss]", e));
  await boss.start();
  for (const q of Object.values(QUEUES)) await boss.createQueue(q);

  const shutdown = async () => {
    console.log("worker stopping…");
    try {
      await boss.stop({ wait: true });
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await boss.work(QUEUES.intake, WORK_OPTS, async ([job]) => {
    const { submissionId } = job.data as { submissionId: string };
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    if (!sub) return;

    const prior = await db
      .select({ id: submissions.id, name: submissions.initiativeName, data: submissions.data })
      .from(submissions)
      .where(ne(submissions.id, submissionId))
      .limit(25);

    const { model, content } = await generateIntakeSummary({
      submission: { initiativeName: sub.initiativeName, ...sub.data },
      priorInitiatives: prior.map((p) => ({
        id: p.id,
        name: p.name,
        summary: String((p.data as any)?.solution ?? "").slice(0, 200),
      })),
    });

    await db.insert(aiInsights).values({
      submissionId,
      type: "intake_summary",
      model,
      content: content as any,
    });
    console.log(`[intake] summary stored for ${submissionId}`);
  });

  console.log("worker running: ai-intake");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
