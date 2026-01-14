import { Header } from "@/components/Header";
import { TasksPanel } from "@/components/tasks/TasksPanel";

const Tasks = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <main className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Manage and track all your assigned tasks
          </p>
        </div>
        <TasksPanel />
      </main>
    </div>
  );
};

export default Tasks;
