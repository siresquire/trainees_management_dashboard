import * as XLSX from "xlsx";

function buildTemplate(): Buffer {
  const wb = XLSX.utils.book_new();

  // ── Tasks sheet ────────────────────────────────────────────────────────────
  const headers = ["Task Name", "Type", "Week", "Track"];
  const examples = [
    ["Introduction to AWS Cloud",           "Lab", 1, "SAA"],
    ["Launching your first EC2 instance",   "Lab", 1, "SAA"],
    ["S3 Storage fundamentals",             "Lab", 2, "SAA"],
    ["IAM Users, Groups and Policies",      "Lab", 2, "SAA"],
    ["VPC and Subnet configuration",        "Lab", 3, "SAA"],
    ["Lambda functions and triggers",       "Lab", 4, "DVA"],
    ["API Gateway REST API",                "Lab", 4, "DVA"],
    ["DynamoDB basics",                     "Lab", 5, "DVA"],
    ["AWS Cloud Overview",                  "Video", 1, "SAA"],
    ["Cloud Practitioner Essentials KC",    "KC",   1, "SAA"],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws["!cols"] = [
    { wch: 50 },  // Task Name
    { wch: 10 },  // Type
    { wch: 8  },  // Week
    { wch: 10 },  // Track
  ];

  // Bold header row
  for (let col = 0; col < headers.length; col++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cell]) {
      ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } } };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Tasks");

  // ── Reference sheet ────────────────────────────────────────────────────────
  const refData = [
    ["Type Values",  "Track Values", "Track Notes"],
    ["Lab",          "SAA",          "Solutions Architect Associate"],
    ["KC",           "DVA",          "Developer Associate"],
    ["Video",        "",             ""],
  ];
  const refWs = XLSX.utils.aoa_to_sheet(refData);
  refWs["!cols"] = [{ wch: 14 }, { wch: 14 }, { wch: 36 }];
  // Bold header
  for (let col = 0; col < 3; col++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c: col });
    if (refWs[cell]) refWs[cell].s = { font: { bold: true } };
  }
  XLSX.utils.book_append_sheet(wb, refWs, "Reference");

  // ── Instructions sheet ─────────────────────────────────────────────────────
  const instructions = [
    ["Amalitech Associate Tasks Template — Instructions"],
    [""],
    ["Column",     "Required", "Notes"],
    ["Task Name",  "Yes",      "The exact lab / KC / video title as it appears in Whizlabs or your course materials"],
    ["Type",       "Yes",      "Must be one of: Lab, KC, Video  (see Reference sheet — case-insensitive)"],
    ["Week",       "Yes",      "Week number (1, 2, 3 …)"],
    ["Track",      "No",       "SAA = Solutions Architect Associate, DVA = Developer Associate. Leave blank if not applicable."],
    [""],
    ["Important notes"],
    ["- Delete the example rows (rows 2-11) before uploading."],
    ["- Do NOT rename or reorder the column headers in row 1."],
    ["- For Whizlabs: the Task Name must match the lab title exactly (case-insensitive) for automatic completion matching."],
    ["- Duplicate task names within the same week will be skipped on upload."],
    ["- Save the file as .xlsx (Excel Workbook) before uploading."],
  ];
  const instrWs = XLSX.utils.aoa_to_sheet(instructions);
  instrWs["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 80 }];
  instrWs["A1"].s = { font: { bold: true, sz: 12 } };
  XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function GET() {
  const buffer = buildTemplate();

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="amalitech_associate_tasks_template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
