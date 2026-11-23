CREATE TABLE "email_login_codes" (
	"email" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_login_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "email_login_codes_expires_idx" ON "email_login_codes" USING btree ("expires_at");