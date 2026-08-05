import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format, subDays } from "date-fns";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useHR } from "@/hooks/useHR";
import { useAuth } from "@/hooks/useAuth";
import { MyAttendanceCalendarView } from "@/components/hr/MyAttendanceCalendarView";
import { TeamAttendancePanel } from "@/components/hr/TeamAttendancePanel";
import { LeaveRequestCard } from "@/components/hr/LeaveRequestCard";
import { LeaveApplyDialog } from "@/components/hr/LeaveApplyDialog";
import { LeaveApprovalCard } from "@/components/hr/LeaveApprovalCard";
import { BulkLeaveApprovalSection } from "@/components/hr/BulkLeaveApprovalSection";
import { CompOffApprovalsInbox } from "@/components/hr/CompOffApprovalsInbox";
import { HRLeaveApplyDialog } from "@/components/hr/HRLeaveApplyDialog";

import { AssetManagementPanel } from "@/components/hr/AssetManagementPanel";
import { HRDocumentsPanel } from "@/components/hr/HRDocumentsPanel";
import { ProcessDocumentsPanel } from "@/components/hr/ProcessDocumentsPanel";
import { KPIManagementPanel } from "@/components/kpi/KPIManagementPanel";
import { Plus, Calendar, CalendarDays, Clock, FileText, Users, Package, FolderOpen, Target, UserSearch, User, Wallet, Receipt, History, Building2, CreditCard, LogOut, ClipboardCheck, ClipboardX, UserPlus, BookOpen, Briefcase, Share2, BookMarked } from "lucide-react";
import { EmployeeTrainingPanel } from "@/components/trainings/EmployeeTrainingPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { CandidatesPanel } from "@/components/candidates/CandidatesPanel";
import { EmployeesPanel } from "@/components/hr/EmployeesPanel";
import { SalarySheetsList } from "@/components/salary/SalarySheetsList";
import { EmployeePayslipsPanel } from "@/components/salary/EmployeePayslipsPanel";
import { SalaryHistoryPanel } from "@/components/salary/SalaryHistoryPanel";
import { EmployeeFinancialDetailsPanel } from "@/components/hr/EmployeeFinancialDetailsPanel";
import { EmployeeFinancialDetailsList } from "@/components/hr/EmployeeFinancialDetailsList";
import { BankUpdateRequestsPanel } from "@/components/hr/BankUpdateRequestsPanel";
import { MyFinancialDetailsPanel } from "@/components/hr/MyFinancialDetailsPanel";
import { ResignationPanel } from "@/components/hr/ResignationPanel";
import { LeaveBalancePanel } from "@/components/hr/LeaveBalancePanel";
import { ChecklistPanel } from "@/components/hr/ChecklistPanel";
import { LeaveHistoryPanel } from "@/components/hr/LeaveHistoryPanel";
import { HiringPanel } from "@/components/hr/HiringPanel";
import { ReferralsPanel } from "@/components/hr/ReferralsPanel";
import { MonthlyPulsePanel } from "@/components/hr/MonthlyPulsePanel";
import { HolidaysManager } from "@/components/hr/HolidaysManager";
import { Newspaper, Gift } from "lucide-react";
import { BirthdaySongsPanel } from "@/components/hr/BirthdaySongsPanel";
import { supabase } from "@/integrations/supabase/client";
import { AttendanceLog } from "@/hooks/useHR";


export default function HR() {
  const isMobile = useIsMobile();
  const { role } = useAuth();
  const {
    employees, myEmployee, todayAttendance, weeklyHours, attendanceLogs,
    leaveRequests, pendingLeaves, loading, checkIn, checkOut, startBreak,
    endBreak, applyLeave, applyLeaveForEmployee, approveLeave, fetchAttendanceLogs,
  } = useHR();

  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || "home");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [hrLeaveDialogOpen, setHRLeaveDialogOpen] = useState(false);
  const [leavePrefillDate, setLeavePrefillDate] = useState<string | undefined>(undefined);
  const [leaveFilter, setLeaveFilter] = useState('all');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [yesterdayLog, setYesterdayLog] = useState<AttendanceLog | null>(null);

  const isAdmin = role === 'admin';
  const isHROrAdmin = role === 'admin' || role === 'hr';
  const isCompoffApprover = isHROrAdmin || role === 'sales_manager';
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
              <TabsTrigger value="home" className="gap-1.5 whitespace-nowrap"><Calendar className="h-4 w-4 shrink-0" /><span>My Attendance</span></TabsTrigger>
              {isHROrAdmin && (
                <TabsTrigger value="employees" className="gap-1.5 whitespace-nowrap"><Users className="h-4 w-4 shrink-0" /><span>Employees</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="team_attendance" className="gap-1.5 whitespace-nowrap"><Users className="h-4 w-4 shrink-0" /><span>Team Attendance</span></TabsTrigger>
              )}
              <TabsTrigger value="leave" className="gap-1.5 whitespace-nowrap"><FileText className="h-4 w-4 shrink-0" /><span>Leave</span></TabsTrigger>
              {isHROrAdmin && (
                <TabsTrigger value="training" className="gap-1.5 whitespace-nowrap"><BookOpen className="h-4 w-4 shrink-0" /><span>Training</span></TabsTrigger>
              )}
              <TabsTrigger value="kpi_management" className="gap-1.5 whitespace-nowrap"><Target className="h-4 w-4 shrink-0" /><span>KPI</span></TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5 whitespace-nowrap"><FolderOpen className="h-4 w-4 shrink-0" /><span>Documents</span></TabsTrigger>
              <TabsTrigger value="process_docs" className="gap-1.5 whitespace-nowrap"><BookMarked className="h-4 w-4 shrink-0" /><span>Process Docs</span></TabsTrigger>
              <TabsTrigger value="my_financial" className="gap-1.5 whitespace-nowrap"><CreditCard className="h-4 w-4 shrink-0" /><span>My Financial Details</span></TabsTrigger>
              {isHROrAdmin && (
                <TabsTrigger value="assets" className="gap-1.5 whitespace-nowrap"><Package className="h-4 w-4 shrink-0" /><span>Assets</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="candidates" className="gap-1.5 whitespace-nowrap"><UserSearch className="h-4 w-4 shrink-0" /><span>Candidates</span></TabsTrigger>
              )}
              <TabsTrigger value="hiring" className="gap-1.5 whitespace-nowrap"><Briefcase className="h-4 w-4 shrink-0" /><span>Hiring</span></TabsTrigger>
              <TabsTrigger value="referrals" className="gap-1.5 whitespace-nowrap"><Share2 className="h-4 w-4 shrink-0" /><span>Referrals</span></TabsTrigger>
              {isHROrAdmin && (
                <TabsTrigger value="monthly_pulse" className="gap-1.5 whitespace-nowrap"><Newspaper className="h-4 w-4 shrink-0" /><span>Monthly Pulse</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="birthday_songs" className="gap-1.5 whitespace-nowrap"><Gift className="h-4 w-4 shrink-0" /><span>Birthday Cards</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="financial_list" className="gap-1.5 whitespace-nowrap"><Wallet className="h-4 w-4 shrink-0" /><span>Financial Details</span></TabsTrigger>
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
              {isHROrAdmin && (
                <TabsTrigger value="onboarding" className="gap-1.5 whitespace-nowrap"><ClipboardCheck className="h-4 w-4 shrink-0" /><span>Onboarding</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="offboarding" className="gap-1.5 whitespace-nowrap"><ClipboardX className="h-4 w-4 shrink-0" /><span>Offboarding</span></TabsTrigger>
              )}
              {isHROrAdmin && (
                <TabsTrigger value="leave_history" className="gap-1.5 whitespace-nowrap"><History className="h-4 w-4 shrink-0" /><span>Leave History</span></TabsTrigger>
              )}
              <TabsTrigger value="holidays" className="gap-1.5 whitespace-nowrap"><CalendarDays className="h-4 w-4 shrink-0" /><span>Holidays</span></TabsTrigger>
            </TabsList>
          </div>

          {/* Home tab = My Attendance (Calendar View) */}
          <TabsContent value="home" className="space-y-4">
            <MyAttendanceCalendarView
              todayAttendance={todayAttendance}
              weeklyHours={weeklyHours}
              attendanceLogs={attendanceLogs}
              calendarMonth={calendarMonth}
              onMonthChange={setCalendarMonth}
              employeeId={myEmployee?.id}
              onRefresh={() => { fetchYesterdayLog(); if (myEmployee) fetchAttendanceLogs(myEmployee.id, calendarMonth); }}
              yesterdayLog={yesterdayLog}
              onCorrected={() => { fetchYesterdayLog(); if (myEmployee) fetchAttendanceLogs(myEmployee.id, calendarMonth); }}
              onApplyLeave={(prefillDate) => {
                setLeavePrefillDate(prefillDate);
                setLeaveDialogOpen(true);
              }}
            />
          </TabsContent>

          {isHROrAdmin && <TabsContent value="employees"><EmployeesPanel /></TabsContent>}

          {/* Team Attendance (HR/Admin only) */}
          {isHROrAdmin && (
            <TabsContent value="team_attendance" className="space-y-4">
              <TeamAttendancePanel employees={employees} />
            </TabsContent>
          )}

          <TabsContent value="leave" className="space-y-4">
            {isCompoffApprover && <CompOffApprovalsInbox />}
            {isCompoffApprover && pendingLeaves.length > 0 && (
              <BulkLeaveApprovalSection
                pendingLeaves={pendingLeaves}
                onApprove={approveLeave}
              />
            )}
            <LeaveBalancePanel
              employeeId={myEmployee?.id}
              actions={
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" onClick={() => setLeaveDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> Apply for Leave</Button>
                  {isHROrAdmin && (
                    <Button variant="outline" className="flex-1" onClick={() => setHRLeaveDialogOpen(true)}>
                      <UserPlus className="mr-2 h-4 w-4" /> Apply Leave for Employee
                    </Button>
                  )}
                </div>
              }
            />
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
          </TabsContent>

          <TabsContent value="kpi_management" className="space-y-4"><KPIManagementPanel /></TabsContent>
          
          <TabsContent value="documents" className="space-y-4"><HRDocumentsPanel /></TabsContent>
          <TabsContent value="process_docs" className="space-y-4"><ProcessDocumentsPanel canManage={isHROrAdmin} /></TabsContent>
          <TabsContent value="my_financial"><MyFinancialDetailsPanel /></TabsContent>
          {isHROrAdmin && <TabsContent value="assets" className="space-y-4"><AssetManagementPanel /></TabsContent>}
          {isHROrAdmin && <TabsContent value="candidates"><CandidatesPanel /></TabsContent>}
          <TabsContent value="hiring"><HiringPanel /></TabsContent>
          <TabsContent value="referrals"><ReferralsPanel /></TabsContent>
          {isHROrAdmin && <TabsContent value="monthly_pulse"><MonthlyPulsePanel /></TabsContent>}
          {isHROrAdmin && <TabsContent value="birthday_songs"><BirthdaySongsPanel /></TabsContent>}
          {isHROrAdmin && <TabsContent value="financial_list" className="space-y-6"><EmployeeFinancialDetailsPanel /><EmployeeFinancialDetailsList /></TabsContent>}
          {isHROrAdmin && <TabsContent value="bank_requests"><BankUpdateRequestsPanel /></TabsContent>}
          {(isHROrAdmin || isFinance) && <TabsContent value="salary"><SalarySheetsList /></TabsContent>}
          {isHROrAdmin && <TabsContent value="salary_history"><SalaryHistoryPanel /></TabsContent>}
          <TabsContent value="payslips"><EmployeePayslipsPanel /></TabsContent>
          <TabsContent value="resignation"><ResignationPanel /></TabsContent>
          {isHROrAdmin && <TabsContent value="onboarding"><ChecklistPanel checklistType="onboarding" /></TabsContent>}
          {isHROrAdmin && <TabsContent value="offboarding"><ChecklistPanel checklistType="offboarding" /></TabsContent>}
          {isHROrAdmin && <TabsContent value="leave_history"><LeaveHistoryPanel /></TabsContent>}
          {isHROrAdmin && <TabsContent value="training"><EmployeeTrainingPanel /></TabsContent>}
          <TabsContent value="holidays"><HolidaysManager /></TabsContent>
        </Tabs>
      </main>

      <LeaveApplyDialog
        open={leaveDialogOpen}
        onOpenChange={(o) => {
          setLeaveDialogOpen(o);
          if (!o) setLeavePrefillDate(undefined);
        }}
        onSubmit={applyLeave}
        prefillDate={leavePrefillDate}
      />
      {isHROrAdmin && (
        <HRLeaveApplyDialog
          open={hrLeaveDialogOpen}
          onOpenChange={setHRLeaveDialogOpen}
          employees={employees}
          onSubmit={applyLeaveForEmployee}
        />
      )}
      {isMobile && <MobileBottomNav />}
    </div>
  );
}
