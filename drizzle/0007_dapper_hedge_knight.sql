CREATE TABLE IF NOT EXISTS "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"approver_user_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"notes" text,
	"decided_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_submission_idx" ON "approvals" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_approver_idx" ON "approvals" USING btree ("approver_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "approvals_submission_approver_uniq" ON "approvals" USING btree ("submission_id","approver_user_id");