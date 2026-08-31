CREATE INDEX IF NOT EXISTS "ai_insights_submission_type_idx" ON "ai_insights" USING btree ("submission_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_submission_idx" ON "attachments" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_target_idx" ON "audit_log" USING btree ("target");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "decisions_submission_idx" ON "decisions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluations_submission_idx" ON "evaluations" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evaluations_reviewer_idx" ON "evaluations" USING btree ("reviewer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_history_submission_idx" ON "status_history" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_created_at_idx" ON "submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_submitter_idx" ON "submissions" USING btree ("submitter_user_id");