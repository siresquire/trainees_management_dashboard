"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import type { ModelBundle } from "@/lib/regression";
import {
  createExamQuiz,
  deleteExamQuiz,
  uploadExamScoresFromFile,
  uploadScoresAutoCreate,
  importScoresFromUrl,
  uploadVoucherPool,
  issueVoucher,
  revokeVoucher,
  saveOfficialScore,
  deleteOfficialScore,
  toggleReadiness,
  updateOfficialScore,
} from "@/actions/exams";

// ── Types ─────────────────────────────────────────────────────────────────────

type TraineeFeatureStat = {
  traineeId:  string;
  labRatePct: number | null;
  kcRatePct:  number | null;
};

type Trainee = {
  id: string;
  serial_no: number | null;
  full_name: string;
  personal_email: string;
  amalitech_email: string | null;
  show_readiness: boolean;
};

type Quiz = {
  id: string;
  quiz_name: string;
  focus_type: string;
  focus_label: string | null;
  week_number: number;
  quiz_date: string | null;
  max_score: number;
  created_at: string;
};

type Score = {
  id: string;
  quiz_id: string;
  trainee_id: string;
  score: number;
  attempt_no: number;
  uploaded_at: string;
};

type Voucher = {
  id: string;
  trainee_id: string;
  exam_type: string;
  issued_date: string;
  attempt_no: number;
  voucher_code: string | null;
};

type PooledVoucher = {
  id: string;
  trainee_id: string | null;
  voucher_code: string;
};

type Outcome = {
  id: string;
  trainee_id: string;
  exam_type: string;
  actual_score: number | null;
  outcome: string;
  exam_date: string | null;
  attempt_no: number;
  notes: string | null;
  self_reported: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const EXAM_TYPES = ["CCP", "SAA-C03", "DVA-C02", "SAP-C02", "DOP-C02"] as const;

// Minimum passing score (out of 1000) per exam type
const PASS_THRESHOLD: Record<string, number> = {
  "CCP":     700,
  "SAA-C03": 720,
  "DVA-C02": 720,
  "SAP-C02": 750,
  "DOP-C02": 750,
};

// Default exam type per cohort level
const LEVEL_TO_EXAM: Record<string, string> = {
  practitioner: "CCP",
  associate:    "SAA-C03",
  professional: "SAP-C02",
};

const FOCUS_DISPLAY: Record<string, string> = {
  practitioner: "Practitioner",
  associate:    "Associate",
  professional: "Professional",
  other:        "Other",
};

const FOCUS_BADGE: Record<string, string> = {
  practitioner: "bg-blue-100 text-blue-700",
  associate:    "bg-purple-100 text-purple-700",
  professional: "bg-orange-100 text-orange-700",
  other:        "bg-slate-100 text-slate-600",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function eligibility(avgPct: number | null) {
  if (avgPct === null) return { label: "No data",   color: "text-slate-400" };
  if (avgPct >= 80)    return { label: "Ready",      color: "text-green-600" };
  if (avgPct >= 60)    return { label: "Borderline", color: "text-amber-600" };
  return                      { label: "Not yet",    color: "text-red-600"   };
}

function scoreTextColor(pct: number) {
  if (pct >= 80) return "text-green-600 font-semibold";
  if (pct >= 60) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
}

/** Heuristic fallback — used when no regression model is available */
function heuristicPrediction(avgPct: number | null, thresholdPct: number) {
  if (avgPct === null)
    return { label: "No data",    detail: "No quiz scores available",                              color: "text-slate-400",  bar: 0,  source: "heuristic" as const };
  const gap = avgPct - thresholdPct;
  if (gap >= 15)
    return { label: "Very likely", detail: `${avgPct.toFixed(1)}% avg — ${gap.toFixed(1)}pp above threshold`, color: "text-green-600",   bar: 90, source: "heuristic" as const };
  if (gap >= 5)
    return { label: "Likely",      detail: `${avgPct.toFixed(1)}% avg — ${gap.toFixed(1)}pp above threshold`, color: "text-emerald-600", bar: 70, source: "heuristic" as const };
  if (gap >= -5)
    return { label: "Borderline",  detail: `${avgPct.toFixed(1)}% avg — within 5pp of threshold`,             color: "text-amber-600",  bar: 50, source: "heuristic" as const };
  if (gap >= -15)
    return { label: "At risk",     detail: `${avgPct.toFixed(1)}% avg — ${Math.abs(gap).toFixed(1)}pp below threshold`, color: "text-orange-600", bar: 30, source: "heuristic" as const };
  return   { label: "Unlikely",   detail: `${avgPct.toFixed(1)}% avg — ${Math.abs(gap).toFixed(1)}pp below threshold`, color: "text-red-600",    bar: 12, source: "heuristic" as const };
}

/** Regression-based prediction — preferred when model is available */
function regressionPrediction(
  bundle: ModelBundle,
  quizAvgPct: number | null,
  labRatePct: number | null,
  kcRatePct:  number | null,
  thresholdPct: number,
) {
  if (!bundle || (!bundle.linear && !bundle.logistic)) {
    return heuristicPrediction(quizAvgPct, thresholdPct);
  }
  if (quizAvgPct === null) {
    return { label: "No data", detail: "No quiz scores available", color: "text-slate-400", bar: 0, source: "heuristic" as const };
  }

  // Impute missing lab/KC rates with the quiz average as a neutral proxy
  const feats = {
    quizAvgPct,
    labRatePct: labRatePct ?? quizAvgPct,
    kcRatePct:  kcRatePct  ?? quizAvgPct,
  };
  const x = [1, feats.quizAvgPct / 100, feats.labRatePct / 100, feats.kcRatePct / 100];

  // ── Prefer logistic (direct P(pass)) ───────────────────────────────────────
  if (bundle.logistic) {
    const z    = x.reduce((s, v, i) => s + v * bundle.logistic!.coefficients[i], 0);
    const prob = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
    const pct  = Math.round(prob * 100);
    const acc  = Math.round(bundle.logistic.accuracy * 100);
    const detail = `${pct}% pass probability · logistic model (${bundle.trainingSize} trainees, ${acc}% train accuracy)`;

    if (prob >= 0.80) return { label: "Very likely", detail, color: "text-green-600",   bar: pct, source: "logistic" as const };
    if (prob >= 0.65) return { label: "Likely",       detail, color: "text-emerald-600", bar: pct, source: "logistic" as const };
    if (prob >= 0.40) return { label: "Borderline",   detail, color: "text-amber-600",   bar: pct, source: "logistic" as const };
    if (prob >= 0.20) return { label: "At risk",      detail, color: "text-orange-600",  bar: pct, source: "logistic" as const };
    return               { label: "Unlikely",         detail, color: "text-red-600",     bar: pct, source: "logistic" as const };
  }

  // ── Linear fallback: predict score then threshold ──────────────────────────
  const predicted = Math.max(100, Math.min(1000, x.reduce((s, v, i) => s + v * bundle.linear!.coefficients[i], 0)));
  const threshold = thresholdPct * 10; // e.g. 70% → 700
  const gap       = predicted - threshold;
  const r2        = bundle.linear!.rSquared;
  const detail    = `Predicted score: ${Math.round(predicted)} · linear model (N=${bundle.trainingSize}, R²=${r2.toFixed(2)})`;
  const bar       = Math.round(Math.min(95, Math.max(5, (predicted / 1000) * 100)));

  if (gap >= 80)   return { label: "Very likely", detail, color: "text-green-600",   bar, source: "linear" as const };
  if (gap >= 25)   return { label: "Likely",       detail, color: "text-emerald-600", bar, source: "linear" as const };
  if (gap >= -25)  return { label: "Borderline",   detail, color: "text-amber-600",   bar, source: "linear" as const };
  if (gap >= -80)  return { label: "At risk",      detail, color: "text-orange-600",  bar, source: "linear" as const };
  return             { label: "Unlikely",          detail, color: "text-red-600",     bar, source: "linear" as const };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExamsClient({
  cohortId,
  cohortLevel,
  cohortExamType,
  trainees,
  quizzes,
  scores,
  vouchers,
  pooledVouchers,
  outcomes,
  modelBundle,
  traineeFeatures,
}: {
  cohortId:        string;
  cohortLevel:     string;
  cohortExamType:  string | null;
  trainees:        Trainee[];
  quizzes:         Quiz[];
  scores:          Score[];
  vouchers:        Voucher[];
  pooledVouchers:  PooledVoucher[];
  outcomes:        Outcome[];
  modelBundle:     ModelBundle;
  traineeFeatures: TraineeFeatureStat[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<"quizzes" | "official" | "analytics">("quizzes");

  // Resolved exam type for this cohort (for analytics threshold)
  const resolvedExamType = cohortExamType ?? LEVEL_TO_EXAM[cohortLevel] ?? "CCP";
  const thresholdPct = ((PASS_THRESHOLD[resolvedExamType] ?? 700) / 1000) * 100;

  // ── Pre-computed maps ────────────────────────────────────────────────────────

  // Best score per trainee per quiz (highest attempt)
  const bestScoreMap = new Map<string, number>(); // `${traineeId}:${quizId}` → best score
  for (const s of scores) {
    const key  = `${s.trainee_id}:${s.quiz_id}`;
    const prev = bestScoreMap.get(key);
    if (prev === undefined || s.score > prev) bestScoreMap.set(key, s.score);
  }

  // Vouchers grouped by trainee
  const voucherMap = new Map<string, Voucher[]>();
  for (const v of vouchers) {
    const arr = voucherMap.get(v.trainee_id) ?? [];
    arr.push(v);
    voucherMap.set(v.trainee_id, arr);
  }

  // Outcomes grouped by trainee
  const outcomeMap = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    const arr = outcomeMap.get(o.trainee_id) ?? [];
    arr.push(o);
    outcomeMap.set(o.trainee_id, arr);
  }

  // Pooled (unissued) voucher code per trainee
  const pooledMap = new Map<string, { id: string; voucher_code: string }>();
  for (const p of pooledVouchers) {
    if (p.trainee_id && !pooledMap.has(p.trainee_id)) {
      pooledMap.set(p.trainee_id, { id: p.id, voucher_code: p.voucher_code });
    }
  }

  // Trainee completion features (for regression prediction)
  const featuresMap = new Map<string, { labRatePct: number | null; kcRatePct: number | null }>(
    traineeFeatures.map((f) => [f.traineeId, { labRatePct: f.labRatePct, kcRatePct: f.kcRatePct }])
  );

  // ── Quiz Scores tab state ────────────────────────────────────────────────────
  const [showManageQuizzes, setShowManageQuizzes] = useState(false);
  const [showCreateQuiz,    setShowCreateQuiz]    = useState(false);
  const [createError,       setCreateError]       = useState("");
  const [uploadingFor,      setUploadingFor]       = useState<string | null>(null);
  const [uploadError,       setUploadError]        = useState("");
  const [uploadResult,      setUploadResult]       = useState("");
  // Upload panel
  const [showUpload,       setShowUpload]       = useState(false);
  const [uploadAutoError,  setUploadAutoError]  = useState("");
  const [uploadAutoResult, setUploadAutoResult] = useState("");
  // URL import panel
  const [showUrlImport,   setShowUrlImport]   = useState(false);
  const [urlInput,        setUrlInput]        = useState("");
  const [urlMode,         setUrlMode]         = useState<"formatted" | "raw">("formatted");
  const [rawEmailCol,     setRawEmailCol]     = useState("A");
  const [rawScoreCol,     setRawScoreCol]     = useState("");
  const [rawQuizName,     setRawQuizName]     = useState("");
  const [rawMaxScore,     setRawMaxScore]     = useState("100");
  const [rawStartRow,     setRawStartRow]     = useState("2");
  const [urlImportError,  setUrlImportError]  = useState("");
  const [urlImportResult, setUrlImportResult] = useState("");

  function handleCreateQuiz(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setCreateError("");
    startTransition(async () => {
      const res = await createExamQuiz(cohortId, fd);
      if (res.error) { setCreateError(res.error); toast(res.error, "error"); return; }
      toast("Quiz created");
      setShowCreateQuiz(false);
      router.refresh();
    });
  }

  function handleDeleteQuiz(quizId: string) {
    if (!confirm("Delete this quiz and all its scores? This cannot be undone.")) return;
    startTransition(async () => {
      await deleteExamQuiz(quizId, cohortId);
      toast("Quiz deleted");
      router.refresh();
    });
  }

  function handleUploadFile(quizId: string, file: File) {
    setUploadError("");
    setUploadResult("");
    const fd = new FormData();
    fd.append("scores_file", file);
    startTransition(async () => {
      const res = await uploadExamScoresFromFile(quizId, cohortId, fd);
      if ("error" in res) { setUploadError(res.error ?? ""); toast(res.error ?? "Upload failed", "error"); return; }
      const msg = `Imported ${res.imported ?? 0} score${(res.imported ?? 0) !== 1 ? "s" : ""}` +
        (res.skipped ? ` · ${res.skipped} not matched` : "") + ".";
      setUploadResult(msg);
      toast(msg);
      setUploadingFor(null);
      router.refresh();
    });
  }

  function handleAutoUploadFile(file: File) {
    setUploadAutoError("");
    setUploadAutoResult("");
    const fd = new FormData();
    fd.append("scores_file", file);
    startTransition(async () => {
      const res = await uploadScoresAutoCreate(cohortId, fd);
      if ("error" in res) { setUploadAutoError(res.error); toast(res.error, "error"); return; }
      const msg =
        `Imported ${res.imported} score${res.imported !== 1 ? "s" : ""}` +
        (res.quizzesCreated ? ` · ${res.quizzesCreated} quiz${res.quizzesCreated !== 1 ? "zes" : ""} created` : "") +
        (res.skipped        ? ` · ${res.skipped} not matched` : "");
      setUploadAutoResult(msg + (res.warnings.length ? `\nWarnings:\n${res.warnings.join("\n")}` : ""));
      toast(msg);
      setShowUpload(false);
      router.refresh();
    });
  }

  function handleUrlImport() {
    setUrlImportError("");
    setUrlImportResult("");
    const fd = new FormData();
    fd.append("url",      urlInput);
    fd.append("mode",     urlMode);
    fd.append("emailCol", rawEmailCol);
    fd.append("scoreCol", rawScoreCol);
    fd.append("quizName", rawQuizName);
    fd.append("maxScore", rawMaxScore);
    fd.append("startRow", rawStartRow);
    startTransition(async () => {
      const res = await importScoresFromUrl(cohortId, fd);
      if ("error" in res) { setUrlImportError(res.error); toast(res.error, "error"); return; }
      const msg =
        `Imported ${res.imported} score${res.imported !== 1 ? "s" : ""}` +
        ("quizzesCreated" in res && res.quizzesCreated ? ` · ${res.quizzesCreated} quiz${res.quizzesCreated !== 1 ? "zes" : ""} created` : "") +
        (res.skipped ? ` · ${res.skipped} not matched` : "");
      setUrlImportResult(msg + (res.warnings.length ? `\nWarnings:\n${res.warnings.join("\n")}` : ""));
      toast(msg);
      router.refresh();
    });
  }

  function downloadTemplate() {
    const params = new URLSearchParams();
    for (const q of quizzes) params.append("quiz", `${q.quiz_name}||${q.max_score}`);
    window.location.href = `/api/templates/exam-scores${quizzes.length ? `?${params}` : ""}`;
  }

  // ── Official Exams tab state ─────────────────────────────────────────────────
  const [issuingFor,       setIssuingFor]       = useState<string | null>(null);
  const [addScoreFor,      setAddScoreFor]      = useState<string | null>(null);
  const [editingOutcome,   setEditingOutcome]   = useState<string | null>(null); // outcomeId
  const [voucherExamType,  setVoucherExamType]  = useState<string>(EXAM_TYPES[0]);
  const [voucherCodeInput, setVoucherCodeInput] = useState("");
  const [officialError,    setOfficialError]    = useState("");

  // Voucher pool upload state
  const [showVoucherUpload,  setShowVoucherUpload]  = useState(false);
  const [voucherUploadError, setVoucherUploadError] = useState("");
  const [voucherUploadMsg,   setVoucherUploadMsg]   = useState("");

  function handleOpenIssue(traineeId: string) {
    if (issuingFor === traineeId) {
      setIssuingFor(null);
      setVoucherCodeInput("");
    } else {
      const pooled = pooledMap.get(traineeId);
      setVoucherCodeInput(pooled?.voucher_code ?? "");
      setIssuingFor(traineeId);
    }
    setAddScoreFor(null);
    setEditingOutcome(null);
    setOfficialError("");
  }

  function handleIssueVoucher(traineeId: string) {
    if (!voucherCodeInput.trim()) {
      setOfficialError("Voucher code is required.");
      return;
    }
    const pooled = pooledMap.get(traineeId);
    startTransition(async () => {
      const res = await issueVoucher(
        traineeId, cohortId, voucherExamType,
        voucherCodeInput.trim(), pooled?.id ?? null,
      );
      if (res.error) { setOfficialError(res.error); toast(res.error, "error"); return; }
      toast("Voucher issued");
      setIssuingFor(null);
      setVoucherCodeInput("");
      router.refresh();
    });
  }

  function handleUploadVouchers(file: File) {
    setVoucherUploadError("");
    setVoucherUploadMsg("");
    const fd = new FormData();
    fd.append("voucher_file", file);
    startTransition(async () => {
      const res = await uploadVoucherPool(cohortId, fd);
      if (res.error) { setVoucherUploadError(res.error); toast(res.error, "error"); return; }
      const msg = `Uploaded ${res.imported} code${(res.imported ?? 0) !== 1 ? "s" : ""}` +
        ` · ${res.matched} matched to trainees` +
        (res.unmatched ? ` · ${res.unmatched} unmatched` : "");
      setVoucherUploadMsg(msg);
      toast(msg);
      setShowVoucherUpload(false);
      router.refresh();
    });
  }

  function handleRevokeVoucher(voucherId: string) {
    if (!confirm("Revoke this voucher?")) return;
    startTransition(async () => {
      await revokeVoucher(voucherId, cohortId);
      toast("Voucher revoked");
      router.refresh();
    });
  }

  function handleSaveScore(traineeId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setOfficialError("");
    startTransition(async () => {
      const res = await saveOfficialScore(traineeId, cohortId, fd);
      if (res.error) { setOfficialError(res.error); toast(res.error, "error"); return; }
      toast("Score saved");
      setAddScoreFor(null);
      router.refresh();
    });
  }

  function handleUpdateScore(outcomeId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setOfficialError("");
    startTransition(async () => {
      const res = await updateOfficialScore(outcomeId, cohortId, fd);
      if (res.error) { setOfficialError(res.error); toast(res.error, "error"); return; }
      toast("Score updated");
      setEditingOutcome(null);
      router.refresh();
    });
  }

  function handleDeleteScore(outcomeId: string) {
    if (!confirm("Delete this exam record?")) return;
    startTransition(async () => {
      await deleteOfficialScore(outcomeId, cohortId);
      toast("Record deleted");
      router.refresh();
    });
  }

  function handleToggleReadiness(traineeId: string, current: boolean) {
    startTransition(async () => {
      const res = await toggleReadiness(traineeId, cohortId, !current);
      if (res.error) { toast(res.error, "error"); return; }
      toast(!current ? "Readiness visible to trainee" : "Readiness hidden from trainee");
      router.refresh();
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl space-y-6">

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {([
          { key: "quizzes"   as const, label: "Quiz Scores"    },
          { key: "official"  as const, label: "Official Exams" },
          { key: "analytics" as const, label: "Analytics"      },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-white shadow-sm text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══ QUIZ SCORES TAB ════════════════════════════════════════════════════ */}
      {activeTab === "quizzes" && (
        <div className="space-y-5">

          {/* ── Toolbar ────────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-sm font-medium rounded-lg text-slate-700 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download Template
            </button>
            <button
              onClick={() => { setShowUpload((v) => !v); setShowUrlImport(false); setUploadAutoError(""); setUploadAutoResult(""); }}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                showUpload ? "bg-orange-500 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Upload Scores
            </button>
            <button
              onClick={() => { setShowUrlImport((v) => !v); setShowUpload(false); setUrlImportError(""); setUrlImportResult(""); }}
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-200 hover:bg-slate-50 text-sm font-medium rounded-lg text-slate-700 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
              </svg>
              Import from URL
            </button>
            <button
              onClick={() => setShowManageQuizzes((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
            >
              Manage quizzes {showManageQuizzes ? "▴" : "▾"}
            </button>
          </div>

          {/* ── Upload Scores panel ─────────────────────────────────────────────── */}
          {showUpload && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Upload Score File</h3>
              <p className="text-xs text-slate-500 mb-3">
                Use the{" "}
                <button onClick={downloadTemplate} className="text-orange-600 hover:underline font-medium">downloaded template</button>
                {" "}or any .xlsx/.csv where:
              </p>
              <ul className="text-xs text-slate-500 list-disc pl-4 mb-3 space-y-0.5">
                <li><strong>Row 1</strong> — column headers: <code className="bg-slate-100 px-1 rounded">email</code> in column A, quiz names in the remaining columns (you choose the names).</li>
                <li><strong>Row 2</strong> — maximum scores: blank for the email column, the max possible score for each quiz column.</li>
                <li><strong>Row 3+</strong> — one row per trainee. Leave a cell blank (not zero) if they did not take a quiz.</li>
              </ul>
              <p className="text-xs text-slate-400 mb-3">Quizzes are created automatically from the column headers. Uploading again with the same quiz name adds scores without creating a duplicate.</p>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={isPending}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAutoUploadFile(f); }}
                className="block text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
              {uploadAutoError  && <p className="text-xs text-red-600 mt-2">{uploadAutoError}</p>}
              {uploadAutoResult && <pre className="text-xs text-green-700 mt-2 whitespace-pre-wrap">{uploadAutoResult}</pre>}
              {isPending && <p className="text-xs text-slate-400 mt-2">Processing…</p>}
            </div>
          )}

          {/* ── Import from URL panel ───────────────────────────────────────────── */}
          {showUrlImport && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Import from URL</h3>
                <p className="text-xs text-slate-500">
                  Paste a Google Sheets link or a direct .csv / .xlsx URL. Google Sheets must have <strong>Anyone with the link can view</strong> sharing enabled.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sheet URL *</label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/… or direct file URL"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                />
              </div>

              {/* Mode toggle */}
              <div>
                <p className="text-xs font-medium text-slate-600 mb-2">Sheet format</p>
                <div className="flex gap-2">
                  {(["formatted", "raw"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setUrlMode(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        urlMode === m ? "bg-orange-500 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {m === "formatted" ? "Our template format" : "Any sheet (specify columns)"}
                    </button>
                  ))}
                </div>
              </div>

              {urlMode === "formatted" && (
                <p className="text-xs text-slate-500">
                  The sheet must follow the same layout as the downloaded template: Row 1 = column headers (email + quiz names), Row 2 = max scores, Row 3+ = data. Quizzes are created automatically.
                </p>
              )}

              {urlMode === "raw" && (
                <div className="space-y-3 border border-slate-100 rounded-xl p-4 bg-slate-50">
                  <p className="text-xs text-slate-500">
                    For Google Forms or any sheet with your own column layout. Specify which columns have the email and scores using the column letter (A, B, C…).
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Email column *</label>
                      <input
                        type="text"
                        value={rawEmailCol}
                        onChange={(e) => setRawEmailCol(e.target.value.toUpperCase())}
                        placeholder="e.g. B"
                        maxLength={3}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Score column *</label>
                      <input
                        type="text"
                        value={rawScoreCol}
                        onChange={(e) => setRawScoreCol(e.target.value.toUpperCase())}
                        placeholder="e.g. D"
                        maxLength={3}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Data starts at row</label>
                      <input
                        type="number"
                        value={rawStartRow}
                        onChange={(e) => setRawStartRow(e.target.value)}
                        min="1"
                        placeholder="2"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">Row 1 = header, data from row 2</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Quiz name *</label>
                      <input
                        type="text"
                        value={rawQuizName}
                        onChange={(e) => setRawQuizName(e.target.value)}
                        placeholder="e.g. Week 3 Quiz"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Max score</label>
                      <input
                        type="number"
                        value={rawMaxScore}
                        onChange={(e) => setRawMaxScore(e.target.value)}
                        min="1"
                        placeholder="100"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleUrlImport}
                  disabled={isPending || !urlInput.trim()}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isPending ? "Importing…" : "Import"}
                </button>
                {urlImportError  && <p className="text-xs text-red-600">{urlImportError}</p>}
                {urlImportResult && <pre className="text-xs text-green-700 whitespace-pre-wrap">{urlImportResult}</pre>}
              </div>
            </div>
          )}

          {/* ── Manage Quizzes panel ────────────────────────────────────────────── */}
          {showManageQuizzes && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Manage Quizzes</h3>
                <button
                  onClick={() => { setShowCreateQuiz((v) => !v); setCreateError(""); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Add Quiz Manually
                </button>
              </div>

              {showCreateQuiz && (
                <form onSubmit={handleCreateQuiz} className="space-y-3 border border-slate-100 rounded-xl p-4 bg-slate-50">
                  <h4 className="text-xs font-semibold text-slate-700">New Quiz</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Quiz Name *</label>
                      <input name="name" required placeholder="e.g. Week 3 Practice Test" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Focus *</label>
                      <FocusSelect />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Week Number</label>
                      <input name="weekNumber" type="number" min="0" max="52" defaultValue="1" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                      <input name="quizDate" type="date" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Max Score</label>
                      <input name="maxScore" type="number" min="1" defaultValue="100" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white" />
                    </div>
                  </div>
                  {createError && <p className="text-xs text-red-600">{createError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" disabled={isPending} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
                      {isPending ? "Creating…" : "Create"}
                    </button>
                    <button type="button" onClick={() => { setShowCreateQuiz(false); setCreateError(""); }} className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg transition-colors">Cancel</button>
                  </div>
                </form>
              )}

              {quizzes.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {quizzes.map((q) => {
                    const scoredCount = new Set(scores.filter((s) => s.quiz_id === q.id).map((s) => s.trainee_id)).size;
                    const displayFocus = q.focus_type === "other" && q.focus_label ? q.focus_label : FOCUS_DISPLAY[q.focus_type] ?? q.focus_type;
                    return (
                      <div key={q.id} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 min-w-[220px] max-w-[300px]">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{q.quiz_name}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${FOCUS_BADGE[q.focus_type] ?? "bg-slate-100 text-slate-600"}`}>{displayFocus}</span>
                            {q.week_number > 0 && <span className="text-[10px] text-slate-400">Wk {q.week_number}</span>}
                            {q.quiz_date && <span className="text-[10px] text-slate-400">· {fmtShortDate(q.quiz_date)}</span>}
                            <span className="text-[10px] text-slate-400">· {scoredCount}/{trainees.length} scored</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => setUploadingFor((v) => v === q.id ? null : q.id)} className="text-xs text-orange-600 hover:text-orange-700 font-medium" title="Upload scores for this quiz">↑</button>
                          <button onClick={() => handleDeleteQuiz(q.id)} disabled={isPending} className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40" title="Delete quiz">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No quizzes yet. Upload a score file — quizzes are created automatically from the column headers.</p>
              )}

              {/* Per-quiz upload inline */}
              {uploadingFor && (
                <div className="border border-slate-200 rounded-xl p-4 bg-white">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Upload scores for: {quizzes.find((q) => q.id === uploadingFor)?.quiz_name}</p>
                  <p className="text-xs text-slate-500 mb-2">Single-quiz file: columns <code className="bg-slate-100 px-1 rounded">email</code> and <code className="bg-slate-100 px-1 rounded">score</code> required.</p>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    disabled={isPending}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(uploadingFor, f); }}
                    className="block text-sm text-slate-600 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
                  />
                  {uploadError  && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                  {uploadResult && <p className="text-xs text-green-600 mt-1">{uploadResult}</p>}
                  <button onClick={() => { setUploadingFor(null); setUploadError(""); setUploadResult(""); }} className="mt-2 text-xs text-slate-400 hover:text-slate-600">Close</button>
                </div>
              )}
            </div>
          )}

          {/* ── Score Matrix — always visible ───────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Score Matrix</h3>
              <span className="text-xs text-slate-400">
                Best attempt shown · Pct relative to max score · ↑↓ trend vs previous quiz
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-8">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Name</th>
                    {quizzes.map((q) => (
                      <th key={q.id} className="text-center px-3 py-3 text-xs font-medium text-slate-500 min-w-[90px]">
                        <div className="truncate max-w-[110px] mx-auto" title={q.quiz_name}>{q.quiz_name}</div>
                        <div className="text-[10px] text-slate-400 font-normal">/{q.max_score}</div>
                      </th>
                    ))}
                    {quizzes.length > 0 && (
                      <>
                        <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 w-20">Avg %</th>
                        <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 w-16">Min</th>
                        <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 w-16">Max</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-28">Eligibility</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trainees.length === 0 ? (
                    <tr>
                      <td colSpan={4 + quizzes.length} className="px-4 py-12 text-center text-sm text-slate-400">
                        No trainees in this cohort yet.
                      </td>
                    </tr>
                  ) : quizzes.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-12 text-center text-sm text-slate-400">
                        No quiz scores yet — upload a score file or import from a URL to get started.
                      </td>
                    </tr>
                  ) : (
                    trainees.map((t) => {
                      const quizData = quizzes.map((q, qi) => {
                        const best = bestScoreMap.get(`${t.id}:${q.id}`);
                        const pct  = best !== undefined ? (best / q.max_score) * 100 : null;
                        let trend: "up" | "down" | "flat" | null = null;
                        if (pct !== null && qi > 0) {
                          const prevScored = quizzes.slice(0, qi)
                            .map((pq) => { const pb = bestScoreMap.get(`${t.id}:${pq.id}`); return pb !== undefined ? (pb / pq.max_score) * 100 : null; })
                            .filter((v): v is number => v !== null);
                          if (prevScored.length > 0) {
                            const p = prevScored[prevScored.length - 1];
                            trend = pct > p + 0.5 ? "up" : pct < p - 0.5 ? "down" : "flat";
                          }
                        }
                        return { q, best, pct, trend };
                      });

                      const pcts   = quizData.filter((d) => d.pct !== null).map((d) => d.pct as number);
                      const avg    = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
                      const minPct = pcts.length ? Math.round(Math.min(...pcts)) : null;
                      const maxPct = pcts.length ? Math.round(Math.max(...pcts)) : null;
                      const elig   = eligibility(avg);

                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-xs text-slate-400">{t.serial_no ?? "—"}</td>
                          <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{t.full_name}</td>
                          {quizData.map(({ q, best, pct, trend }) => (
                            <td key={q.id} className="px-3 py-3 text-center tabular-nums">
                              {pct !== null ? (
                                <span className="inline-flex items-center justify-center gap-0.5">
                                  <span className={`text-sm ${scoreTextColor(pct)}`}>{best}</span>
                                  {trend === "up"   && <span className="text-[11px] text-green-500 font-bold leading-none">↑</span>}
                                  {trend === "down" && <span className="text-[11px] text-red-500 font-bold leading-none">↓</span>}
                                  {trend === "flat" && <span className="text-[11px] text-slate-400 leading-none">→</span>}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">—</span>
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-3 text-center tabular-nums">
                            {avg !== null ? <span className={`text-sm font-medium ${elig.color}`}>{avg}%</span> : <span className="text-xs text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums text-xs text-slate-500">
                            {minPct !== null ? `${minPct}%` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-center tabular-nums text-xs text-slate-500">
                            {maxPct !== null ? `${maxPct}%` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium ${elig.color}`}>{elig.label}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ OFFICIAL EXAMS TAB ════════════════════════════════════════════════ */}
      {activeTab === "official" && (
        <div className="space-y-4">
          {officialError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {officialError}
            </div>
          )}

          {/* Voucher pool upload card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Voucher Code Pool</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload codes in bulk — they&apos;ll be pre-filled when you issue to each trainee.
                  {pooledVouchers.length > 0 && (
                    <span className="ml-1.5 text-emerald-600 font-medium">
                      {pooledVouchers.length} unissued code{pooledVouchers.length !== 1 ? "s" : ""} loaded.
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => window.location.href = "/api/templates/vouchers"}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-xs font-medium rounded-lg text-slate-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Download Template
                </button>
                <button
                  onClick={() => { setShowVoucherUpload((v) => !v); setVoucherUploadError(""); setVoucherUploadMsg(""); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  Upload Voucher Codes
                </button>
              </div>
            </div>

            {showVoucherUpload && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">
                  Upload the filled template (.xlsx or .csv). Columns: <code className="bg-slate-100 px-1 rounded text-[11px]">name</code>, <code className="bg-slate-100 px-1 rounded text-[11px]">email</code>, <code className="bg-slate-100 px-1 rounded text-[11px]">voucher_code</code>.
                  <span className="ml-1 text-amber-600"> Re-uploading replaces all unissued codes for this cohort.</span>
                </p>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  disabled={isPending}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadVouchers(f); }}
                  className="block text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
                />
                {voucherUploadError && <p className="text-xs text-red-600 mt-2">{voucherUploadError}</p>}
                {voucherUploadMsg   && <p className="text-xs text-emerald-600 mt-2">{voucherUploadMsg}</p>}
                {isPending && <p className="text-xs text-slate-400 mt-2">Uploading…</p>}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
              <p className="text-xs text-slate-500">
                Issue exam vouchers and record official AWS exam scores per trainee.
                The <span className="font-medium">eye icon</span> controls whether a trainee can see their readiness status.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-8">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 min-w-[180px]">Voucher(s)</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 min-w-[260px]">Official Exam Results</th>
                    <th className="px-4 py-3 text-xs font-medium text-slate-500 text-center w-24">Readiness</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {trainees.map((t) => {
                    const tvouchers     = voucherMap.get(t.id)  ?? [];
                    const toutcomes     = outcomeMap.get(t.id)  ?? [];
                    const nextAttemptNo = toutcomes.length
                      ? Math.max(...toutcomes.map((o) => o.attempt_no)) + 1
                      : 1;

                    return (
                      <>
                        {/* ── Main trainee row ── */}
                        <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 text-xs text-slate-400 align-top pt-3.5">{t.serial_no ?? "—"}</td>

                          <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap align-top pt-3.5">
                            {t.full_name}
                          </td>

                          {/* Voucher column */}
                          <td className="px-4 py-3 align-top pt-3">
                            <div className="space-y-1.5">
                              {tvouchers.map((v) => (
                                <div key={v.id} className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                                      ✓ {v.exam_type} #{v.attempt_no}
                                    </span>
                                    <span className="text-[10px] text-slate-400">
                                      {fmtShortDate(v.issued_date)}
                                    </span>
                                    <button
                                      onClick={() => handleRevokeVoucher(v.id)}
                                      disabled={isPending}
                                      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 text-xs"
                                      title="Revoke voucher"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {v.voucher_code && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-slate-400">Code:</span>
                                      <code className="text-xs font-mono text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded select-all">
                                        {v.voucher_code}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              ))}
                              <button
                                onClick={() => handleOpenIssue(t.id)}
                                className={`text-xs font-medium transition-colors ${
                                  tvouchers.length
                                    ? "text-slate-400 hover:text-orange-600"
                                    : "text-orange-600 hover:text-orange-700 border border-dashed border-slate-300 hover:border-orange-400 px-2 py-0.5 rounded-lg"
                                }`}
                              >
                                {tvouchers.length ? "+ Issue another" : "Issue voucher"}
                              </button>
                            </div>
                          </td>

                          {/* Official results column */}
                          <td className="px-4 py-3 align-top pt-3">
                            <div className="space-y-1.5">
                              {toutcomes.map((o) => (
                                <div key={o.id} className="flex items-start gap-2 flex-wrap">
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                    o.outcome === "passed" ? "bg-green-100 text-green-700"
                                    : o.outcome === "failed" ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                                  }`}>
                                    {o.outcome === "passed" ? "✓ Pass" : o.outcome === "failed" ? "✗ Fail" : "⏳ Pending"}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs text-slate-700 tabular-nums">
                                      {o.exam_type} · {o.actual_score ?? "—"} · #{o.attempt_no}
                                    </span>
                                    {o.exam_date && (
                                      <span className="text-[10px] text-slate-400 ml-1">{fmtDate(o.exam_date)}</span>
                                    )}
                                    {o.self_reported && (
                                      <span className="ml-1.5 inline-flex items-center text-[10px] font-medium text-violet-600 bg-violet-50 border border-violet-200 px-1.5 py-0.5 rounded">
                                        Self-reported
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => {
                                        setOfficialError("");
                                        setEditingOutcome((v) => v === o.id ? null : o.id);
                                        setAddScoreFor(null);
                                      }}
                                      disabled={isPending}
                                      className="text-slate-300 hover:text-orange-500 transition-colors disabled:opacity-40"
                                      title="Edit record"
                                    >
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteScore(o.id)}
                                      disabled={isPending}
                                      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40 text-xs"
                                      title="Delete record"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {!toutcomes.length && (
                                <span className="text-xs text-slate-400">No results yet</span>
                              )}
                            </div>
                          </td>

                          {/* Readiness toggle */}
                          <td className="px-4 py-3 text-center align-top pt-3.5">
                            <button
                              onClick={() => handleToggleReadiness(t.id, t.show_readiness)}
                              disabled={isPending}
                              title={t.show_readiness ? "Hide readiness from trainee" : "Show readiness to trainee"}
                              className={`transition-colors disabled:opacity-40 ${
                                t.show_readiness
                                  ? "text-emerald-500 hover:text-slate-400"
                                  : "text-slate-300 hover:text-emerald-500"
                              }`}
                            >
                              {t.show_readiness ? (
                                /* eye-open */
                                <svg className="w-5 h-5 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                /* eye-off */
                                <svg className="w-5 h-5 mx-auto" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                  <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                                </svg>
                              )}
                            </button>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {t.show_readiness ? "Visible" : "Hidden"}
                            </p>
                          </td>

                          <td className="px-4 py-3 text-right align-top pt-3">
                            <button
                              onClick={() => {
                                setOfficialError("");
                                setEditingOutcome(null);
                                setAddScoreFor((v) => v === t.id ? null : t.id);
                              }}
                              className="text-xs text-orange-600 hover:text-orange-700 font-medium whitespace-nowrap"
                            >
                              + Add score
                            </button>
                          </td>
                        </tr>

                        {/* ── Inline: issue voucher ── */}
                        {issuingFor === t.id && (
                          <tr key={`${t.id}-voucher`} className="border-b border-slate-100 bg-orange-50">
                            <td colSpan={6} className="px-6 py-4">
                              <p className="text-xs font-semibold text-slate-700 mb-3">
                                Issue Voucher — {t.full_name}
                              </p>
                              <div className="flex items-end gap-3 flex-wrap">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Exam Type</label>
                                  <select
                                    value={voucherExamType}
                                    onChange={(e) => setVoucherExamType(e.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                                  >
                                    {EXAM_TYPES.map((et) => (
                                      <option key={et} value={et}>{et}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="flex-1 min-w-[220px]">
                                  <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Voucher Code *
                                    {pooledMap.has(t.id) && (
                                      <span className="ml-1.5 text-[10px] font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                        Pre-filled from upload
                                      </span>
                                    )}
                                  </label>
                                  <input
                                    type="text"
                                    value={voucherCodeInput}
                                    onChange={(e) => setVoucherCodeInput(e.target.value)}
                                    placeholder="e.g. XXXX-YYYY-ZZZZ-WWWW"
                                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-300"
                                  />
                                </div>
                                <button
                                  onClick={() => handleIssueVoucher(t.id)}
                                  disabled={isPending || !voucherCodeInput.trim()}
                                  className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                  {isPending ? "Issuing…" : "Issue"}
                                </button>
                                <button
                                  onClick={() => { setIssuingFor(null); setVoucherCodeInput(""); setOfficialError(""); }}
                                  className="text-sm text-slate-500 hover:text-slate-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* ── Inline: edit existing outcome ── */}
                        {editingOutcome && toutcomes.some((o) => o.id === editingOutcome) && (() => {
                          const o = toutcomes.find((x) => x.id === editingOutcome)!;
                          return (
                            <tr key={`${t.id}-edit`} className="border-b border-slate-100 bg-violet-50">
                              <td colSpan={6} className="px-6 py-4">
                                <form onSubmit={(e) => handleUpdateScore(o.id, e)} className="space-y-3">
                                  <h4 className="text-xs font-semibold text-slate-700">
                                    Edit Exam Score — {t.full_name}
                                    {o.self_reported && (
                                      <span className="ml-2 text-[10px] font-normal text-violet-600 bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded">
                                        Self-reported by trainee
                                      </span>
                                    )}
                                  </h4>
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Exam *</label>
                                      <select
                                        name="examType"
                                        defaultValue={o.exam_type}
                                        required
                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                                      >
                                        {EXAM_TYPES.map((et) => (
                                          <option key={et} value={et}>{et}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Score *</label>
                                      <input
                                        name="score"
                                        type="number"
                                        min="100"
                                        max="1000"
                                        defaultValue={o.actual_score ?? ""}
                                        required
                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Result *</label>
                                      <select
                                        name="passed"
                                        defaultValue={o.outcome}
                                        required
                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                                      >
                                        <option value="passed">Pass</option>
                                        <option value="failed">Fail</option>
                                        <option value="pending">Pending</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Exam Date *</label>
                                      <input
                                        name="examDate"
                                        type="date"
                                        defaultValue={o.exam_date ?? ""}
                                        required
                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Attempt #</label>
                                      <input
                                        name="attemptNo"
                                        type="number"
                                        min="1"
                                        defaultValue={o.attempt_no}
                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                                      <input
                                        name="notes"
                                        type="text"
                                        defaultValue={o.notes ?? ""}
                                        placeholder="Optional"
                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      type="submit"
                                      disabled={isPending}
                                      className="px-4 py-1.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                                    >
                                      {isPending ? "Saving…" : "Save Changes"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => { setEditingOutcome(null); setOfficialError(""); }}
                                      className="px-4 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              </td>
                            </tr>
                          );
                        })()}

                        {/* ── Inline: add official score ── */}
                        {addScoreFor === t.id && (
                          <tr key={`${t.id}-score`} className="border-b border-slate-100 bg-slate-50">
                            <td colSpan={6} className="px-6 py-4">
                              <form onSubmit={(e) => handleSaveScore(t.id, e)} className="space-y-3">
                                <h4 className="text-xs font-semibold text-slate-700">
                                  Add Official Exam Score — {t.full_name}
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Exam *</label>
                                    <select
                                      name="examType"
                                      required
                                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                                    >
                                      {EXAM_TYPES.map((et) => (
                                        <option key={et} value={et}>{et}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Score *</label>
                                    <input
                                      name="score"
                                      type="number"
                                      min="100"
                                      max="1000"
                                      placeholder="700"
                                      required
                                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Result *</label>
                                    <select
                                      name="passed"
                                      required
                                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300"
                                    >
                                      <option value="passed">Pass</option>
                                      <option value="failed">Fail</option>
                                      <option value="pending">Pending</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Exam Date *</label>
                                    <input
                                      name="examDate"
                                      type="date"
                                      required
                                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Attempt #</label>
                                    <input
                                      name="attemptNo"
                                      type="number"
                                      min="1"
                                      defaultValue={nextAttemptNo}
                                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
                                    <input
                                      name="notes"
                                      type="text"
                                      placeholder="Optional"
                                      className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    type="submit"
                                    disabled={isPending}
                                    className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                                  >
                                    {isPending ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setAddScoreFor(null); setOfficialError(""); }}
                                    className="px-4 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ ANALYTICS TAB ═════════════════════════════════════════════════════ */}
      {activeTab === "analytics" && (
        <div className="space-y-5">

          {/* Model status card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-900">Pass Probability Analysis</h3>
                  {modelBundle && (modelBundle.logistic || modelBundle.linear) ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                      {modelBundle.logistic ? "Logistic regression" : "Linear regression"} · N={modelBundle.trainingSize}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                      Rule-based (no historical data yet)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Target: {resolvedExamType} · Pass threshold:{" "}
                  <span className="font-medium text-slate-700">
                    {PASS_THRESHOLD[resolvedExamType] ?? 700}/1000 ({Math.round(thresholdPct)}%)
                  </span>
                  {modelBundle && modelBundle.logistic && (
                    <span className="ml-2 text-violet-600">
                      · Train accuracy {Math.round(modelBundle.logistic.accuracy * 100)}%
                    </span>
                  )}
                  {modelBundle && !modelBundle.logistic && modelBundle.linear && (
                    <span className="ml-2 text-violet-600">
                      · R² = {modelBundle.linear.rSquared.toFixed(2)}
                    </span>
                  )}
                  {(!modelBundle || (!modelBundle.logistic && !modelBundle.linear)) && (
                    <span className="ml-2 text-slate-400">
                      · Predictions activate once {10} same-level trainees have recorded exam outcomes
                    </span>
                  )}
                </p>
                {modelBundle && (modelBundle.logistic || modelBundle.linear) && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    Features: mock exam average · lab completion · KC completion.
                    Trained on all {modelBundle.trainingSize} same-level trainees with recorded outcomes.
                  </p>
                )}
              </div>
              <div className="flex gap-4 text-center flex-shrink-0">
                {(["Very likely", "Likely", "Borderline", "At risk", "Unlikely"] as const).map((label) => {
                  const colorMap: Record<string, string> = {
                    "Very likely": "text-green-600",
                    "Likely":      "text-emerald-600",
                    "Borderline":  "text-amber-600",
                    "At risk":     "text-orange-600",
                    "Unlikely":    "text-red-600",
                  };
                  const count = trainees.filter((t) => {
                    const pcts: number[] = [];
                    for (const q of quizzes) {
                      const best = bestScoreMap.get(`${t.id}:${q.id}`);
                      if (best !== undefined) pcts.push((best / q.max_score) * 100);
                    }
                    const avg  = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;
                    const feat = featuresMap.get(t.id);
                    return regressionPrediction(modelBundle, avg, feat?.labRatePct ?? null, feat?.kcRatePct ?? null, thresholdPct).label === label;
                  }).length;
                  return (
                    <div key={label}>
                      <p className={`text-lg font-bold tabular-nums ${colorMap[label]}`}>{count}</p>
                      <p className="text-[10px] text-slate-400">{label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Insight cards — cohort summary shown first for quick overview */}
          {trainees.length > 0 && quizzes.length > 0 && (() => {
            const withData = trainees.filter((t) => {
              for (const q of quizzes) {
                if (bestScoreMap.has(`${t.id}:${q.id}`)) return true;
              }
              return false;
            });
            if (!withData.length) return null;

            const avgs = withData.map((t) => {
              const pcts: number[] = [];
              for (const q of quizzes) {
                const best = bestScoreMap.get(`${t.id}:${q.id}`);
                if (best !== undefined) pcts.push((best / q.max_score) * 100);
              }
              return pcts.reduce((a, b) => a + b, 0) / pcts.length;
            });

            const cohortAvg  = avgs.reduce((a, b) => a + b, 0) / avgs.length;
            const readyCount = avgs.filter((a) => a >= thresholdPct).length;
            const topTrainee = withData[avgs.indexOf(Math.max(...avgs))];
            const needsHelp  = withData.filter((_, i) => avgs[i] < thresholdPct - 10);

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 mb-1">Cohort Average</p>
                  <p className={`text-2xl font-bold tabular-nums ${scoreTextColor(cohortAvg)}`}>{cohortAvg.toFixed(1)}%</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Target: {Math.round(thresholdPct)}% to pass {resolvedExamType}
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 mb-1">Above Pass Threshold</p>
                  <p className="text-2xl font-bold tabular-nums text-green-600">
                    {readyCount}<span className="text-base font-normal text-slate-400"> / {withData.length}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {Math.round((readyCount / withData.length) * 100)}% scoring ≥ {Math.round(thresholdPct)}%
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs text-slate-500 mb-1">Needs Most Support</p>
                  {needsHelp.length > 0 ? (
                    <>
                      <p className="text-sm font-semibold text-slate-900 mt-1">
                        {needsHelp.length} trainee{needsHelp.length !== 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Scoring &gt;10pp below threshold
                        {needsHelp.length <= 3 && ": " + needsHelp.map((t) => t.full_name.split(" ")[0]).join(", ")}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-semibold text-green-600 mt-1">All within range</p>
                  )}
                  {topTrainee && (
                    <p className="text-xs text-slate-400 mt-1">
                      Top: <span className="text-slate-600 font-medium">{topTrainee.full_name.split(" ")[0]}</span> ({Math.max(...avgs).toFixed(1)}%)
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Per-trainee prediction table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Trainee Predictions</h3>
              <span className="text-xs text-slate-400">
                Target exam: <span className="font-medium text-slate-600">{resolvedExamType}</span>
                {" · "}Pass threshold: <span className="font-medium text-slate-600">{Math.round(thresholdPct)}%</span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-8">#</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Name</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 w-24">Quiz Avg</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 w-16">Lab %</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-slate-500 w-16">KC %</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-36">Prediction</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 min-w-[100px]">Confidence</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 w-32">Actual Outcome</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trainees
                    .map((t) => {
                      const pcts: number[] = [];
                      for (const q of quizzes) {
                        const best = bestScoreMap.get(`${t.id}:${q.id}`);
                        if (best !== undefined) pcts.push((best / q.max_score) * 100);
                      }
                      const quizzesAttempted = pcts.length;
                      const quizCoverage     = quizzes.length > 0 ? quizzesAttempted / quizzes.length : 0;
                      const quizAvg = pcts.length
                        ? pcts.reduce((a, b) => a + b, 0) / pcts.length
                        : null;
                      const feat    = featuresMap.get(t.id);
                      const pred    = regressionPrediction(
                        modelBundle,
                        quizAvg,
                        feat?.labRatePct ?? null,
                        feat?.kcRatePct  ?? null,
                        thresholdPct,
                      );
                      const tOutcomes     = outcomeMap.get(t.id) ?? [];
                      const latestOutcome = tOutcomes.length ? tOutcomes[tOutcomes.length - 1] : null;
                      // Low coverage: scored on fewer than half the available quizzes
                      const lowCoverage = quizzes.length > 1 && quizCoverage < 0.5;
                      return { t, quizAvg, quizzesAttempted, lowCoverage, pred, latestOutcome, feat };
                    })
                    .sort((a, b) => {
                      if (a.quizAvg === null && b.quizAvg === null) return 0;
                      if (a.quizAvg === null) return 1;
                      if (b.quizAvg === null) return -1;
                      return b.quizAvg - a.quizAvg;
                    })
                    .map(({ t, quizAvg, quizzesAttempted, lowCoverage, pred, latestOutcome, feat }) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-xs text-slate-400">{t.serial_no ?? "—"}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{t.full_name}</td>
                        <td className="px-3 py-3 text-center tabular-nums">
                          {quizAvg !== null ? (
                            <div>
                              <span className={`text-sm font-semibold ${scoreTextColor(quizAvg)}`}>
                                {quizAvg.toFixed(1)}%
                              </span>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {quizzesAttempted}/{quizzes.length} quizzes
                                {lowCoverage && <span className="text-amber-500 ml-1">⚠</span>}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-xs text-slate-500">
                          {feat?.labRatePct !== null && feat?.labRatePct !== undefined
                            ? `${feat.labRatePct.toFixed(0)}%`
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-xs text-slate-500">
                          {feat?.kcRatePct !== null && feat?.kcRatePct !== undefined
                            ? `${feat.kcRatePct.toFixed(0)}%`
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-sm font-semibold ${pred.color}`}>{pred.label}</span>
                            {pred.source !== "heuristic" && (
                              <span className="text-[9px] font-medium text-violet-500 bg-violet-50 border border-violet-200 px-1 py-0.5 rounded uppercase tracking-wide">
                                {pred.source}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[70px]">
                              <div
                                className={`h-1.5 rounded-full transition-all ${
                                  pred.bar >= 65 ? "bg-green-500"
                                  : pred.bar >= 40 ? "bg-amber-400"
                                  : "bg-red-400"
                                }`}
                                style={{ width: `${pred.bar}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-400 tabular-nums w-7">{pred.bar}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {latestOutcome ? (
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                              latestOutcome.outcome === "passed" ? "bg-green-100 text-green-700"
                              : latestOutcome.outcome === "failed" ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                            }`}>
                              {latestOutcome.outcome === "passed" ? "✓ Passed"
                               : latestOutcome.outcome === "failed" ? "✗ Failed"
                               : "⏳ Pending"}
                              {latestOutcome.actual_score ? ` · ${latestOutcome.actual_score}` : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">Not taken</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 max-w-[260px]">
                          {pred.detail}
                          {lowCoverage && quizAvg !== null && (
                            <span className="block text-amber-600 mt-0.5">
                              ⚠ Only {quizzesAttempted} of {quizzes.length} quizzes taken — prediction may not reflect full readiness.
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {!quizzes.length && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 py-14 text-center">
              <p className="text-sm text-slate-400">No quiz data yet.</p>
              <p className="text-xs text-slate-400 mt-1">Add quizzes and upload scores to see predictions.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Focus Select (reveals custom label input when "Other" chosen) ─────────────

function FocusSelect() {
  const [val, setVal] = useState("practitioner");
  return (
    <div className="space-y-2">
      <select
        name="focusType"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
      >
        <option value="practitioner">Practitioner</option>
        <option value="associate">Associate</option>
        <option value="professional">Professional</option>
        <option value="other">Other</option>
      </select>
      {val === "other" && (
        <input
          name="focusLabel"
          required
          placeholder="Describe the focus…"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
        />
      )}
    </div>
  );
}
