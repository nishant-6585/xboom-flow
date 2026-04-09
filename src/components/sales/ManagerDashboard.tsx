import { Users, Target, Award, DollarSign, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadDistributionChart } from "./LeadDistributionChart";
import { useSalesLeaderboard } from "@/hooks/useSalesGamification";
import { usePipelineOrders } from "@/hooks/usePipelineOrders";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface ManagerDashboardProps {
  startDate: string;
  endDate: string;
}

export function ManagerDashboard({ startDate, endDate }: ManagerDashboardProps) {
  const { leaderboard } = useSalesLeaderboard(startDate, endDate);
  const { pipelineOrders } = usePipelineOrders();

  const totalLeads = leaderboard?.reduce((sum, e) => sum + e.leads_handled, 0) || 0;
  const totalOrders = leaderboard?.reduce((sum, e) => sum + e.orders_won, 0) || 0;
  const totalPipeline = leaderboard?.reduce((sum, e) => sum + Number(e.total_pipeline_value), 0) || 0;
  const totalPoints = leaderboard?.reduce((sum, e) => sum + e.total_points, 0) || 0;

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Header
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Sales Arena Dashboard Report", pageWidth / 2, 20, { align: "center" });
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Period: ${format(new Date(startDate), "dd MMM yyyy")} - ${format(new Date(endDate), "dd MMM yyyy")}`, pageWidth / 2, 28, { align: "center" });
      doc.text(`Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, pageWidth / 2, 34, { align: "center" });

      // Summary Stats
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Summary", 14, 46);

      autoTable(doc, {
        startY: 50,
        head: [["Metric", "Value"]],
        body: [
          ["Team Leads", totalLeads.toString()],
          ["Orders Won", totalOrders.toString()],
          ["Pipeline Value", `Rs. ${(totalPipeline / 100000).toFixed(1)}L`],
          ["Team Points", totalPoints.toLocaleString()],
        ],
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246], fontStyle: "bold" },
        styles: { fontSize: 11 },
      });

      // Salesperson Distribution
      if (leaderboard && leaderboard.length > 0) {
        const finalY = (doc as any).lastAutoTable?.finalY || 90;
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Lead Distribution by Salesperson", 14, finalY + 12);

        autoTable(doc, {
          startY: finalY + 16,
          head: [["Salesperson", "Leads", "Prospects", "Pipeline", "Orders Won", "Points"]],
          body: leaderboard.map((sp) => [
            sp.name,
            sp.leads_handled.toString(),
            (sp.prospects_converted || 0).toString(),
            (sp.pipeline_created || 0).toString(),
            sp.orders_won.toString(),
            sp.total_points.toString(),
          ]),
          theme: "grid",
          headStyles: { fillColor: [16, 185, 129], fontStyle: "bold" },
          styles: { fontSize: 10 },
        });
      }

      // Pipeline Summary
      if (pipelineOrders && pipelineOrders.length > 0) {
        const finalY2 = (doc as any).lastAutoTable?.finalY || 140;
        
        if (finalY2 > 240) doc.addPage();
        const y = finalY2 > 240 ? 20 : finalY2 + 12;
        
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Active Pipeline Orders", 14, y);

        const pipelineData = pipelineOrders.slice(0, 20).map((o) => [
          o.customer_name || "-",
          o.product_name || "-",
          `Rs. ${Number(o.expected_value || 0).toLocaleString()}`,
          o.stage || "-",
          o.probability ? `${o.probability}%` : "-",
        ]);

        autoTable(doc, {
          startY: y + 4,
          head: [["Customer", "Product", "Value", "Stage", "Probability"]],
          body: pipelineData,
          theme: "grid",
          headStyles: { fillColor: [139, 92, 246], fontStyle: "bold" },
          styles: { fontSize: 9 },
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`Page ${i} of ${pageCount} | XBoom Sales Report`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: "center" });
      }

      doc.save(`Sales_Dashboard_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("Dashboard report downloaded!");
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF report");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Download */}
      <div className="flex justify-end">
        <Button onClick={handleDownloadPDF} variant="outline" size="sm" className="gap-2">
          <Download className="w-4 h-4" />
          Download PDF Report
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-5 h-5" />
              <span className="text-sm opacity-80">Team Leads</span>
            </div>
            <p className="text-3xl font-bold">{totalLeads}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-5 h-5" />
              <span className="text-sm opacity-80">Orders Won</span>
            </div>
            <p className="text-3xl font-bold">{totalOrders}</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-purple-500 to-violet-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5" />
              <span className="text-sm opacity-80">Pipeline Value</span>
            </div>
            <p className="text-3xl font-bold">₹{(totalPipeline / 100000).toFixed(1)}L</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="p-4 bg-gradient-to-br from-amber-500 to-orange-600 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5" />
              <span className="text-sm opacity-80">Team Points</span>
            </div>
            <p className="text-3xl font-bold">{totalPoints.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Lead Distribution */}
      <LeadDistributionChart startDate={startDate} endDate={endDate} />
    </div>
  );
}
