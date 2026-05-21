import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { EmployeeTrainingPanel } from "@/components/trainings/EmployeeTrainingPanel";
import { BookOpen, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrainings } from "@/hooks/useTrainings";
import { useTableExport } from "@/hooks/useTableExport";

export default function Trainings() {
  const { trainings } = useTrainings();
  const { exportToExcel } = useTableExport();

  const handleExport = () => {
    const rows = (trainings ?? []).map((t: any) => ({
      type: t.type,
      category: t.category,
      status: t.status,
      customer_name: t.customer_name,
      customer_company: t.customer_company,
      trainer_name: t.trainer_name,
      training_date: t.training_date,
      payment_status: t.payment_status,
      total_amount: t.total_amount,
    }));
    exportToExcel(rows, "trainings", {
      sheetName: "Trainings",
      amountColumns: ["total_amount"],
      dateColumns: ["training_date"],
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <Header />
      
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6" />
              Employee Training
            </h1>
            <p className="text-muted-foreground">Manage employee learning and training resources</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={(trainings ?? []).length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>

        <EmployeeTrainingPanel />
      </main>

      <MobileBottomNav />
    </div>
  );
}
