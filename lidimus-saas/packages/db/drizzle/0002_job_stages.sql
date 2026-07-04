CREATE TYPE "public"."job_stage" AS ENUM('ocr', 'juridico', 'doc');--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "stage" "job_stage";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "stage_data" jsonb;
