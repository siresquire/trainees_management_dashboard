"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestionBankState = {
  error?: string;
  errors?: Record<string, string[]>;
} | null;

export type QuestionState = {
  error?: string;
  errors?: Record<string, string[]>;
  success?: boolean;
} | null;

export type ShareState = {
  error?: string;
  success?: boolean;
} | null;

// ── Auth helper ────────────────────────────────────────────────────────────────

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return { supabase, user, profile };
}

function canCreateBank(role: string | undefined) {
  return role === "trainer" || role === "quiz_creator" || role === "super_admin";
}

// ── Question Bank CRUD ─────────────────────────────────────────────────────────

const BankSchema = z.object({
  name:        z.string().min(1, "Name is required").max(120),
  description: z.string().max(500).optional(),
  level:       z.enum(["practitioner", "associate", "devops"]).optional(),
  tags:        z.string().optional(),        // comma-separated raw string → string[]
  is_public:   z.boolean().optional(),
});

export async function createQuestionBank(
  _prev: QuestionBankState,
  formData: FormData
): Promise<QuestionBankState> {
  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let profile: Awaited<ReturnType<typeof getAuthUser>>["profile"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, profile, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  if (!canCreateBank(profile?.role)) return { error: "You do not have permission to create question banks" };

  const parsed = BankSchema.safeParse({
    name:        formData.get("name"),
    description: formData.get("description") || undefined,
    level:       formData.get("level") || undefined,
    tags:        formData.get("tags") || undefined,
    is_public:   formData.get("is_public") === "1",
  });

  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const d = parsed.data;
  const tags = d.tags
    ? d.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  const { data: bank, error } = await supabase
    .from("question_banks")
    .insert({
      name:        d.name,
      description: d.description ?? null,
      level:       d.level ?? null,
      tags:        tags.length ? tags : null,
      is_public:   d.is_public ?? false,
      created_by:  user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/trainer/question-banks/${bank.id}`);
}

export async function updateQuestionBank(
  bankId: string,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  const parsed = BankSchema.safeParse({
    name:        formData.get("name"),
    description: formData.get("description") || undefined,
    level:       formData.get("level") || undefined,
    tags:        formData.get("tags") || undefined,
    is_public:   formData.get("is_public") === "1",
  });

  if (!parsed.success) return { error: "Invalid form data" };

  const d = parsed.data;
  const tags = d.tags
    ? d.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  // Verify ownership or edit share
  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, created_by")
    .eq("id", bankId)
    .single();

  if (!bank) return { error: "Bank not found" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isOwner = bank.created_by === user.id || profile?.role === "super_admin";
  if (!isOwner) return { error: "Not authorised" };

  const svc = createServiceClient();
  const { error } = await svc
    .from("question_banks")
    .update({
      name:        d.name,
      description: d.description ?? null,
      level:       d.level ?? null,
      tags:        tags.length ? tags : null,
      is_public:   d.is_public ?? false,
      updated_at:  new Date().toISOString(),
    })
    .eq("id", bankId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/question-banks/${bankId}`);
  revalidatePath("/trainer/question-banks");
  return { success: true };
}

export async function deleteQuestionBank(
  bankId: string
): Promise<{ error?: string; success?: boolean }> {
  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, created_by")
    .eq("id", bankId)
    .single();

  if (!bank) return { error: "Bank not found" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isOwner = bank.created_by === user.id || profile?.role === "super_admin";
  if (!isOwner) return { error: "Only the creator can delete a question bank" };

  const svc = createServiceClient();
  const { error } = await svc.from("question_banks").delete().eq("id", bankId);
  if (error) return { error: error.message };

  revalidatePath("/trainer/question-banks");
  return { success: true };
}

// ── Question CRUD ──────────────────────────────────────────────────────────────

const QUESTION_TYPES = ["mcq", "multi_select", "true_false", "short_answer", "code_input"] as const;

const QuestionSchema = z.object({
  bank_id:       z.string().uuid(),
  question_text: z.string().min(1, "Question text is required"),
  question_type: z.enum(QUESTION_TYPES),
  option_a:      z.string().optional(),
  option_b:      z.string().optional(),
  option_c:      z.string().optional(),
  option_d:      z.string().optional(),
  option_e:      z.string().optional(),
  option_f:      z.string().optional(),
  correct_answers: z.array(z.string()).default([]),
  points:        z.coerce.number().positive().default(1),
  time_seconds:  z.coerce.number().int().positive().optional(),
  explanation:   z.string().optional(),
  display_order: z.coerce.number().int().default(0),
});

// Parse correct_answers from form: checkboxes post as multiple values, radio as one
function parseCorrectAnswers(formData: FormData): string[] {
  const all = formData.getAll("correct_answers") as string[];
  if (all.length) return all.filter(Boolean);
  const single = formData.get("correct_answer") as string;
  return single ? [single] : [];
}

export async function createQuestion(
  _prev: QuestionState,
  formData: FormData
): Promise<QuestionState> {
  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  const bankId = formData.get("bank_id") as string;

  // Check edit access
  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, created_by")
    .eq("id", bankId)
    .single();

  if (!bank) return { error: "Question bank not found" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isSuperAdmin = profile?.role === "super_admin";
  const isOwner      = bank.created_by === user.id;

  if (!isOwner && !isSuperAdmin) {
    // Check share with can_edit
    const { data: share } = await supabase
      .from("question_bank_shares")
      .select("can_edit")
      .eq("bank_id", bankId)
      .eq("shared_with", user.id)
      .maybeSingle();
    if (!share?.can_edit) return { error: "You do not have edit access to this bank" };
  }

  const qType = formData.get("question_type") as string;
  const needsOptions = qType === "mcq" || qType === "multi_select";

  const parsed = QuestionSchema.safeParse({
    bank_id:         bankId,
    question_text:   formData.get("question_text"),
    question_type:   qType,
    option_a:        needsOptions ? (formData.get("option_a") || undefined) : undefined,
    option_b:        needsOptions ? (formData.get("option_b") || undefined) : undefined,
    option_c:        needsOptions ? (formData.get("option_c") || undefined) : undefined,
    option_d:        needsOptions ? (formData.get("option_d") || undefined) : undefined,
    option_e:        needsOptions ? (formData.get("option_e") || undefined) : undefined,
    option_f:        needsOptions ? (formData.get("option_f") || undefined) : undefined,
    correct_answers: parseCorrectAnswers(formData),
    points:          formData.get("points") || 1,
    time_seconds:    formData.get("time_seconds") || undefined,
    explanation:     formData.get("explanation") || undefined,
    display_order:   formData.get("display_order") || 0,
  });

  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const d = parsed.data;

  // MCQ / multi-select / true-false require an answer key.
  // short_answer and code_input are graded manually — answer key is optional.
  const requiresKey = ["mcq", "multi_select", "true_false"].includes(d.question_type);
  if (requiresKey && d.correct_answers.length === 0) {
    return { errors: { correct_answers: ["At least one correct answer is required"] } };
  }

  const { error } = await supabase.from("questions").insert({
    bank_id:         d.bank_id,
    question_text:   d.question_text,
    question_type:   d.question_type,
    option_a:        d.option_a ?? null,
    option_b:        d.option_b ?? null,
    option_c:        d.option_c ?? null,
    option_d:        d.option_d ?? null,
    option_e:        d.option_e ?? null,
    option_f:        d.option_f ?? null,
    correct_answers: d.correct_answers,
    points:          d.points,
    time_seconds:    d.time_seconds ?? null,
    explanation:     d.explanation ?? null,
    display_order:   d.display_order,
  });

  if (error) return { error: error.message };

  revalidatePath(`/trainer/question-banks/${bankId}`);
  return { success: true };
}

export async function updateQuestion(
  questionId: string,
  formData: FormData
): Promise<QuestionState> {
  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  const bankId = formData.get("bank_id") as string;

  // Check edit access via bank
  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, created_by")
    .eq("id", bankId)
    .single();

  if (!bank) return { error: "Question bank not found" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isSuperAdmin = profile?.role === "super_admin";
  const isOwner      = bank.created_by === user.id;

  if (!isOwner && !isSuperAdmin) {
    const { data: share } = await supabase
      .from("question_bank_shares")
      .select("can_edit")
      .eq("bank_id", bankId)
      .eq("shared_with", user.id)
      .maybeSingle();
    if (!share?.can_edit) return { error: "You do not have edit access to this bank" };
  }

  const qType = formData.get("question_type") as string;
  const needsOptions = qType === "mcq" || qType === "multi_select";

  const parsed = QuestionSchema.safeParse({
    bank_id:         bankId,
    question_text:   formData.get("question_text"),
    question_type:   qType,
    option_a:        needsOptions ? (formData.get("option_a") || undefined) : undefined,
    option_b:        needsOptions ? (formData.get("option_b") || undefined) : undefined,
    option_c:        needsOptions ? (formData.get("option_c") || undefined) : undefined,
    option_d:        needsOptions ? (formData.get("option_d") || undefined) : undefined,
    option_e:        needsOptions ? (formData.get("option_e") || undefined) : undefined,
    option_f:        needsOptions ? (formData.get("option_f") || undefined) : undefined,
    correct_answers: parseCorrectAnswers(formData),
    points:          formData.get("points") || 1,
    time_seconds:    formData.get("time_seconds") || undefined,
    explanation:     formData.get("explanation") || undefined,
    display_order:   formData.get("display_order") || 0,
  });

  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };

  const d = parsed.data;

  const requiresKey = ["mcq", "multi_select", "true_false"].includes(d.question_type);
  if (requiresKey && d.correct_answers.length === 0) {
    return { errors: { correct_answers: ["At least one correct answer is required"] } };
  }

  const svc = createServiceClient();

  const { error } = await svc.from("questions").update({
    question_text:   d.question_text,
    question_type:   d.question_type,
    option_a:        d.option_a ?? null,
    option_b:        d.option_b ?? null,
    option_c:        d.option_c ?? null,
    option_d:        d.option_d ?? null,
    option_e:        d.option_e ?? null,
    option_f:        d.option_f ?? null,
    correct_answers: d.correct_answers,
    points:          d.points,
    time_seconds:    d.time_seconds ?? null,
    explanation:     d.explanation ?? null,
    display_order:   d.display_order,
    updated_at:      new Date().toISOString(),
  }).eq("id", questionId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/question-banks/${bankId}`);
  return { success: true };
}

export async function deleteQuestion(
  questionId: string,
  bankId: string
): Promise<{ error?: string; success?: boolean }> {
  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, created_by")
    .eq("id", bankId)
    .single();

  if (!bank) return { error: "Bank not found" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isSuperAdmin = profile?.role === "super_admin";
  const isOwner      = bank.created_by === user.id;

  if (!isOwner && !isSuperAdmin) {
    const { data: share } = await supabase
      .from("question_bank_shares")
      .select("can_edit")
      .eq("bank_id", bankId)
      .eq("shared_with", user.id)
      .maybeSingle();
    if (!share?.can_edit) return { error: "Not authorised" };
  }

  const svc = createServiceClient();
  const { error } = await svc.from("questions").delete().eq("id", questionId);
  if (error) return { error: error.message };

  revalidatePath(`/trainer/question-banks/${bankId}`);
  return { success: true };
}

// ── CSV question import ────────────────────────────────────────────────────────
// Expected columns (case-insensitive):
//   type, question, option_a, option_b, option_c, option_d, option_e, option_f,
//   correct_answers, points, explanation
// correct_answers: comma-separated list of letters, e.g. "A" or "A,C"
// For true_false: correct_answers = "true" or "false"

export type CsvImportState = {
  error?: string;
  inserted?: number;
  skipped?: number;
} | null;

export async function importQuestionsFromCsv(
  _prev: CsvImportState,
  formData: FormData
): Promise<CsvImportState> {
  const bankId = formData.get("bank_id") as string;
  const file   = formData.get("questions_file") as File | null;

  if (!bankId) return { error: "Missing bank ID" };
  if (!file || file.size === 0) return { error: "Please select a file" };
  if (file.size > 2_000_000) return { error: "File too large (max 2 MB)" };

  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  // Verify access
  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, created_by")
    .eq("id", bankId)
    .single();

  if (!bank) return { error: "Bank not found" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isSuperAdmin = profile?.role === "super_admin";
  const isOwner      = bank.created_by === user.id;

  if (!isOwner && !isSuperAdmin) {
    const { data: share } = await supabase
      .from("question_bank_shares")
      .select("can_edit")
      .eq("bank_id", bankId)
      .eq("shared_with", user.id)
      .maybeSingle();
    if (!share?.can_edit) return { error: "Not authorised" };
  }

  // Parse CSV or XLSX into a uniform array of row objects
  let rawRows: Record<string, string>[];
  try {
    const buffer   = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
      defval: "",
      raw:    false,
    });
  } catch {
    return { error: "Could not parse the file. Please use the provided template." };
  }

  if (rawRows.length < 1) {
    return { error: "File must have a header row and at least one data row" };
  }

  // Normalise keys to lowercase
  const normRows = rawRows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase().trim(), String(v)]))
  );

  const get = (row: Record<string, string>, key: string) => (row[key] ?? "").trim();

  if (!normRows[0]["type"] && !normRows[0]["question"]) {
    return { error: "File must contain columns: type, question, correct_answers" };
  }

  const typeMap: Record<string, string> = {
    mcq:          "mcq",
    multi_select: "multi_select",
    multiselect:  "multi_select",
    true_false:   "true_false",
    truefalse:    "true_false",
    short_answer: "short_answer",
    shortanswer:  "short_answer",
    code_input:   "code_input",
    codeinput:    "code_input",
    code:         "code_input",
    short:        "short_answer",
  };

  type QuestionInsert = {
    bank_id: string; question_text: string;
    question_type: "mcq" | "multi_select" | "true_false" | "short_answer" | "code_input";
    option_a: string | null; option_b: string | null; option_c: string | null;
    option_d: string | null; option_e: string | null; option_f: string | null;
    correct_answers: string[]; points: number; time_seconds: number | null;
    explanation: string | null; display_order: number;
  };
  const toInsert: QuestionInsert[] = [];
  let skipped = 0;

  for (let i = 0; i < normRows.length; i++) {
    const row     = normRows[i];
    const rawType = get(row, "type").toLowerCase().replace(/\s+/g, "_");
    const qType   = typeMap[rawType];
    const qText   = get(row, "question");

    if (!qType || !qText) { skipped++; continue; }

    const rawAnswers     = get(row, "correct_answers");
    const isManualGrade  = qType === "short_answer" || qType === "code_input";

    // For MCQ/multi-select: letters → uppercase. For true_false: TRUE/FALSE.
    // For short_answer/code_input: keep the text as-is (model answer, optional).
    const correctAnswers = isManualGrade
      ? (rawAnswers ? [rawAnswers] : [])
      : rawAnswers.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

    // Only MCQ / multi-select / true-false require an answer key.
    if (!isManualGrade && correctAnswers.length === 0) { skipped++; continue; }

    const pts      = parseFloat(get(row, "points")) || 1;
    const timeSecs = parseInt(get(row, "time_seconds"), 10) || null;

    toInsert.push({
      bank_id:         bankId,
      question_text:   qText,
      question_type:   qType as QuestionInsert["question_type"],
      option_a:        get(row, "option_a") || null,
      option_b:        get(row, "option_b") || null,
      option_c:        get(row, "option_c") || null,
      option_d:        get(row, "option_d") || null,
      option_e:        get(row, "option_e") || null,
      option_f:        get(row, "option_f") || null,
      correct_answers: correctAnswers,
      points:          pts,
      time_seconds:    timeSecs,
      explanation:     get(row, "explanation") || null,
      display_order:   i + 1,
    });
  }

  if (!toInsert.length) return { error: "No valid questions found in the file" };

  const { data: inserted, error } = await supabase
    .from("questions")
    .insert(toInsert)
    .select("id");

  if (error) return { error: error.message };

  revalidatePath(`/trainer/question-banks/${bankId}`);
  return { inserted: inserted?.length ?? 0, skipped };
}

// ── Sharing ───────────────────────────────────────────────────────────────────

export async function shareQuestionBank(
  _prev: ShareState,
  formData: FormData
): Promise<ShareState> {
  const bankId    = formData.get("bank_id") as string;
  const emailRaw  = (formData.get("email") as string)?.trim().toLowerCase();
  const canEdit   = formData.get("can_edit") === "1";

  if (!bankId || !emailRaw) return { error: "Missing bank or email" };

  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  // Verify caller owns the bank
  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, created_by")
    .eq("id", bankId)
    .single();

  if (!bank) return { error: "Bank not found" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isOwner = bank.created_by === user.id || profile?.role === "super_admin";
  if (!isOwner) return { error: "Only the bank creator can share it" };

  // Look up the user to share with by email (auth.users email)
  const svc = createServiceClient();
  const { data: authUsers } = await (svc.auth.admin as any).listUsers();
  const targetUser = (authUsers?.users ?? []).find(
    (u: { email?: string; id: string }) => u.email?.toLowerCase() === emailRaw
  );

  if (!targetUser) return { error: `No account found for ${emailRaw}` };
  if (targetUser.id === user.id) return { error: "You cannot share a bank with yourself" };

  // Check target user's role
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", targetUser.id)
    .single();

  if (!targetProfile || !["trainer", "quiz_creator", "super_admin"].includes(targetProfile.role)) {
    return { error: "That user is not a trainer or quiz creator" };
  }

  const { error } = await svc
    .from("question_bank_shares")
    .upsert(
      { bank_id: bankId, shared_with: targetUser.id, shared_by: user.id, can_edit: canEdit },
      { onConflict: "bank_id,shared_with" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/trainer/question-banks/${bankId}`);
  return { success: true };
}

export async function revokeShare(
  bankId: string,
  sharedWithId: string
): Promise<{ error?: string; success?: boolean }> {
  let user: Awaited<ReturnType<typeof getAuthUser>>["user"];
  let supabase: Awaited<ReturnType<typeof getAuthUser>>["supabase"];

  try {
    ({ user, supabase } = await getAuthUser());
  } catch {
    return { error: "Not authenticated" };
  }

  const { data: bank } = await supabase
    .from("question_banks")
    .select("created_by")
    .eq("id", bankId)
    .single();

  if (!bank) return { error: "Bank not found" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isOwner = bank.created_by === user.id || profile?.role === "super_admin";
  if (!isOwner) return { error: "Not authorised" };

  const svc = createServiceClient();
  const { error } = await svc
    .from("question_bank_shares")
    .delete()
    .eq("bank_id", bankId)
    .eq("shared_with", sharedWithId);

  if (error) return { error: error.message };

  revalidatePath(`/trainer/question-banks/${bankId}`);
  return { success: true };
}
