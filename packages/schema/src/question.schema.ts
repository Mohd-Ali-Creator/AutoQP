import { z } from "zod";

// =====================================================================
// AutoQP — application-layer Zod schemas (single source of truth)
//
// Field names are camelCase here. The database stores the same data as
// snake_case columns (db/schema.sql). Conversion happens once, at the
// Supabase data-access boundary — never here, and never anywhere else.
//
// Every producer (AI generation, OCR extraction, manual entry) must
// parse its output through the relevant schema before it is trusted.
// Every consumer (blueprint generator, LaTeX templates) may assume
// anything typed through these schemas has already been validated.
//
// If this file and AGENTS.md ever disagree on a field, THIS file wins.
// =====================================================================

// ─── Shared primitives ────────────────────────────────────────────────────────

/** Maps to the `difficulty_level` Postgres enum. */
export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof difficultySchema>;

/** Maps to the `user_role` Postgres enum. */
export const userRoleSchema = z.enum(["instructor", "admin"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Maps to the `staging_source` Postgres enum. */
export const stagingSourceSchema = z.enum([
  "ai_generated",
  "ocr_extracted",
  "manual",
]);
export type StagingSource = z.infer<typeof stagingSourceSchema>;

/** Maps to the `paper_status` Postgres enum. */
export const paperStatusSchema = z.enum(["draft", "compiled", "archived"]);
export type PaperStatus = z.infer<typeof paperStatusSchema>;

// ─── Question type-data schemas ───────────────────────────────────────────────
// Each lives as its own export so consumers can validate JSONB type_data
// independently (e.g. when reading a single branch from a staging draft).

const optionSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
});

export const mcqDataSchema = z
  .object({
    options: z.array(optionSchema).min(2, "MCQ needs at least two options"),
    correctOptionId: z.string(),
  })
  // schema.sql cannot enforce this as a real FK — correctOptionId points at
  // an element inside a JSONB array, not a database row. This refine() is the
  // application-layer substitute AGENTS.md calls for explicitly.
  .refine((d) => d.options.some((opt) => opt.id === d.correctOptionId), {
    message: "correctOptionId must match the id of one of the provided options",
    path: ["correctOptionId"],
  });

export const numericalDataSchema = z.object({
  expectedValue: z.number(),
  tolerance: z.number().nonnegative().optional(),
});

export const longAnswerDataSchema = z.object({
  solution: z.string().min(1),
});

export type MCQData = z.infer<typeof mcqDataSchema>;
export type NumericalData = z.infer<typeof numericalDataSchema>;
export type LongAnswerData = z.infer<typeof longAnswerDataSchema>;

// ─── Base question ────────────────────────────────────────────────────────────
// Mirrors the non-JSONB, non-audit columns of `public.questions` that every
// question type shares. JSONB columns (image_refs → imageRefs, type_data →
// typeData) are typed specifically in each branch below.

const baseQuestionSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable(),
  difficulty: difficultySchema,
  marks: z.number().int().positive(),
  text: z.string().min(1, "Question text cannot be empty"),
  imageRefs: z.array(z.string()), // Supabase Storage paths; [] if none

  // Audit / versioning columns (present on committed questions; optional
  // when constructing a new question before it is inserted).
  forkedFrom: z.string().uuid().nullable().optional(),
  createdBy: z.string().uuid().optional(),
  lastEditedBy: z.string().uuid().nullable().optional(),
  version: z.number().int().positive().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

// ─── Discriminated question union ─────────────────────────────────────────────
// Adding a new question type means adding one more branch here (and to the
// compile templates) — not a schema.sql migration (per AGENTS.md REQ-5.4).

export const mcqQuestionSchema = baseQuestionSchema.extend({
  type: z.literal("mcq"),
  typeData: mcqDataSchema,
});

export const numericalQuestionSchema = baseQuestionSchema.extend({
  type: z.literal("numerical"),
  typeData: numericalDataSchema,
});

export const longAnswerQuestionSchema = baseQuestionSchema.extend({
  type: z.literal("long_answer"),
  typeData: longAnswerDataSchema,
});

export const questionSchema = z.discriminatedUnion("type", [
  mcqQuestionSchema,
  numericalQuestionSchema,
  longAnswerQuestionSchema,
]);

export type MCQQuestion = z.infer<typeof mcqQuestionSchema>;
export type NumericalQuestion = z.infer<typeof numericalQuestionSchema>;
export type LongAnswerQuestion = z.infer<typeof longAnswerQuestionSchema>;
export type Question = z.infer<typeof questionSchema>;

// ─── Staging question ─────────────────────────────────────────────────────────
// Mirrors `public.staging_questions`. A staging draft is intentionally
// incomplete — most question fields are nullable/optional mid-review. A
// committed `questions` row may not have any nulls in those fields.

export const stagingQuestionSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  topicId: z.string().uuid().nullable().optional(),
  type: z.string().nullable().optional(),
  difficulty: difficultySchema.nullable().optional(),
  marks: z.number().int().positive().nullable().optional(),
  text: z.string().nullable().optional(),
  imageRefs: z.array(z.string()).optional(),
  // typeData is unvalidated at the staging layer; it's validated (via
  // questionSchema) only when the question is promoted to the bank.
  typeData: z.record(z.unknown()).optional(),
  source: stagingSourceSchema,
  confidenceScore: z.number().nullable().optional(),
  rawAiOutput: z.record(z.unknown()).nullable().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.string().datetime().optional(),
  lastEditedBy: z.string().uuid().nullable().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type StagingQuestion = z.infer<typeof stagingQuestionSchema>;

// ─── Profile ──────────────────────────────────────────────────────────────────
// Mirrors `public.profiles` (1-to-1 with auth.users).

export const profileSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(1),
  role: userRoleSchema,
  createdAt: z.string().datetime().optional(),
});

export type Profile = z.infer<typeof profileSchema>;

// ─── Subject & Topic ─────────────────────────────────────────────────────────

export const subjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
});

export type Subject = z.infer<typeof subjectSchema>;

export const topicSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  name: z.string().min(1),
});

export type Topic = z.infer<typeof topicSchema>;

// ─── Paper, section, and paper-question ──────────────────────────────────────

export const paperSchema = z.object({
  id: z.string().uuid(),
  subjectId: z.string().uuid(),
  title: z.string().min(1),
  createdBy: z.string().uuid(),
  totalMarks: z.number().int().positive().nullable().optional(),
  timeLimitMinutes: z.number().int().positive().nullable().optional(),
  instructions: z.string().nullable().optional(),
  layoutPreset: z.string().default("standard"),
  status: paperStatusSchema,
  compiledPdfRef: z.string().nullable().optional(),
  compiledSourceRef: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type Paper = z.infer<typeof paperSchema>;

export const paperSectionSchema = z.object({
  id: z.string().uuid(),
  paperId: z.string().uuid(),
  name: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  instructions: z.string().nullable().optional(),
});

export type PaperSection = z.infer<typeof paperSectionSchema>;

export const paperQuestionSchema = z.object({
  id: z.string().uuid(),
  paperId: z.string().uuid(),
  sectionId: z.string().uuid(),
  orderIndex: z.number().int().nonnegative(),
  marksUsed: z.number().int().positive(),
  // Nullable because the original bank question may have been deleted.
  sourceQuestionId: z.string().uuid().nullable().optional(),
  // Frozen snapshot — validated as a full Question so compile templates can
  // trust its shape. This is what makes old papers stable after bank edits.
  questionSnapshot: questionSchema,
  sourceVersion: z.number().int().nullable().optional(),
  snapshotCapturedAt: z.string().datetime().optional(),
});

export type PaperQuestion = z.infer<typeof paperQuestionSchema>;

// ─── Convenience parse helpers ────────────────────────────────────────────────
// Throw a ZodError with precise field-level messages on invalid input.
// Prefer these at every boundary (API route body, AI provider response,
// Supabase row after snake_case→camelCase conversion) over `as Question` casts.

export function parseQuestion(data: unknown): Question {
  return questionSchema.parse(data);
}

export function parseStagingQuestion(data: unknown): StagingQuestion {
  return stagingQuestionSchema.parse(data);
}

export function parsePaperQuestion(data: unknown): PaperQuestion {
  return paperQuestionSchema.parse(data);
}
