import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export async function GET() {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Questions ──────────────────────────────────────────────────────
  const questionsData = [
    [
      "type",
      "question",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "option_e",
      "option_f",
      "correct_answers",
      "points",
      "explanation",
      "time_seconds",
    ],
    // MCQ sample
    [
      "mcq",
      "What does S3 stand for?",
      "Simple Storage Service",
      "Secure Storage System",
      "Scalable Server Storage",
      "Super Storage Service",
      "",
      "",
      "A",
      1,
      "S3 = Simple Storage Service, one of AWS's oldest services.",
      "",
    ],
    // Multi-select sample
    [
      "multi_select",
      "Which of the following are AWS compute services? (select all that apply)",
      "EC2",
      "Lambda",
      "S3",
      "RDS",
      "ECS",
      "",
      "A,B,E",
      2,
      "EC2 (virtual machines), Lambda (serverless), and ECS (containers) are compute services. S3 is storage, RDS is database.",
      "",
    ],
    // True/False sample
    [
      "true_false",
      "IAM roles can be attached to EC2 instances.",
      "",
      "",
      "",
      "",
      "",
      "",
      "TRUE",
      1,
      "",
      "60",
    ],
  ];

  const questionsWs = XLSX.utils.aoa_to_sheet(questionsData);
  questionsWs["!cols"] = [
    { wch: 15 },
    { wch: 55 },
    { wch: 30 },
    { wch: 30 },
    { wch: 30 },
    { wch: 30 },
    { wch: 15 },
    { wch: 15 },
    { wch: 20 },
    { wch: 8 },
    { wch: 50 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, questionsWs, "Questions");

  // ── Sheet 2: Instructions ───────────────────────────────────────────────────
  const instructionsData: (string | number)[][] = [
    ["QUESTION BANK IMPORT TEMPLATE — INSTRUCTIONS"],
    [""],
    ["Column", "Required", "Values / Notes"],
    ["type", "Yes", "mcq, multi_select, true_false, short_answer, code_input"],
    [
      "question",
      "Yes",
      "The question text (no commas needed — use the Excel cell)",
    ],
    [
      "option_a … option_f",
      "For MCQ/multi_select",
      "Answer options A through F. Leave blank options empty. Minimum 2 options for MCQ/multi-select.",
    ],
    [
      "correct_answers",
      "Yes",
      "For mcq: single letter e.g. A · For multi_select: comma-separated letters e.g. A,C · For true_false: TRUE or FALSE · For short_answer/code_input: the model answer text (trainer reference only)",
    ],
    ["points", "No", "Numeric. Defaults to 1 if blank."],
    ["explanation", "No", "Shown to trainee after quiz grading."],
    [
      "time_seconds",
      "No",
      "Per-question time limit in seconds (e.g. 60). Leave blank for no limit.",
    ],
    [""],
    [
      "TIP: Save this file and fill in rows below the samples. Delete sample rows before importing.",
    ],
  ];

  const instructionsWs = XLSX.utils.aoa_to_sheet(instructionsData);
  instructionsWs["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 75 }];
  XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions");

  // ── Write and return ────────────────────────────────────────────────────────
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="question_bank_template.xlsx"',
    },
  });
}
