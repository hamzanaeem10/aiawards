CREATE TABLE IF NOT EXISTS "login_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"request_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_codes_email_idx" ON "login_codes" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_codes_expires_at_idx" ON "login_codes" USING btree ("expires_at");