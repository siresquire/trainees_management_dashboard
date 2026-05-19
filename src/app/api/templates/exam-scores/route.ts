import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

// Template format:
//   Row 1 — column headers: "email" in col A, quiz names in B, C, …
//   Row 2 — max scores:    blank in col A, max score for each quiz col
//   Row 3+ — data rows:    email, then score for each quiz (blank = not taken)

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
      : [
          { name: "Quiz 1", max: 100 },
          { name: "Quiz 2", max: 65 },
        ];

  const wb = XLSX.utils.book_new();

  // Row 1: headers
  const headerRow = ["email", ...quizzes.map((q) => q.name)];
  // Row 2: max scores (blank for email col)
  const maxRow = ["", ...quizzes.map((q) => q.max)];
  // Sample data rows
  const sample1 = ["jane@example.com", ...quizzes.map((q) => Math.round(q.max * 0.85))];
  const sample2 = ["john@example.com", ...quizzes.map((q) => Math.round(q.max * 0.72))];
  const sample3 = ["mary@example.com", ...quizzes.map((q, i) => (i === 0 ? "" : Math.round(q.max * 0.90)))];

  const scoresWs = XLSX.utils.aoa_to_sheet([headerRow, maxRow, sample1, sample2, sample3]);
  scoresWs["!cols"] = [{ wch: 34 }, ...quizzes.map(() => ({ wch: 14 }))];

  // Highlight max-score row with a comment so it's obvious
  // (XLSX.js doesn't support cell styles in community edition, so we rely on the Instructions sheet)
  XLSX.utils.book_append_sheet(wb, scoresWs, "Scores");

  const instrRows = [
    ["EXAM SCORES TEMPLATE — HOW TO USE"],
    [""],
    ["ROW LAYOUT"],
    ["Row 1", "Column headers — do NOT edit the 'email' header. Name quiz columns whatever you like."],
    ["Row 2", "Max scores — enter the maximum possible score for each quiz in this row. Leave email cell blank."],
    ["Row 3+", "Your data — one row per trainee. Leave a score cell blank (not zero) if a trainee did not take that quiz."],
    [""],
    ["COLUMN RULES"],
    ["email", "Required", "Trainee's email address (personal or Amalitech). Must match their record in the dashboard."],
    ...quizzes.map((q) => [q.name, "Optional per cell", `Score for ${q.name}. Max score set in row 2: ${q.max}.`]),
    [""],
    ["TIPS"],
    ["· Delete the three sample rows (rows 3, 4, 5) before uploading."],
    ["· You can add more quiz columns — just give them a header name in row 1 and a max score in row 2."],
    ["· Column names become the quiz names in the dashboard. Existing quizzes matched by name will be updated, not duplicated."],
    ["· Save as .xlsx or .csv, then click Upload Scores in the Quiz Scores tab."],
    [""],
    ["LINK IMPORT"],
    ["· Instead of uploading a file you can paste a Google Sheets or direct file URL in the Import from URL panel."],
    ["· Google Sheets must have 'Anyone with the link can view' sharing enabled."],
  ];
  const instrWs = XLSX.utils.aoa_to_sheet(instrRows);
  instrWs["!cols"] = [{ wch: 15 }, { wch: 18 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="exam_scores_template.xlsx"',
    },
  });
}
