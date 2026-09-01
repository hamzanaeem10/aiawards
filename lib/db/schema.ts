import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";

// ---- Users & roles -------------------------------------------------------
// role: 'nominee' | 'reviewer' | 'admin'
// The admin manages everything and can also evaluate; reviewers only evaluate.
// The admin is created by db:seed; reviewers are added from /admin/users.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("nominee"),
  active: boolean("active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---- Submissions -------------------------------------------------------
export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: text("status").notNull().default("SUBMITTED"),
  // full form payload (theme, function, challenge, solution, impact, metrics, etc.)
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  submitterUserId: uuid("submitter_user_id").references(() => users.id),
  submitterName: text("submitter_name").notNull(),
  submitterEmail: text("submitter_email").notNull(),
  initiativeName: text("initiative_name").notNull(),
  theme: text("theme"),
  functionArea: text("function_area"),
  useCaseStage: text("use_case_stage"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  byStatus: index("submissions_status_idx").on(t.status),
  byCreated: index("submissions_created_at_idx").on(t.createdAt),
  bySubmitter: index("submissions_submitter_idx").on(t.submitterUserId),
}));

export const attachments = pgTable("attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .references(() => submissions.id, { onDelete: "cascade" })
    .notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  storageKey: text("storage_key").notNull(), // object-storage key (MinIO/S3)
  kind: text("kind").notNull().default("file"), // 'file' | 'link'
  url: text("url"), // for kind='link'
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  bySubmission: index("attachments_submission_idx").on(t.submissionId),
}));

// ---- Evaluations (ONE per evaluator, scores written only by a human) ---
export const evaluations = pgTable("evaluations", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .references(() => submissions.id, { onDelete: "cascade" })
    .notNull(),
  reviewerUserId: uuid("reviewer_user_id").references(() => users.id).notNull(),
  // { <criterion key>: 1..5 } — keys come from lib/rubric.ts CRITERIA
  scores: jsonb("scores").notNull().$type<Record<string, number>>(),
  weightedTotal: integer("weighted_total").notNull(), // stored x10 (e.g. 837 = 83.7)
  tier: text("tier").notNull(),
  recommendation: text("recommendation").notNull(), // 'auto' or an explicit override
  rationale: text("rationale"),
  additionalValidation: text("additional_validation"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
}, (t) => ({
  bySubmission: index("evaluations_submission_idx").on(t.submissionId),
  byReviewer: index("evaluations_reviewer_idx").on(t.reviewerUserId),
}));

export const statusHistory = pgTable("status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .references(() => submissions.id, { onDelete: "cascade" })
    .notNull(),
  from: text("from"),
  to: text("to").notNull(),
  note: text("note"),
  byUserId: uuid("by_user_id").references(() => users.id),
  at: timestamp("at").defaultNow().notNull(),
}, (t) => ({
  bySubmission: index("status_history_submission_idx").on(t.submissionId),
}));

// ---- AI insights: SUPPLEMENTARY only. Never written to `evaluations` or the
// lifecycle; the human panel's score is always the score of record.
// type: 'ai_assessment' — the on-demand Groq assessment shown on the evaluate screen
export const aiInsights = pgTable("ai_insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .references(() => submissions.id, { onDelete: "cascade" })
    .notNull(),
  type: text("type").notNull(),
  model: text("model"),
  content: jsonb("content").notNull().$type<Record<string, unknown>>(),
  editedByUserId: uuid("edited_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  bySubmissionType: index("ai_insights_submission_type_idx").on(t.submissionId, t.type),
}));

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  at: timestamp("at").defaultNow().notNull(),
}, (t) => ({
  byAt: index("audit_log_at_idx").on(t.at),
  byTarget: index("audit_log_target_idx").on(t.target),
}));
