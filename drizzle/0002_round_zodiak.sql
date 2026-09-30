ALTER TABLE "document" ADD COLUMN "extraction_note" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "extracted_text_enc" text;--> statement-breakpoint
ALTER TABLE "document" ADD COLUMN "complaint_id" uuid;--> statement-breakpoint
ALTER TABLE "lab_value" ADD COLUMN "line_enc" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lab_value" ADD COLUMN "canonical_name" text;--> statement-breakpoint
ALTER TABLE "lab_value" ADD COLUMN "mapping_region" text;--> statement-breakpoint
ALTER TABLE "lab_value" ADD COLUMN "assigned_by" text;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_complaint_id_complaint_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaint"("id") ON DELETE set null ON UPDATE no action;