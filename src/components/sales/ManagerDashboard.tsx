import { useRef, useState } from "react";
import { Users, Target, Award, DollarSign, Download, Loader2, Tv } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadDistributionChart } from "./LeadDistributionChart";
import { useSalesLeaderboard } from "@/hooks/useSalesGamification";
import { usePipelineOrders } from "@/hooks/usePipelineOrders";
import { IncludeWebsiteToggle } from "@/components/analytics/IncludeWebsiteToggle";
import { toast } from "sonner";
import { format } from "date-fns";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface ManagerDashboardProps {
  startDate: string;
  endDate: string;
}

export function ManagerDashboard({ startDate, endDate }: ManagerDashboardProps) {
  const { leaderboard } = useSalesLeaderboard(startDate, endDate);
  const { pipelineOrders } = usePipelineOrders();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const totalLeads = leaderboard?.reduce((sum, e) => sum + e.leads_handled, 0) || 0;
  const totalOrders = leaderboard?.reduce((sum, e) => sum + e.orders_won, 0) || 0;
  const totalPipeline = leaderboard?.reduce((sum, e) => sum + Number(e.total_pipeline_value), 0) || 0;
  const totalPoints = leaderboard?.reduce((sum, e) => sum + e.total_points, 0) || 0;

  const handleDownloadPDF = async () => {
    if (!dashboardRef.current) return;
    setDownloading(true);
    try {
      const element = dashboardRef.current;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = 210; // A4 width mm
      const pageHeight = 297; // A4 height mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF("p", "mm", "a4");

      // Title header
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.text("Sales Arena Dashboard Report", 105, 12, { align: "center" });
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.text(
        `${format(new Date(startDate), "dd MMM yyyy")} - ${format(new Date(endDate), "dd MMM yyyy")}  |  Generated: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`,
        105, 18, { align: "center" }
      );

      const topMargin = 22;
      let heightLeft = imgHeight;
      let position = topMargin;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - topMargin);

      while (heightLeft > 0) {
        pdf.addPage();
        position = -(pageHeight - topMargin) * (Math.ceil((imgHeight - heightLeft) / (pageHeight - topMargin)) - 1) - (pageHeight - topMargin) + topMargin;
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // Footer on all pages
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Page ${i} of ${pageCount} | XBoom Sales Report`, 105, 290, { align: "center" });
      }

      pdf.save(`Sales_Dashboard_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      toast.success("Dashboard report downloaded!");
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF report");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Download Button - Top */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Dashboard Overview</h2>
        <div className="flex items-center gap-2">
          <IncludeWebsiteToggle />
          <Button
            onClick={() => window.open('/sales/tv', '_blank', 'noopener,noreferrer')}
            size="sm"
            variant="outline"
            className="gap-2"
            title="Open auto-rotating sales scoreboard for big-screen TV display"
          >
            <Tv className="w-4 h-4" />
            TV View
          </Button>
          <Button onClick={handleDownloadPDF} disabled={downloading} size="sm" className="gap-2">
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {downloading ? "Generating..." : "Download PDF Report"}
          </Button>
        </div>
      </div>

      {/* Capturable Dashboard Content */}
      <div ref={dashboardRef} className="space-y-6 bg-background p-2 rounded-lg">
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
    </div>
  );
}
