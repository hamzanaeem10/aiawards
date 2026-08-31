import PgBoss from "pg-boss";
import { AI_DISABLED } from "./ai/client";

const globalForBoss = globalThis as unknown as { boss?: PgBoss };

export const QUEUES = {
  intake: "ai-intake",
} as const;

export function makeBoss() {
  return new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    max: 4, // small dedicated pool for the job engine
    // housekeeping so the job tables don't grow unbounded across cycles
    deleteAfterDays: 7,
    archiveCompletedAfterSeconds: 12 * 60 * 60,
    archiveFailedAfterSeconds: 3 * 24 * 60 * 60,
  });
}

async function getBoss() {
  if (globalForBoss.boss) return globalForBoss.boss;
  const boss = makeBoss();
  boss.on("error", (e) => console.error("[pg-boss]", e));
  await boss.start();
  for (const q of Object.values(QUEUES)) await boss.createQueue(q);
  globalForBoss.boss = boss;
  return boss;
}

/**
 * Fire-and-forget an advisory job. Never throws — a failed enqueue must not
 * break a submission or a recorded assessment. Jobs retry with backoff and
 * are de-duplicated per (queue, submission) so a retried request can't
 * double-queue the same work.
 */
export async function enqueue(queue: string, data: Record<string, unknown>) {
  // No AI → no worker → nothing consumes the queue. Skip it entirely so a
  // serverless deploy (e.g. Vercel) never needs the pg-boss schema.
  if (AI_DISABLED) return;
  try {
    const boss = await getBoss();
    await boss.send(queue, data, {
      retryLimit: 4,
      retryDelay: 30,
      retryBackoff: true,
      expireInMinutes: 20,
      singletonKey:
        typeof data.submissionId === "string"
          ? `${queue}:${data.submissionId}`
          : undefined,
    });
  } catch (e) {
    console.error("[enqueue] failed:", e);
  }
}
