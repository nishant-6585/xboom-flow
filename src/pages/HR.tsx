import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useHR } from "@/hooks/useHR";
import { useAuth } from "@/hooks/useAuth";
import { AttendanceCard } from "@/components/hr/AttendanceCard";
import { AttendanceCalendar } from "@/components/hr/AttendanceCalendar";
import { LeaveRequestCard } from "@/components/hr/LeaveRequestCard";
import { LeaveApplyDialog } from "@/components/hr/LeaveApplyDialog";
import { LeaveApprovalCard } from "@/components/hr/LeaveApprovalCard";
import { TeamAttendanceOverview } from "@/components/hr/TeamAttendanceOverview";
import { AssetManagementPanel } from "@/components/hr/AssetManagementPanel";
import { HRDocumentsPanel } from "@/components/hr/HRDocumentsPanel";
import { KPIManagementPanel } from "@/components/kpi/KPIManagementPanel";
import { Plus, Calendar, Clock, FileText, Users, LayoutList, Package, FolderOpen, Target } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export default function HR() {
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const {
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
          <TabsList className={`w-full grid ${isHROrAdmin ? 'grid-cols-7' : 'grid-cols-5'} mb-6`}>
            <TabsTrigger value="home" className="gap-1">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </TabsTrigger>
            {isHROrAdmin && (
              <TabsTrigger value="team" className="gap-1">
                <LayoutList className="h-4 w-4" />
                <span className="hidden sm:inline">Team</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="attendance" className="gap-1">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Attendance</span>
            </TabsTrigger>
            <TabsTrigger value="leave" className="gap-1">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Leave</span>
            </TabsTrigger>
            <TabsTrigger value="kpi_management" className="gap-1">
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">KPI Mgmt</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1">
              <FolderOpen className="h-4 w-4" />
              <span className="hidden sm:inline">HR Documents</span>
            </TabsTrigger>
            {isHROrAdmin && (
              <TabsTrigger value="assets" className="gap-1">
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Assets</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="home" className="space-y-4">
            <AttendanceCard
              todayAttendance={todayAttendance}
              weeklyHours={weeklyHours}
              onCheckIn={checkIn}
              onCheckOut={checkOut}
              onStartBreak={startBreak}
              onEndBreak={endBreak}
              loading={loading}
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
            <AttendanceCalendar
              logs={attendanceLogs}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
            />

            <div className="space-y-2">
              <h3 className="font-semibold">Recent Logs</h3>
              {attendanceLogs.slice(0, 5).map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{log.date}</p>
                    <p className="text-sm text-muted-foreground">
                      {log.check_in_time
                        ? new Date(log.check_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '--:--'}{' '}
                      -{' '}
                      {log.check_out_time
                        ? new Date(log.check_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '--:--'}
                    </p>
                    {log.total_break_minutes && log.total_break_minutes > 0 && (
                      <p className="text-xs text-orange-600">
                        Break: {Math.round(log.total_break_minutes)}m
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-medium">
                      {log.working_hours?.toFixed(1) || '0.0'}h
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
