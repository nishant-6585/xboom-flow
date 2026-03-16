import { Button } from "@/components/ui/button";
import { downloadPayslipPDF, PayslipData } from "@/lib/payslipGenerator";
import { SalarySheetEntry } from "@/hooks/useSalarySheets";
import { Download } from "lucide-react";

const sampleEntry: SalarySheetEntry = {
  id: "sample-1",
  salary_sheet_id: "sheet-1",
  employee_id: "emp-001",
  employee_name: "Nishant Kumar",
  salary: 67500,
  bank_account: "040101516211",
  ifsc_code: "ICIC0000401",
  wfh_days: 2,
  unpaid_leaves: 0,
  el_leaves: 1,
  sl_leaves: 0,
  deductions: 0,
  pending_amount: 0,
  tds: 0,
  tax: 300,
  reimbursements: 12000,
  total: 79200,
  remarks: null,
  wfh_days_override: false,
  unpaid_leaves_override: false,
  el_leaves_override: false,
  sl_leaves_override: false,
  deductions_override: false,
  last_working_date: null,
};

const sampleData: PayslipData = {
  entry: sampleEntry,
  month: 2,
  year: 2026,
  department: "IT",
  designation: "Head of Autonomous Systems & Software",
  employeeNumber: "109",
  dateOfBirth: "1983-04-25",
  joiningDate: "2026-02-01",
  pan: "BKCPK4917M",
  payableDays: 28,
  leaveBalance: 9.75,
  regimeOpted: "New Regime",
};

export default function SamplePayslip() {
  const handleDownload = async () => {
    await downloadPayslipPDF(sampleData);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Sample Payslip Generator</h1>
        <p className="text-muted-foreground">Click below to download a sample payslip PDF to verify the format</p>
        <Button size="lg" onClick={handleDownload}>
          <Download className="h-5 w-5 mr-2" /> Download Sample Payslip
        </Button>
      </div>
    </div>
  );
}
