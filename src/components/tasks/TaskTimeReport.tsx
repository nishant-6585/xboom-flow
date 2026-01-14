import { useState } from "react";
import { Task, TASK_TYPES } from "@/hooks/useTasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, FileText, Calendar } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, subDays, subWeeks, subMonths, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatTimeSpent } from "./TaskTimer";

interface TaskTimeReportProps {
  tasks: Task[];
}

type ReportPeriod = "daily" | "weekly" | "monthly";

interface DayReport {
  date: string;
  tasks: {
    title: string;
    taskType: string;
    assignedTo: string;
    assignedBy: string;
    timeSpent: number;
    stage: string;
  }[];
  totalSeconds: number;
}

export function TaskTimeReport({ tasks }: TaskTimeReportProps) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<ReportPeriod>("daily");
  const [exportFormat, setExportFormat] = useState<"excel" | "pdf">("excel");

  const getDateRange = (period: ReportPeriod) => {
    const now = new Date();
    switch (period) {
      case "daily":
        return {
          start: startOfDay(subDays(now, 6)),
          end: endOfDay(now),
          label: "Last 7 Days",
        };
      case "weekly":
        return {
          start: startOfWeek(subWeeks(now, 3), { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
          label: "Last 4 Weeks",
        };
      case "monthly":
        return {
          start: startOfMonth(subMonths(now, 2)),
          end: endOfMonth(now),
          label: "Last 3 Months",
        };
    }
  };

  const getTaskTypeLabel = (type: string) => {
    return TASK_TYPES.find((t) => t.value === type)?.label || type;
  };

  const generateDayWiseReport = (period: ReportPeriod): DayReport[] => {
    const { start, end } = getDateRange(period);
    const days = eachDayOfInterval({ start, end });

    return days.map((day) => {
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      // Filter tasks that have time spent and were worked on during this period
      const dayTasks = tasks
        .filter((t) => {
          if (!t.time_spent_seconds || t.time_spent_seconds === 0) return false;
          
          // For now, we'll include tasks that have time spent
          // In a real app, you'd track time entries with timestamps
          const taskDate = t.timer_started_at 
            ? parseISO(t.timer_started_at) 
            : parseISO(t.updated_at);
          
          return taskDate >= dayStart && taskDate <= dayEnd;
        })
        .map((t) => ({
          title: t.title,
          taskType: getTaskTypeLabel(t.task_type),
          assignedTo: t.assigned_to_name,
          assignedBy: t.assigned_by_name || "System",
          timeSpent: t.time_spent_seconds || 0,
          stage: t.stage || "new",
        }));

      const totalSeconds = dayTasks.reduce((sum, t) => sum + t.timeSpent, 0);

      return {
        date: format(day, "yyyy-MM-dd"),
        tasks: dayTasks,
        totalSeconds,
      };
    });
  };

  const downloadExcel = () => {
    const reportData = generateDayWiseReport(period);
    const { label } = getDateRange(period);

    // Flatten data for Excel
    const flatData: any[] = [];
    let grandTotal = 0;

    reportData.forEach((day) => {
      if (day.tasks.length > 0) {
        day.tasks.forEach((task, index) => {
          flatData.push({
            Date: index === 0 ? format(new Date(day.date), "dd MMM yyyy") : "",
            Task: task.title,
            "Task Type": task.taskType,
            "Assigned To": task.assignedTo,
            "Assigned By": task.assignedBy,
            Stage: task.stage.charAt(0).toUpperCase() + task.stage.slice(1).replace("_", " "),
            "Time Spent": formatTimeSpent(task.timeSpent),
            "Time (Minutes)": Math.round(task.timeSpent / 60),
          });
        });
        // Add day total row
        flatData.push({
          Date: "",
          Task: "Day Total",
          "Task Type": "",
          "Assigned To": "",
          "Assigned By": "",
          Stage: "",
          "Time Spent": formatTimeSpent(day.totalSeconds),
          "Time (Minutes)": Math.round(day.totalSeconds / 60),
        });
        grandTotal += day.totalSeconds;
      }
    });

    // Add grand total
    flatData.push({
      Date: "GRAND TOTAL",
      Task: "",
      "Task Type": "",
      "Assigned To": "",
      "Assigned By": "",
      Stage: "",
      "Time Spent": formatTimeSpent(grandTotal),
      "Time (Minutes)": Math.round(grandTotal / 60),
    });

    const worksheet = XLSX.utils.json_to_sheet(flatData);
    const workbook = XLSX.utils.book_new();

    worksheet["!cols"] = [
      { wch: 15 },
      { wch: 35 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Task Time Report");
    XLSX.writeFile(workbook, `task-time-report-${period}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    setOpen(false);
  };

  const downloadPDF = () => {
    const reportData = generateDayWiseReport(period);
    const { label } = getDateRange(period);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Task Time Report", 14, 15);

    // Subtitle
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Period: ${label}`, 14, 22);

    // Generation date
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, 28);

    // Table data
    const tableData: string[][] = [];
    let grandTotal = 0;

    reportData.forEach((day) => {
      if (day.tasks.length > 0) {
        day.tasks.forEach((task, index) => {
          tableData.push([
            index === 0 ? format(new Date(day.date), "dd MMM yyyy") : "",
            task.title.substring(0, 30) + (task.title.length > 30 ? "..." : ""),
            task.taskType,
            task.assignedTo,
            task.assignedBy,
            task.stage.charAt(0).toUpperCase() + task.stage.slice(1).replace("_", " "),
            formatTimeSpent(task.timeSpent),
          ]);
        });
        // Day total
        tableData.push([
          "",
          "Day Total",
          "",
          "",
          "",
          "",
          formatTimeSpent(day.totalSeconds),
        ]);
        grandTotal += day.totalSeconds;
      }
    });

    // Grand total
    tableData.push([
      "GRAND TOTAL",
      "",
      "",
      "",
      "",
      "",
      formatTimeSpent(grandTotal),
    ]);

    autoTable(doc, {
      head: [["Date", "Task", "Type", "Assigned To", "Assigned By", "Stage", "Time Spent"]],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 55 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30 },
        5: { cellWidth: 22 },
        6: { cellWidth: 22 },
      },
      didParseCell: (data) => {
        // Style total rows
        if (data.row.raw && (data.row.raw[1] === "Day Total" || data.row.raw[0] === "GRAND TOTAL")) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [229, 231, 235];
        }
      },
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 25, doc.internal.pageSize.getHeight() - 10);
      doc.text("Xboom Task Management", 14, doc.internal.pageSize.getHeight() - 10);
    }

    doc.save(`task-time-report-${period}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    setOpen(false);
  };

  const handleDownload = () => {
    if (exportFormat === "excel") {
      downloadExcel();
    } else {
      downloadPDF();
    }
  };

  // Calculate summary for display
  const allTimeSpent = tasks.reduce((sum, t) => sum + (t.time_spent_seconds || 0), 0);
  const tasksWithTime = tasks.filter((t) => (t.time_spent_seconds || 0) > 0).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-1" />
          Time Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Download Task Time Report
          </DialogTitle>
          <DialogDescription>
            Generate a report of time spent on tasks
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="p-4 bg-muted/50 rounded-lg space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tasks with tracked time:</span>
              <span className="font-medium">{tasksWithTime}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total time tracked:</span>
              <span className="font-medium">{formatTimeSpent(allTimeSpent)}</span>
            </div>
          </div>

          {/* Period Selection */}
          <div className="space-y-2">
            <Label>Report Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Daily (Last 7 Days)
                  </div>
                </SelectItem>
                <SelectItem value="weekly">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Weekly (Last 4 Weeks)
                  </div>
                </SelectItem>
                <SelectItem value="monthly">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Monthly (Last 3 Months)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Format Selection */}
          <div className="space-y-2">
            <Label>Export Format</Label>
            <div className="flex gap-2">
              <Button
                variant={exportFormat === "excel" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setExportFormat("excel")}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button
                variant={exportFormat === "pdf" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setExportFormat("pdf")}
              >
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleDownload}>
            <Download className="w-4 h-4 mr-2" />
            Download Report
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
