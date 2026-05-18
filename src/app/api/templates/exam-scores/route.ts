import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export async function GET() {
  const wb = XLSX.utils.book_new();

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
    ["1. Fill in rows below the two sample rows (delete the samples before uploading)."],
    ["2. Save the file — keep it as .xlsx or export as .csv."],
    ["3. In the Quiz Scores tab, click the ↑ Upload button next to the quiz, then select this file."],
    [""],
    ["TIP: Scores are matched by email. Trainees whose email is not found will be listed as unmatched."],
  ]);
  instrWs["!cols"] = [{ wch: 15 }, { wch: 12 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="exam_scores_template.xlsx"',
    },
  });
}
