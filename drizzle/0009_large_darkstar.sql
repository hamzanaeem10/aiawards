CREATE TABLE IF NOT EXISTS "revoked_sessions" (
	"jti" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "revoked_sessions" ADD CONSTRAINT "revoked_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "revoked_sessions_expires_at_idx" ON "revoked_sessions" USING btree ("expires_at");