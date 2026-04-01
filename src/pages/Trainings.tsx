import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { EmployeeTrainingPanel } from "@/components/trainings/EmployeeTrainingPanel";
import { BookOpen } from "lucide-react";

export default function Trainings() {
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
        </div>

        <EmployeeTrainingPanel />
      </main>

      <MobileBottomNav />
    </div>
  );
}
