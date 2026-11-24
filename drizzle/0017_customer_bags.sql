CREATE TABLE "customer_bags" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"bag" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"likes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_bags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_bags" ADD CONSTRAINT "customer_bags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;