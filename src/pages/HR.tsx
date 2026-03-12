import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
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

import { AssetManagementPanel } from "@/components/hr/AssetManagementPanel";
import { HRDocumentsPanel } from "@/components/hr/HRDocumentsPanel";
import { KPIManagementPanel } from "@/components/kpi/KPIManagementPanel";
import { ProvisionalCheckoutBanner } from "@/components/attendance/ProvisionalCheckoutBanner";
import { Plus, Calendar, Clock, FileText, Users, Package, FolderOpen, Target, UserSearch, User, Wallet, Receipt, History, Building2, CreditCard, LogOut, Leaf } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { CandidatesPanel } from "@/components/candidates/CandidatesPanel";
import { EmployeesPanel } from "@/components/hr/EmployeesPanel";
import { SalarySheetsList } from "@/components/salary/SalarySheetsList";
import { EmployeePayslipsPanel } from "@/components/salary/EmployeePayslipsPanel";
import { SalaryHistoryPanel } from "@/components/salary/SalaryHistoryPanel";
import { EmployeeFinancialDetailsPanel } from "@/components/hr/EmployeeFinancialDetailsPanel";
import { BankUpdateRequestsPanel } from "@/components/hr/BankUpdateRequestsPanel";
import { MyFinancialDetailsPanel } from "@/components/hr/MyFinancialDetailsPanel";
import { ResignationPanel } from "@/components/hr/ResignationPanel";
import { LeaveBalancePanel } from "@/components/hr/LeaveBalancePanel";
import { supabase } from "@/integrations/supabase/client";
import { AttendanceLog } from "@/hooks/useHR";


export default function HR() {
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const {
    employees, myEmployee, todayAttendance, weeklyHours, attendanceLogs,
    leaveRequests, pendingLeaves, loading, checkIn, checkOut, startBreak,
    endBreak, applyLeave, approveLeave, fetchAttendanceLogs,
  } = useHR();

  const [activeTab, setActiveTab] = useState("home");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveFilter, setLeaveFilter] = useState('all');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [yesterdayLog, setYesterdayLog] = useState<AttendanceLog | null>(null);

  const isAdmin = role === 'admin';
  const isHROrAdmin = role === 'admin' || role === 'hr';
  const isFinance = role === 'finance' || role === 'admin';
  const myLeaves = leaveRequests.filter((lr) => lr.employee_id === myEmployee?.id);

  useEffect(() => {
    if (myEmployee) fetchAttendanceLogs(myEmployee.id, calendarMonth);
  }, [myEmployee, calendarMonth, fetchAttendanceLogs]);

  const fetchYesterdayLog = useCallback(async () => {
    if (!myEmployee) return;
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const { data } = await supabase.from('attendance_logs').select('*').eq('employee_id', myEmployee.id).eq('date', yesterday).maybeSingle();
    setYesterdayLog(data as AttendanceLog | null);
  }, [myEmployee]);

  useEffect(() => { fetchYesterdayLog(); }, [fetchYesterdayLog]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <Header />
        <main className="container mx-auto px-4 py-6">
          <div className="mb-6"><div className="h-8 bg-muted rounded w-1/4 animate-pulse mb-2" /><div className="h-4 bg-muted rounded w-1/2 animate-pulse" /></div>
          <div className="space-y-4"><div className="h-48 bg-muted rounded-lg animate-pulse" /><div className="h-32 bg-muted rounded-lg animate-pulse" /></div>
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
            <p className="text-muted-foreground">Please contact an administrator to set up your employee profile.</p>
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
          <p className="text-muted-foreground">Manage attendance, leave, and view your performance</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-6">
            <TabsList className="flex flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="home" className="gap-1.5 whitespace-nowrap"><Clock className="h-4 w-4 shrink-0" /><span>Home</span></TabsTrigger>
              <TabsTrigger value="attendance" className="gap-1.5 whitespace-nowrap"><Calendar className="h-4 w-4 shrink-0" /><span>Attendance</span></TabsTrigger>
              <TabsTrigger value="leave" className="gap-1.5 whitespace-nowrap"><FileText className="h-4 w-4 shrink-0" /><span>Leave</span></TabsTrigger>
              
              <TabsTrigger value="kpi_management" className="gap-1.5 whitespace-nowrap"><Target className="h-4 w-4 shrink-0" /><span>KPI</span></TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 whitespace-nowrap"><FolderOpen className="h-4 w-4 shrink-0" /><span>Documents</span></TabsTrigger>
              <TabsTrigger value="my_financial" className="gap-1.5 whitespace-nowrap"><CreditCard className="h-4 w-4 shrink-0" /><span>My Financial Details</span></TabsTrigger>
              {isHROrAdmin && (
                <TabsTrigger value="assets" className="gap-1.5 whitespace-nowrap"><Package className="h-4 w-4 shrink-0" /><span>Assets</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="candidates" className="gap-1.5 whitespace-nowrap"><UserSearch className="h-4 w-4 shrink-0" /><span>Candidates</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="financial_details" className="gap-1.5 whitespace-nowrap"><Wallet className="h-4 w-4 shrink-0" /><span>Financial Details</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="bank_requests" className="gap-1.5 whitespace-nowrap"><Building2 className="h-4 w-4 shrink-0" /><span>Bank Requests</span></TabsTrigger>
              )}
              {(isHROrAdmin || isFinance) && (
                <TabsTrigger value="salary" className="gap-1.5 whitespace-nowrap"><Wallet className="h-4 w-4 shrink-0" /><span>Salary Sheets</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="salary_history" className="gap-1.5 whitespace-nowrap"><History className="h-4 w-4 shrink-0" /><span>Salary History</span></TabsTrigger>
              )}
              <TabsTrigger value="payslips" className="gap-1.5 whitespace-nowrap"><Receipt className="h-4 w-4 shrink-0" /><span>Payslips</span></TabsTrigger>
              <TabsTrigger value="resignation" className="gap-1.5 whitespace-nowrap"><LogOut className="h-4 w-4 shrink-0" /><span>Resignation</span></TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="home" className="space-y-4">
            <AttendanceCard todayAttendance={todayAttendance} weeklyHours={weeklyHours} />
            {isHROrAdmin && pendingLeaves.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Pending Leave Approvals ({pendingLeaves.length})</h3>
                {pendingLeaves.slice(0, 3).map((leave) => <LeaveApprovalCard key={leave.id} leave={leave} onApprove={approveLeave} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="attendance" className="space-y-4">
            <Tabs defaultValue="my">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="my" className="gap-1.5 text-xs sm:text-sm"><User className="h-4 w-4 shrink-0" /><span className="truncate">My Attendance</span></TabsTrigger>
                {isHROrAdmin && <TabsTrigger value="team" className="gap-1.5 text-xs sm:text-sm"><Users className="h-4 w-4 shrink-0" /><span className="truncate">Team Attendance</span></TabsTrigger>}
              </TabsList>
              <TabsContent value="my" className="mt-4 space-y-4">
                <ProvisionalCheckoutBanner yesterdayLog={yesterdayLog} onCorrected={() => { fetchYesterdayLog(); if (myEmployee) fetchAttendanceLogs(myEmployee.id, calendarMonth); }} />
                <AttendanceSection employeeId={myEmployee?.id} todayAttendance={todayAttendance} weeklyHours={weeklyHours} attendanceLogs={attendanceLogs} calendarMonth={calendarMonth} onMonthChange={setCalendarMonth}
                  onRefresh={() => { fetchYesterdayLog(); if (myEmployee) fetchAttendanceLogs(myEmployee.id, calendarMonth); }} />
              </TabsContent>
              {isHROrAdmin && <TabsContent value="team" className="mt-4"><TeamAttendancePanel employees={employees} /></TabsContent>}
            </Tabs>
          </TabsContent>

          <TabsContent value="leave" className="space-y-4">
            <LeaveBalancePanel employeeId={myEmployee?.id} />
            <Button className="w-full" onClick={() => setLeaveDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Apply for Leave</Button>
            <div className="space-y-3">
              <h3 className="font-semibold">My Leave Requests</h3>
              {myLeaves.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'All', filter: 'all', count: myLeaves.length },
                    { label: 'Requested', filter: 'submitted', count: myLeaves.filter(l => l.status === 'submitted').length },
                    { label: 'Approved', filter: 'approved', count: myLeaves.filter(l => l.status === 'approved').length },
                    { label: 'Rejected', filter: 'rejected', count: myLeaves.filter(l => l.status === 'rejected').length },
                  ].filter(f => f.filter === 'all' || f.count > 0).map(f => (
                    <Button key={f.filter} variant={leaveFilter === f.filter ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setLeaveFilter(f.filter)}>
                      {f.label} ({f.count})
                    </Button>
                  ))}
                </div>
              )}
              {myLeaves.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No leave requests yet</p>
              ) : (
                (leaveFilter === 'all' ? myLeaves : myLeaves.filter(l => l.status === leaveFilter)).length === 0 ? (
                  <p className="text-center py-4 text-muted-foreground text-sm">No {leaveFilter} requests</p>
                ) : (
                  (leaveFilter === 'all' ? myLeaves : myLeaves.filter(l => l.status === leaveFilter)).map((leave) => <LeaveRequestCard key={leave.id} leave={leave} />)
                )
              )}
            </div>
            {isHROrAdmin && pendingLeaves.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold">Team Leave Requests</h3>
                {pendingLeaves.map((leave) => <LeaveApprovalCard key={leave.id} leave={leave} onApprove={approveLeave} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="kpi_management" className="space-y-4"><KPIManagementPanel /></TabsContent>
          
          <TabsContent value="documents" className="space-y-4"><HRDocumentsPanel /></TabsContent>
          <TabsContent value="my_financial"><MyFinancialDetailsPanel /></TabsContent>
          {isHROrAdmin && <TabsContent value="assets" className="space-y-4"><AssetManagementPanel /></TabsContent>}
          {isHROrAdmin && <TabsContent value="candidates"><CandidatesPanel /></TabsContent>}
          {isHROrAdmin && <TabsContent value="financial_details"><EmployeeFinancialDetailsPanel /></TabsContent>}
          {isHROrAdmin && <TabsContent value="bank_requests"><BankUpdateRequestsPanel /></TabsContent>}
          {(isHROrAdmin || isFinance) && <TabsContent value="salary"><SalarySheetsList /></TabsContent>}
          {isHROrAdmin && <TabsContent value="salary_history"><SalaryHistoryPanel /></TabsContent>}
          <TabsContent value="payslips"><EmployeePayslipsPanel /></TabsContent>
          <TabsContent value="resignation"><ResignationPanel /></TabsContent>
        </Tabs>
      </main>

      <LeaveApplyDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen} onSubmit={applyLeave} />
      {isMobile && <MobileBottomNav />}
    </div>
  );
}
