CREATE TYPE "public"."anamnesis_status" AS ENUM('OPEN', 'ABORTED_EMERGENCY', 'SUBMITTED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."doc_kind" AS ENUM('PDF', 'IMAGE');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('DIALOG', 'DOCUMENT');--> statement-breakpoint
CREATE TYPE "public"."extraction_status" AS ENUM('NONE', 'PENDING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."realm" AS ENUM('patient', 'doctor');--> statement-breakpoint
CREATE TABLE "anamnesis_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"invitation_id" uuid,
	"status" "anamnesis_status" DEFAULT 'OPEN' NOT NULL,
	"schema_version" text NOT NULL,
	"appointment_at" timestamp with time zone NOT NULL,
	"dialog_state" jsonb,
	"submitted_at" timestamp with time zone,
	"delete_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm" realm NOT NULL,
	"subject_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "complaint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"region" text NOT NULL,
	"label_patient_enc" text NOT NULL,
	"label_clinical_enc" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"version" text NOT NULL,
	"purpose" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doctor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"pw_hash" text NOT NULL,
	"totp_secret_enc" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctor_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "doc_kind" NOT NULL,
	"mime" text NOT NULL,
	"filename_enc" text NOT NULL,
	"size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"extraction_status" "extraction_status" DEFAULT 'NONE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"field" text NOT NULL,
	"patient_quote_enc" text NOT NULL,
	"clinical_term_enc" text,
	"translation_blocked" boolean DEFAULT false NOT NULL,
	"source" "entry_source" NOT NULL,
	"source_ref" text,
	"prompt_version" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"appointment_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_patient_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "lab_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"complaint_id" uuid,
	"name_as_printed_enc" text NOT NULL,
	"value_enc" text NOT NULL,
	"unit_enc" text,
	"ref_range_as_printed_enc" text,
	"page" integer,
	"mapping_rule_id" text
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content_enc" text NOT NULL,
	"prompt_version" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"email" text NOT NULL,
	"pw_hash" text NOT NULL,
	"pseudonym" text NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_email_unique" UNIQUE("email"),
	CONSTRAINT "patient_pseudonym_unique" UNIQUE("pseudonym")
);
--> statement-breakpoint
CREATE TABLE "practice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"retention_days" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "summary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content_enc" text NOT NULL,
	"prompt_version" text,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anamnesis_session" ADD CONSTRAINT "anamnesis_session_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnesis_session" ADD CONSTRAINT "anamnesis_session_doctor_id_doctor_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamnesis_session" ADD CONSTRAINT "anamnesis_session_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaint" ADD CONSTRAINT "complaint_session_id_anamnesis_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anamnesis_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor" ADD CONSTRAINT "doctor_practice_id_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_session_id_anamnesis_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anamnesis_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry" ADD CONSTRAINT "entry_complaint_id_complaint_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_practice_id_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_doctor_id_doctor_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_used_by_patient_id_patient_id_fk" FOREIGN KEY ("used_by_patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_value" ADD CONSTRAINT "lab_value_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_value" ADD CONSTRAINT "lab_value_complaint_id_complaint_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaint"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_session_id_anamnesis_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anamnesis_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient" ADD CONSTRAINT "patient_practice_id_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary" ADD CONSTRAINT "summary_session_id_anamnesis_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."anamnesis_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anamnesis_doctor_idx" ON "anamnesis_session" USING btree ("doctor_id","appointment_at");--> statement-breakpoint
CREATE INDEX "auth_session_subject_idx" ON "auth_session" USING btree ("realm","subject_id");--> statement-breakpoint
CREATE INDEX "consent_patient_idx" ON "consent" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "summary_session_version" ON "summary" USING btree ("session_id","version");