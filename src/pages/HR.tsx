import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useHR, EmployeeKPI } from "@/hooks/useHR";
import { useAuth } from "@/hooks/useAuth";
import { AttendanceCard } from "@/components/hr/AttendanceCard";
import { AttendanceCalendar } from "@/components/hr/AttendanceCalendar";
import { LeaveRequestCard } from "@/components/hr/LeaveRequestCard";
import { LeaveApplyDialog } from "@/components/hr/LeaveApplyDialog";
import { LeaveApprovalCard } from "@/components/hr/LeaveApprovalCard";
import { KPICard } from "@/components/hr/KPICard";
import { Plus, Calendar, Clock, FileText, Users } from "lucide-react";
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
    loading,
    checkIn,
    checkOut,
    startBreak,
    endBreak,
    applyLeave,
    approveLeave,
    getEmployeeKPI,
    fetchAttendanceLogs,
  } = useHR();

  const [activeTab, setActiveTab] = useState("home");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [myKPI, setMyKPI] = useState<EmployeeKPI | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  const isAdmin = role === 'admin';
  const myLeaves = leaveRequests.filter((lr) => lr.employee_id === myEmployee?.id);

  useEffect(() => {
    if (myEmployee) {
      setKpiLoading(true);
      getEmployeeKPI(myEmployee.id).then((kpi) => {
        setMyKPI(kpi);
        setKpiLoading(false);
      });
    }
  }, [myEmployee, getEmployeeKPI]);

  useEffect(() => {
    if (myEmployee) {
      fetchAttendanceLogs(myEmployee.id, calendarMonth);
    }
  }, [myEmployee, calendarMonth, fetchAttendanceLogs]);

  // Show loading state
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
          <TabsList className="w-full grid grid-cols-4 mb-6">
            <TabsTrigger value="home" className="gap-1">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Attendance</span>
            </TabsTrigger>
            <TabsTrigger value="leave" className="gap-1">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Leave</span>
            </TabsTrigger>
            <TabsTrigger value="kpi" className="gap-1">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">KPI</span>
            </TabsTrigger>
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

            {isAdmin && pendingLeaves.length > 0 && (
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

            <KPICard kpi={myKPI} loading={kpiLoading} />
          </TabsContent>

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

            {isAdmin && pendingLeaves.length > 0 && (
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

          <TabsContent value="kpi" className="space-y-4">
            <KPICard kpi={myKPI} loading={kpiLoading} />

            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">
                  {myKPI?.present_days || 0}
                </p>
                <p className="text-sm text-muted-foreground">Days Present</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {myKPI?.leave_days || 0}
                </p>
                <p className="text-sm text-muted-foreground">Leave Days</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {myKPI?.total_working_hours?.toFixed(1) || 0}h
                </p>
                <p className="text-sm text-muted-foreground">Total Hours</p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-primary">
                  {myKPI?.attendance_percentage || 0}%
                </p>
                <p className="text-sm text-muted-foreground">Attendance Rate</p>
              </div>
            </div>
          </TabsContent>
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
