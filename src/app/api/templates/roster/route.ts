import * as XLSX from "xlsx";

const GHANA_REGIONS = [
  "Greater Accra", "Ashanti", "Western", "Eastern", "Central",
  "Volta", "Northern", "Upper East", "Upper West", "Brong-Ahafo",
  "Oti", "Ahafo", "Bono East", "North East", "Savannah", "Western North",
];

const COHORT_TYPES = ["University", "External", "Graduate"];
const GENDERS     = ["Male", "Female"];

function buildTemplate(level: string, hasIndexNumbers: boolean): Buffer {
  const wb = XLSX.utils.book_new();

  // ── Build header row ───────────────────────────────────────────────────────
  let headers: string[];
  let sample: (string | number)[];

  if (level === "associate" || level === "devops") {
    if (hasIndexNumbers) {
      headers = ["S/N", "Full Name", "Index Number", "Personal Email", "Amalitech Email", "Phone Number", "Gender", "Type", "University", "Town", "Region"];
      sample  = [1, "Jane Doe", "UG/2020/1234", "jane.doe@gmail.com", "jane.doe@amalitech.org", "+233201234567", "Female", "University", "KNUST", "Kumasi", "Ashanti"];
    } else {
      headers = ["S/N", "Full Name", "Personal Email", "Amalitech Email", "Phone Number", "Gender", "Type", "University", "Town", "Region"];
      sample  = [1, "Jane Doe", "jane.doe@gmail.com", "jane.doe@amalitech.org", "+233201234567", "Female", "University", "KNUST", "Kumasi", "Ashanti"];
    }
  } else {
    // practitioner
    if (hasIndexNumbers) {
      headers = ["S/N", "Full Name", "Index Number", "Personal Email", "Phone Number", "Gender", "Type", "University", "Town", "Region"];
      sample  = [1, "Jane Doe", "UG/2020/1234", "jane.doe@gmail.com", "+233201234567", "Female", "University", "KNUST", "Kumasi", "Ashanti"];
    } else {
      headers = ["S/N", "Full Name", "Personal Email", "Phone Number", "Gender", "Type", "University", "Town", "Region"];
      sample  = [1, "Jane Doe", "jane.doe@gmail.com", "+233201234567", "Female", "University", "KNUST", "Kumasi", "Ashanti"];
    }
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);

  // Column widths
  const colWidths = headers.map((h) => {
    if (h === "S/N")                        return { wch: 6 };
    if (h === "Full Name")                  return { wch: 28 };
    if (h === "Index Number")               return { wch: 20 };
    if (h === "Personal Email")             return { wch: 32 };
    if (h === "Amalitech Email")            return { wch: 32 };
    if (h === "Phone Number")               return { wch: 18 };
    if (h === "Gender")                     return { wch: 12 };
    if (h === "Type")                       return { wch: 14 };
    if (h === "University")                 return { wch: 26 };
    if (h === "Town")                       return { wch: 18 };
    if (h === "Region")                     return { wch: 22 };
    return { wch: 16 };
  });
  ws["!cols"] = colWidths;

  // Bold header row
  for (let col = 0; col < headers.length; col++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cell]) continue;
    ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: "F1F5F9" } } };
  }

  XLSX.utils.book_append_sheet(wb, ws, "Roster");

  // ── Reference sheet ────────────────────────────────────────────────────────
  const maxRows = Math.max(COHORT_TYPES.length, GHANA_REGIONS.length, GENDERS.length);
  const refData = [
    ["Gender", "Type", "Region"],
    ...Array.from({ length: maxRows }, (_, i) => [
      GENDERS[i] ?? "", COHORT_TYPES[i] ?? "", GHANA_REGIONS[i] ?? "",
    ]),
  ];
  const refWs = XLSX.utils.aoa_to_sheet(refData);
  refWs["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, refWs, "Reference");

  // ── Instructions sheet ─────────────────────────────────────────────────────
  const rows: (string | number)[][] = [
    ["Amalitech Trainee Roster — Instructions"],
    [""],
    ["Column", "Required", "Notes"],
    ["S/N", "Yes", "Sequential number (1, 2, 3…)"],
    ["Full Name", "Yes", "Trainee's full legal name"],
  ];
  if (hasIndexNumbers) {
    rows.push(["Index Number", "Yes", "Student / matriculation ID (e.g. UG/2020/1234)"]);
  }
  rows.push(["Personal Email", "Yes", "Gmail or personal email — used for dashboard login"]);
  if (level !== "practitioner") {
    rows.push(["Amalitech Email", "No", "Company email address (if already assigned)"]);
  }
  rows.push(
    ["Phone Number", "No", "Format: +233XXXXXXXXX"],
    ["Gender", "No", "Must be: Male or Female (see Reference sheet)"],
    ["Type", "Yes", "Must be: University, External, or Graduate (see Reference sheet)"],
    ["University", "If Type=University", "Full university name"],
    ["Town", "No", "Town or city of residence"],
    ["Region", "No", "Must match a value from the Reference sheet"],
    [""],
    ["Notes"],
    ["- Delete the sample row (row 2) before uploading."],
    ["- Do NOT change the column headers in row 1."],
    ["- Save as .xlsx (Excel) before uploading."],
  );
  const instrWs = XLSX.utils.aoa_to_sheet(rows);
  instrWs["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const level           = searchParams.get("level") ?? "practitioner";
  const hasIndexNumbers = searchParams.get("has_index_numbers") === "1";

  const buffer   = buildTemplate(level, hasIndexNumbers);
  const suffix   = hasIndexNumbers ? "_indexed" : "";
  const filename = `amalitech_roster_template_${level}${suffix}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
