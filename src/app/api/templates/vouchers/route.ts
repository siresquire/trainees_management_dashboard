import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export async function GET() {
  const wb = XLSX.utils.book_new();

  const dataWs = XLSX.utils.aoa_to_sheet([
    ["name", "email", "voucher_code"],
    ["Jane Doe",  "jane@example.com",  "XXXX-YYYY-ZZZZ-0001"],
    ["John Smith", "john@example.com", "XXXX-YYYY-ZZZZ-0002"],
  ]);
  dataWs["!cols"] = [{ wch: 28 }, { wch: 34 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, dataWs, "Vouchers");

  const instrWs = XLSX.utils.aoa_to_sheet([
    ["VOUCHER CODE UPLOAD TEMPLATE — INSTRUCTIONS"],
    [""],
    ["Column",       "Required", "Description"],
    ["name",         "No",       "Trainee full name — for reference only, not used for matching."],
    ["email",        "Yes",      "Trainee email (personal or Amalitech). Must match the address on their account."],
    ["voucher_code", "Yes",      "The exam voucher code to be issued to this trainee."],
    [""],
    ["HOW TO USE"],
    ["1. Fill in rows below the two sample rows (delete the samples before uploading)."],
    ["2. Save as .xlsx or export as .csv."],
    ["3. In the Official Exams tab, click '↑ Upload Voucher Codes', then select this file."],
    ["4. Codes are stored privately until you click 'Issue voucher' for each trainee."],
    ["5. When issuing, the code will be pre-filled automatically — you can still edit it."],
    [""],
    ["TIP: Re-uploading a new file replaces all unissued codes for this cohort. Already-issued codes are unaffected."],
  ]);
  instrWs["!cols"] = [{ wch: 16 }, { wch: 12 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="voucher_codes_template.xlsx"',
    },
  });
}
