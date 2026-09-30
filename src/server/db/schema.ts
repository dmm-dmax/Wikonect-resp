import {
  pgTable, uuid, text, timestamp, integer, boolean, bigint, pgEnum, index, uniqueIndex, jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const realmEnum = pgEnum("realm", ["patient", "doctor"]);
export const anamnesisStatusEnum = pgEnum("anamnesis_status", [
  "OPEN", "ABORTED_EMERGENCY", "SUBMITTED", "DELETED",
]);
export const entrySourceEnum = pgEnum("entry_source", ["DIALOG", "DOCUMENT"]);
export const docKindEnum = pgEnum("doc_kind", ["PDF", "IMAGE"]);
export const extractionStatusEnum = pgEnum("extraction_status", [
  "NONE", "PENDING", "DONE", "FAILED",
]);

export const practice = pgTable("practice", {
  id: id(),
  name: text("name").notNull(),
  retentionDays: integer("retention_days").notNull().default(30),
  createdAt: createdAt(),
});

export const doctor = pgTable("doctor", {
  id: id(),
  practiceId: uuid("practice_id").notNull().references(() => practice.id),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  pwHash: text("pw_hash").notNull(),
  totpSecretEnc: text("totp_secret_enc").notNull(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: createdAt(),
});

export const patient = pgTable("patient", {
  id: id(),
  practiceId: uuid("practice_id").notNull().references(() => practice.id),
  email: text("email").notNull().unique(),
  pwHash: text("pw_hash").notNull(),
  pseudonym: text("pseudonym").notNull().unique(),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: createdAt(),
});

export const invitation = pgTable("invitation", {
  id: id(),
  practiceId: uuid("practice_id").notNull().references(() => practice.id),
  doctorId: uuid("doctor_id").notNull().references(() => doctor.id),
  tokenHash: text("token_hash").notNull().unique(),
  appointmentAt: timestamp("appointment_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByPatientId: uuid("used_by_patient_id").references(() => patient.id),
  createdAt: createdAt(),
});

export const authSession = pgTable("auth_session", {
  id: id(),
  realm: realmEnum("realm").notNull(),
  subjectId: uuid("subject_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("auth_session_subject_idx").on(t.realm, t.subjectId)]);

export const consent = pgTable("consent", {
  id: id(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  version: text("version").notNull(),
  purpose: text("purpose").notNull(), // dialog | ai_processing | upload
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("consent_patient_idx").on(t.patientId)]);

export const anamnesisSession = pgTable("anamnesis_session", {
  id: id(),
  patientId: uuid("patient_id").notNull().references(() => patient.id),
  doctorId: uuid("doctor_id").notNull().references(() => doctor.id),
  invitationId: uuid("invitation_id").references(() => invitation.id),
  status: anamnesisStatusEnum("status").notNull().default("OPEN"),
  schemaVersion: text("schema_version").notNull(),
  appointmentAt: timestamp("appointment_at", { withTimezone: true }).notNull(),
  dialogState: jsonb("dialog_state"), // Fortschritt, kein Freitext
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  deleteAfter: timestamp("delete_after", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, (t) => [index("anamnesis_doctor_idx").on(t.doctorId, t.appointmentAt)]);

export const complaint = pgTable("complaint", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => anamnesisSession.id, { onDelete: "cascade" }),
  region: text("region").notNull(),
  labelPatientEnc: text("label_patient_enc").notNull(),
  labelClinicalEnc: text("label_clinical_enc"),
  position: integer("position").notNull().default(0),
});

export const message = pgTable("message", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => anamnesisSession.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // patient | assistant
  contentEnc: text("content_enc").notNull(),
  promptVersion: text("prompt_version"),
  model: text("model"),
  createdAt: createdAt(),
});

export const entry = pgTable("entry", {
  id: id(),
  complaintId: uuid("complaint_id").notNull().references(() => complaint.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  patientQuoteEnc: text("patient_quote_enc").notNull(),
  clinicalTermEnc: text("clinical_term_enc"),
  translationBlocked: boolean("translation_blocked").notNull().default(false),
  source: entrySourceEnum("source").notNull(),
  sourceRef: text("source_ref"),
  promptVersion: text("prompt_version"),
  model: text("model"),
  createdAt: createdAt(),
});

export const document = pgTable("document", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => anamnesisSession.id, { onDelete: "cascade" }),
  kind: docKindEnum("kind").notNull(),
  mime: text("mime").notNull(),
  filenameEnc: text("filename_enc").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  extractionStatus: extractionStatusEnum("extraction_status").notNull().default("NONE"),
  createdAt: createdAt(),
});

export const labValue = pgTable("lab_value", {
  id: id(),
  documentId: uuid("document_id").notNull().references(() => document.id, { onDelete: "cascade" }),
  complaintId: uuid("complaint_id").references(() => complaint.id, { onDelete: "set null" }),
  nameAsPrintedEnc: text("name_as_printed_enc").notNull(),
  valueEnc: text("value_enc").notNull(),
  unitEnc: text("unit_enc"),
  refRangeAsPrintedEnc: text("ref_range_as_printed_enc"),
  page: integer("page"),
  mappingRuleId: text("mapping_rule_id"),
});

export const summary = pgTable("summary", {
  id: id(),
  sessionId: uuid("session_id").notNull().references(() => anamnesisSession.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  contentEnc: text("content_enc").notNull(),
  promptVersion: text("prompt_version"),
  model: text("model"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("summary_session_version").on(t.sessionId, t.version)]);

export const auditLog = pgTable("audit_log", {
  seq: bigint("seq", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
  actorType: text("actor_type").notNull(), // patient | doctor | system
  actorId: text("actor_id"),
  action: text("action").notNull(),
  objectType: text("object_type"),
  objectId: text("object_id"),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
});
