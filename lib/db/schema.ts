import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
  uniqueIndex,
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

/**
 * One-time sign-in codes emailed to a user. Only a keyed hash of the code is
 * stored, so a database reader cannot replay a live code — see lib/otp.ts.
 * Rows are consumed on use and swept on the next issue for the same address.
 */
export const loginCodes = pgTable("login_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  attempts: integer("attempts").notNull().default(0),
  requestIp: text("request_ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  byEmail: index("login_codes_email_idx").on(t.email),
  byExpiry: index("login_codes_expires_at_idx").on(t.expiresAt),
  // Per-IP throttling counts rows by (request_ip, created_at) on every code
  // request, so this index keeps that a range scan rather than a table scan.
  byIpTime: index("login_codes_ip_created_idx").on(t.requestIp, t.createdAt),
}));

/**
 * Sign-off on a submission by an approver, recorded alongside — never instead
 * of — the panel's scores. One decision per approver per submission, revisable
 * (the row is updated, not duplicated), which the unique index enforces.
 *
 * This does NOT touch the score of record or the lifecycle status: those stay
 * with the evaluators' `recordAssessment`. An approval is a governance step on
 * top of the panel average.
 */
export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .references(() => submissions.id, { onDelete: "cascade" })
    .notNull(),
  approverUserId: uuid("approver_user_id").references(() => users.id).notNull(),
  decision: text("decision").notNull(), // 'approved' | 'disapproved'
  notes: text("notes"),
  decidedAt: timestamp("decided_at").defaultNow().notNull(),
}, (t) => ({
  bySubmission: index("approvals_submission_idx").on(t.submissionId),
  byApprover: index("approvals_approver_idx").on(t.approverUserId),
  onePerApprover: uniqueIndex("approvals_submission_approver_uniq").on(
    t.submissionId,
    t.approverUserId,
  ),
}));

/**
 * Revoked session identifiers — the server-side half of logout.
 *
 * The session is a stateless JWT, so deleting the cookie only clears the
 * browser's copy: a token captured beforehand stays valid until it expires
 * (VAPT IDX-005). Every token now carries a `jti`, logout records that jti
 * here, and getSession() refuses any token listed. Rows are only needed until
 * the token would have expired anyway, so they are swept on write.
 */
export const revokedSessions = pgTable("revoked_sessions", {
  jti: text("jti").primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at").defaultNow().notNull(),
}, (t) => ({
  byExpiry: index("revoked_sessions_expires_at_idx").on(t.expiresAt),
}));
