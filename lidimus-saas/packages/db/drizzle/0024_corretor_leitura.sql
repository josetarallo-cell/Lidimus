ALTER TYPE "public"."job_stage" ADD VALUE 'revisao' BEFORE 'juridico';--> statement-breakpoint
ALTER TYPE "public"."job_status" ADD VALUE 'awaiting_review' BEFORE 'done';