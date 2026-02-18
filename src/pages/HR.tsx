import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useHR } from "@/hooks/useHR";
import { useAuth } from "@/hooks/useAuth";
import { AttendanceCard } from "@/components/hr/AttendanceCard";
import { AttendanceSection } from "@/components/hr/AttendanceSection";
import { TeamAttendancePanel } from "@/components/hr/TeamAttendancePanel";
import { LeaveRequestCard } from "@/components/hr/LeaveRequestCard";
import { LeaveApplyDialog } from "@/components/hr/LeaveApplyDialog";
import { LeaveApprovalCard } from "@/components/hr/LeaveApprovalCard";
import { TeamAttendanceOverview } from "@/components/hr/TeamAttendanceOverview";
import { AssetManagementPanel } from "@/components/hr/AssetManagementPanel";
import { HRDocumentsPanel } from "@/components/hr/HRDocumentsPanel";
import { KPIManagementPanel } from "@/components/kpi/KPIManagementPanel";
import { Plus, Calendar, Clock, FileText, Users, LayoutList, Package, FolderOpen, Target, UserSearch, User } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { CandidatesPanel } from "@/components/candidates/CandidatesPanel";


export default function HR() {
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const {
    employees,
    myEmployee,
    todayAttendance,
    weeklyHours,
    attendanceLogs,
    leaveRequests,
    pendingLeaves,
    teamAttendanceStatus,
    loading,
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    applyLeave,
    approveLeave,
    fetchAttendanceLogs,
    fetchTeamAttendanceStatus,
  } = useHR();

  const [activeTab, setActiveTab] = useState("home");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const isAdmin = role === 'admin';
  const isHROrAdmin = role === 'admin' || role === 'hr';
  const myLeaves = leaveRequests.filter((lr) => lr.employee_id === myEmployee?.id);

  useEffect(() => {
    if (myEmployee) {
      fetchAttendanceLogs(myEmployee.id, calendarMonth);
    }
  }, [myEmployee, calendarMonth, fetchAttendanceLogs]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <div className="mb-6">
            <div className="h-8 bg-muted rounded w-1/4 animate-pulse mb-2" />
            <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-48 bg-muted rounded-lg animate-pulse" />
            <div className="h-32 bg-muted rounded-lg animate-pulse" />
          </div>
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
    );
  }

  if (!myEmployee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Employee Record Found</h2>
            <p className="text-muted-foreground">
              Please contact an administrator to set up your employee profile.
            </p>
          </div>
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      <main className="container mx-auto px-4 py-6 pb-24 md:pb-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">HR Portal</h1>
          <p className="text-muted-foreground">
            Manage attendance, leave, and view your performance
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto mb-6">
            <TabsList className="inline-flex w-max min-w-full">
              <TabsTrigger value="home" className="gap-1.5 whitespace-nowrap">
                <Clock className="h-4 w-4 shrink-0" />
                <span>Home</span>
              </TabsTrigger>
              {isHROrAdmin && (
                <TabsTrigger value="team" className="gap-1.5 whitespace-nowrap">
                  <LayoutList className="h-4 w-4 shrink-0" />
                  <span>Team</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="attendance" className="gap-1.5 whitespace-nowrap">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>Attendance</span>
              </TabsTrigger>
              <TabsTrigger value="leave" className="gap-1.5 whitespace-nowrap">
                <FileText className="h-4 w-4 shrink-0" />
                <span>Leave</span>
              </TabsTrigger>
              <TabsTrigger value="kpi_management" className="gap-1.5 whitespace-nowrap">
                <Target className="h-4 w-4 shrink-0" />
                <span>KPI</span>
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 whitespace-nowrap">
                <FolderOpen className="h-4 w-4 shrink-0" />
                <span>Documents</span>
              </TabsTrigger>
              {isHROrAdmin && (
                <TabsTrigger value="assets" className="gap-1.5 whitespace-nowrap">
                  <Package className="h-4 w-4 shrink-0" />
                  <span>Assets</span>
                </TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="candidates" className="gap-1.5 whitespace-nowrap">
                  <UserSearch className="h-4 w-4 shrink-0" />
                  <span>Candidates</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="home" className="space-y-4">
            <AttendanceCard
              todayAttendance={todayAttendance}
              weeklyHours={weeklyHours}
            />

            {isHROrAdmin && pendingLeaves.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Pending Leave Approvals ({pendingLeaves.length})
                </h3>
                {pendingLeaves.slice(0, 3).map((leave) => (
                  <LeaveApprovalCard
                    key={leave.id}
                    leave={leave}
                    onApprove={approveLeave}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {isHROrAdmin && (
            <TabsContent value="team" className="space-y-4">
              <TeamAttendanceOverview
                teamStatus={teamAttendanceStatus}
                loading={loading}
              />
            </TabsContent>
          )}

          <TabsContent value="attendance" className="space-y-4">
            <Tabs defaultValue="my">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="my" className="flex-1 sm:flex-none gap-1.5">
                  <User className="h-4 w-4" />
                  My Attendance
                </TabsTrigger>
                {isHROrAdmin && (
                  <TabsTrigger value="team" className="flex-1 sm:flex-none gap-1.5">
                    <Users className="h-4 w-4" />
                    Team Attendance
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="my" className="mt-4">
                <AttendanceSection
                  todayAttendance={todayAttendance}
                  weeklyHours={weeklyHours}
                  attendanceLogs={attendanceLogs}
                  calendarMonth={calendarMonth}
                  onMonthChange={setCalendarMonth}
                />
              </TabsContent>

              {isHROrAdmin && (
                <TabsContent value="team" className="mt-4">
                  <TeamAttendancePanel employees={employees} />
                </TabsContent>
              )}
            </Tabs>
          </TabsContent>

          <TabsContent value="leave" className="space-y-4">
            <Button className="w-full" onClick={() => setLeaveDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Apply for Leave
            </Button>

            <div className="space-y-3">
              <h3 className="font-semibold">My Leave Requests</h3>
              {myLeaves.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No leave requests yet
                </p>
              ) : (
                myLeaves.map((leave) => (
                  <LeaveRequestCard key={leave.id} leave={leave} />
                ))
              )}
            </div>

            {isHROrAdmin && pendingLeaves.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold">Team Leave Requests</h3>
                {pendingLeaves.map((leave) => (
                  <LeaveApprovalCard
                    key={leave.id}
                    leave={leave}
                    onApprove={approveLeave}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="kpi_management" className="space-y-4">
            <KPIManagementPanel />
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <HRDocumentsPanel />
          </TabsContent>

          {isHROrAdmin && (
            <TabsContent value="assets" className="space-y-4">
              <AssetManagementPanel />
            </TabsContent>
          )}

          {isHROrAdmin && (
            <TabsContent value="candidates">
              <CandidatesPanel />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <LeaveApplyDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        onSubmit={applyLeave}
      />

      {isMobile && <MobileBottomNav />}
    </div>
  );
}
