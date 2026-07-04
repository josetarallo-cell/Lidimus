ALTER TABLE "job_files" DROP COLUMN "content";--> statement-breakpoint
ALTER TABLE "job_files" ADD COLUMN "gcs_path" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "job_files" ALTER COLUMN "gcs_path" DROP DEFAULT;
