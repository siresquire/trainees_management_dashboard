import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Accept optional quiz name+maxScore pairs as repeated ?quiz=Name||100 params
  const quizParams = url.searchParams.getAll("quiz");
  const quizzes =
    quizParams.length > 0
      ? quizParams.map((p) => {
          const sep = p.lastIndexOf("||");
          const name = sep >= 0 ? p.slice(0, sep).trim() : p.trim();
          const max = sep >= 0 ? parseInt(p.slice(sep + 2), 10) : 100;
          return { name: name || "Quiz", max: isNaN(max) ? 100 : max };
        })
      : null;

  const wb = XLSX.utils.book_new();

  if (quizzes && quizzes.length > 0) {
    // ── Cohort-specific template with one column per quiz ──────────────────────
    const headers = ["email", "name (optional)", ...quizzes.map((q) => q.name)];
    const example1 = [
      "jane@example.com",
      "Jane Doe",
      ...quizzes.map((q) => Math.round(q.max * 0.85)),
    ];
    const example2 = [
      "john@example.com",
      "John Smith",
      ...quizzes.map((q) => Math.round(q.max * 0.72)),
    ];

    const scoresWs = XLSX.utils.aoa_to_sheet([headers, example1, example2]);
    scoresWs["!cols"] = [
      { wch: 32 },
      { wch: 20 },
      ...quizzes.map(() => ({ wch: 14 })),
    ];
    XLSX.utils.book_append_sheet(wb, scoresWs, "Scores");

    const instrRows = [
      ["EXAM SCORES — BULK UPLOAD TEMPLATE"],
      [""],
      ["Column", "Required", "Description"],
      ["email", "Yes", "Trainee email address (personal or Amalitech). Used to match trainee records."],
      ["name (optional)", "No", "Trainee name — for reference only, not used for matching."],
      ...quizzes.map((q) => [
        q.name,
        "Yes",
        `Score for quiz "${q.name}" (out of ${q.max}). Leave blank if not yet taken.`,
      ]),
      [""],
      ["HOW TO USE"],
      ["1. Fill in scores for each row. Delete the two example rows before uploading."],
      ["2. Leave a score cell blank (not zero) if a trainee did not take that quiz."],
      ["3. Save as .xlsx or .csv, then click Upload All Scores in the Quiz Scores tab."],
      [""],
      ["TIP: Column names must exactly match the quiz names in the dashboard."],
    ];
    const instrWs = XLSX.utils.aoa_to_sheet(instrRows);
    instrWs["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");
  } else {
    // ── Generic fallback template (no quizzes defined yet) ─────────────────────
    const scoresWs = XLSX.utils.aoa_to_sheet([
      ["email", "name", "score", "date_taken"],
      ["jane@example.com", "Jane Doe", 85, "2026-04-29"],
      ["john@example.com", "John Smith", 72, "2026-04-29"],
    ]);
    scoresWs["!cols"] = [{ wch: 32 }, { wch: 25 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, scoresWs, "Scores");

    const instrWs = XLSX.utils.aoa_to_sheet([
      ["EXAM SCORES UPLOAD TEMPLATE — INSTRUCTIONS"],
      [""],
      ["Column", "Required", "Description"],
      ["email", "Yes", "Trainee email address (personal or Amalitech). Must match the address on their account."],
      ["name", "No", "Trainee full name — for your reference only, not used for matching."],
      ["score", "Yes", "Numeric score achieved (e.g. 85 or 700)."],
      ["date_taken", "No", "Date the test was taken, in YYYY-MM-DD format. Defaults to today if blank."],
      [""],
      ["HOW TO USE"],
      ["1. Create quizzes first in the Quiz Scores tab, then re-download this template to get quiz-specific columns."],
      ["2. Fill in rows below the two sample rows (delete the samples before uploading)."],
      ["3. Save the file — keep it as .xlsx or export as .csv."],
      ["4. In the Quiz Scores tab, click Upload All Scores, then select this file."],
    ]);
    instrWs["!cols"] = [{ wch: 15 }, { wch: 12 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="exam_scores_template.xlsx"',
    },
  });
}
