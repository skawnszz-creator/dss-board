CREATE TABLE "web_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_post_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text
);
--> statement-breakpoint
CREATE TABLE "web_post_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text
);
--> statement-breakpoint
CREATE TABLE "web_post_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"first_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"view_count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	CONSTRAINT "web_posts_topic_check" CHECK ("web_posts"."topic" in ('MUST_READ','NOTICE','GENERAL'))
);
--> statement-breakpoint
CREATE TABLE "web_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_sub" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"delete_reason" text,
	CONSTRAINT "web_users_role_check" CHECK ("web_users"."role" in ('MEMBER','ADMIN'))
);
--> statement-breakpoint
ALTER TABLE "web_audit_logs" ADD CONSTRAINT "web_audit_logs_actor_id_web_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."web_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_post_files" ADD CONSTRAINT "web_post_files_post_id_web_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."web_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_post_files" ADD CONSTRAINT "web_post_files_uploaded_by_web_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."web_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_post_images" ADD CONSTRAINT "web_post_images_post_id_web_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."web_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_post_images" ADD CONSTRAINT "web_post_images_uploaded_by_web_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."web_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_post_views" ADD CONSTRAINT "web_post_views_post_id_web_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."web_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_post_views" ADD CONSTRAINT "web_post_views_user_id_web_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."web_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_posts" ADD CONSTRAINT "web_posts_author_id_web_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."web_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_user_id_web_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."web_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "web_audit_logs_created_idx" ON "web_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "web_audit_logs_target_idx" ON "web_audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "web_post_files_post_idx" ON "web_post_files" USING btree ("post_id","sort_order") WHERE "web_post_files"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "web_post_images_post_idx" ON "web_post_images" USING btree ("post_id") WHERE "web_post_images"."is_deleted" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "web_post_views_post_user_uq" ON "web_post_views" USING btree ("post_id","user_id");--> statement-breakpoint
CREATE INDEX "web_posts_live_created_idx" ON "web_posts" USING btree ("created_at") WHERE "web_posts"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "web_posts_live_topic_idx" ON "web_posts" USING btree ("topic","created_at") WHERE "web_posts"."is_deleted" = false;--> statement-breakpoint
CREATE INDEX "web_posts_author_idx" ON "web_posts" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "web_sessions_token_hash_uq" ON "web_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "web_sessions_user_idx" ON "web_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "web_users_auth_sub_uq" ON "web_users" USING btree ("auth_sub");--> statement-breakpoint
CREATE INDEX "web_users_alive_idx" ON "web_users" USING btree ("display_name") WHERE "web_users"."is_deleted" = false;