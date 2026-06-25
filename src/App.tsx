import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AnalyticsScopeProvider } from "@/contexts/AnalyticsScopeContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MobileAttendanceFAB } from "@/components/attendance/MobileAttendanceFAB";
import { CommandPalette } from "@/components/CommandPalette";
import { SessionHealthDebug } from "@/components/debug/SessionHealthDebug";
import { PortalChatButton } from "@/components/chat/PortalChatButton";

import { FollowupReminderPopup } from "@/components/sales/FollowupReminderPopup";
import { EnquiryResponseAlert } from "@/components/sales/EnquiryResponseAlert";
import { NewEnquiryAlert } from "@/components/sales/NewEnquiryAlert";
import { SLAReminderAlert } from "@/components/sales/SLAReminderAlert";
import { useIsMobile } from "@/hooks/use-mobile";
import { useThemeLoader } from "@/hooks/useThemeLoader";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Orders from "./pages/Orders";
import Suppliers from "./pages/Suppliers";
import Procurement from "./pages/Procurement";
import Inventory from "./pages/Inventory";
import Pricelist from "./pages/Pricelist";
import Sales from "./pages/Sales";
import SalesTvDashboard from "./pages/SalesTvDashboard";
import Finance from "./pages/Finance";
import Tasks from "./pages/Tasks";
import Meetings from "./pages/Meetings";
import HR from "./pages/HR";
import Expenses from "./pages/Expenses";
import Forms from "./pages/Forms";
import FormEmbed from "./pages/FormEmbed";
import Repairs from "./pages/Repairs";

import Tickets from "./pages/Tickets";
import Tally from "./pages/Tally";
import Buyback from "./pages/Buyback";
import Rent from "./pages/Rent";
import PublicDroneRepairEnquiry from "./pages/PublicDroneRepairEnquiry";
import Candidates from "./pages/Candidates";

import SecuritySettings from "./pages/SecuritySettings";
import AuditLogs from "./pages/AuditLogs";
import ResumeAccessAudit from "./pages/ResumeAccessAudit";
import OrderPhoneAuditLog from "./pages/OrderPhoneAuditLog";
import MyProfile from "./pages/MyProfile";
import ChangePassword from "./pages/ChangePassword";
import Preferences from "./pages/Preferences";
import MyActivity from "./pages/MyActivity";
import MFAVerify from "./pages/MFAVerify";
import PayrollReconciliation from "./pages/PayrollReconciliation";
import SamplePayslip from "./pages/SamplePayslip";
import DailyFlow from "./pages/DailyFlow";
import AIAutomation from "./pages/AIAutomation";

import CreditCards from "./pages/CreditCards";
import BankReconciliation from "./pages/BankReconciliation";
import ProformaReconciliation from "./pages/ProformaReconciliation";
import ProformaBatchValidate from "./pages/ProformaBatchValidate";
import ProformaAudit from "./pages/ProformaAudit";
import DroneOperations from "./pages/DroneOperations";
import SpareParts from "./pages/SpareParts";
import NotFound from "./pages/NotFound";
import Leads from "./pages/Leads";
import Messages from "./pages/Messages";
import CompanyCleanup from "./pages/CompanyCleanup";
import PortalCustomers from "./pages/PortalCustomers";
import KycVerification from "./pages/KycVerification";
import PortalRfqQueue from "./pages/admin/PortalRfqQueue";
import PortalOrdersAdmin from "./pages/admin/PortalOrdersAdmin";
import PortalOrderCreate from "./pages/admin/PortalOrderCreate";
import PortalDispatchQueue from "./pages/admin/PortalDispatchQueue";
import AdminPortalDashboard from "./pages/admin/PortalDashboard";
import KycEmailLogs from "./pages/admin/KycEmailLogs";
import ZohoInvoices from "./pages/admin/ZohoInvoices";
import DevConsole from "./pages/admin/DevConsole";

import { PortalAuthProvider } from "@/portal/hooks/usePortalAuth";
import { PortalProtectedRoute } from "@/portal/components/PortalProtectedRoute";
import PortalLogin from "@/portal/pages/PortalLogin";
import PortalSetPassword from "@/portal/pages/PortalSetPassword";
import PortalActivate from "@/portal/pages/PortalActivate";
import PortalDashboard from "@/portal/pages/PortalDashboard";
import PortalOrders from "@/portal/pages/PortalOrders";
import PortalOrderDetail from "@/portal/pages/PortalOrderDetail";
import PortalDocuments from "@/portal/pages/PortalDocuments";
import PortalRfqs from "@/portal/pages/PortalRfqs";
import PortalTickets from "@/portal/pages/PortalTickets";
import PortalTicketDetail from "@/portal/pages/PortalTicketDetail";
import PortalSettings from "@/portal/pages/PortalSettings";
import PortalKyc from "@/portal/pages/PortalKyc";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function AppInner() {
  const isMobile = useIsMobile();
  useThemeLoader();
  
  return (
    <>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/mfa-verify" element={<MFAVerify />} />
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
        <Route path="/procurement" element={<ProtectedRoute><Procurement /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
        <Route path="/pricelist" element={<ProtectedRoute><Pricelist /></ProtectedRoute>} />
        <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
        <Route path="/sales/tv" element={<ProtectedRoute><SalesTvDashboard /></ProtectedRoute>} />
        <Route path="/finance" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
        <Route path="/meetings" element={<ProtectedRoute><Meetings /></ProtectedRoute>} />
        <Route path="/hr" element={<ProtectedRoute><HR /></ProtectedRoute>} />
        <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
        <Route path="/forms" element={<ProtectedRoute><Forms /></ProtectedRoute>} />
        <Route path="/repairs" element={<ProtectedRoute><Repairs /></ProtectedRoute>} />
        <Route path="/trainings" element={<ProtectedRoute><Navigate to="/hr?tab=training" replace /></ProtectedRoute>} />
        <Route path="/holidays" element={<ProtectedRoute><Navigate to="/hr?tab=holidays" replace /></ProtectedRoute>} />
        <Route path="/hr/monthly-pulse" element={<ProtectedRoute><Navigate to="/hr?tab=monthly_pulse" replace /></ProtectedRoute>} />
        <Route path="/form-embed/:formId" element={<FormEmbed />} />
        <Route path="/public/drone-repair-enquiry" element={<PublicDroneRepairEnquiry />} />
        <Route path="/sample-payslip" element={<SamplePayslip />} />
        <Route path="/billing" element={<Navigate to="/sales?tab=quotes" replace />} />
        <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
        <Route path="/tally" element={<ProtectedRoute><Tally /></ProtectedRoute>} />
        <Route path="/buyback" element={<ProtectedRoute><Buyback /></ProtectedRoute>} />
        <Route path="/rent" element={<ProtectedRoute><Rent /></ProtectedRoute>} />
        <Route path="/candidates" element={<ProtectedRoute><Candidates /></ProtectedRoute>} />
        
        <Route path="/profile" element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />
        <Route path="/profile/security" element={<ProtectedRoute><SecuritySettings /></ProtectedRoute>} />
        <Route path="/profile/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
        <Route path="/profile/preferences" element={<ProtectedRoute><Preferences /></ProtectedRoute>} />
        <Route path="/profile/activity" element={<ProtectedRoute><MyActivity /></ProtectedRoute>} />
        <Route path="/admin/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
        <Route path="/admin/resume-access-audit" element={<ProtectedRoute><ResumeAccessAudit /></ProtectedRoute>} />
        <Route path="/admin/order-phone-audit" element={<ProtectedRoute><OrderPhoneAuditLog /></ProtectedRoute>} />
        <Route path="/payroll-reconciliation" element={<ProtectedRoute><PayrollReconciliation /></ProtectedRoute>} />
        <Route path="/daily-flow" element={<ProtectedRoute><DailyFlow /></ProtectedRoute>} />
        <Route path="/admin/ai-automation" element={<ProtectedRoute><AIAutomation /></ProtectedRoute>} />
        <Route path="/admin/company-cleanup" element={<ProtectedRoute><CompanyCleanup /></ProtectedRoute>} />
        <Route path="/admin/portal-customers" element={<ProtectedRoute><PortalCustomers /></ProtectedRoute>} />
        <Route path="/admin/portal-rfqs" element={<ProtectedRoute><PortalRfqQueue /></ProtectedRoute>} />
        <Route path="/admin/portal-orders" element={<ProtectedRoute><PortalOrdersAdmin /></ProtectedRoute>} />
        <Route path="/admin/portal-orders/new" element={<ProtectedRoute><PortalOrderCreate /></ProtectedRoute>} />
        <Route path="/admin/portal-dispatch" element={<ProtectedRoute><PortalDispatchQueue /></ProtectedRoute>} />
        <Route path="/admin/portal-dashboard" element={<ProtectedRoute><AdminPortalDashboard /></ProtectedRoute>} />
        <Route path="/admin/kyc-emails" element={<ProtectedRoute><KycEmailLogs /></ProtectedRoute>} />
        <Route path="/admin/zoho-invoices" element={<ProtectedRoute><ZohoInvoices /></ProtectedRoute>} />
        <Route path="/admin/dev-console" element={<ProtectedRoute><DevConsole /></ProtectedRoute>} />
        
        <Route path="/credit-cards" element={<ProtectedRoute><CreditCards /></ProtectedRoute>} />
        <Route path="/bank-reconciliation" element={<ProtectedRoute><BankReconciliation /></ProtectedRoute>} />
       <Route path="/proforma-reconciliation" element={<ProtectedRoute><ProformaReconciliation /></ProtectedRoute>} />
       <Route path="/proforma-batch-validate" element={<ProtectedRoute><ProformaBatchValidate /></ProtectedRoute>} />
      <Route path="/proforma-audit" element={<ProtectedRoute><ProformaAudit /></ProtectedRoute>} />
        <Route path="/drone-operations" element={<ProtectedRoute><DroneOperations /></ProtectedRoute>} />
        <Route path="/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
        <Route path="/spare-parts" element={<ProtectedRoute><SpareParts /></ProtectedRoute>} />
        <Route path="/kyc" element={<ProtectedRoute><KycVerification /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
        <Route path="/messages/:threadId" element={<ProtectedRoute><Messages /></ProtectedRoute>} />

        {/* ===== B2B Customer Portal ===== */}
        <Route
          path="/portal/*"
          element={
            <PortalAuthProvider>
              <Routes>
                <Route path="login" element={<PortalLogin />} />
                <Route path="set-password" element={<PortalSetPassword />} />
                <Route path="activate" element={<PortalActivate />} />
                <Route
                  path="dashboard"
                  element={
                    <PortalProtectedRoute>
                      <PortalDashboard />
                    </PortalProtectedRoute>
                  }
                />
                <Route
                  path="orders"
                  element={
                    <PortalProtectedRoute>
                      <PortalOrders />
                    </PortalProtectedRoute>
                  }
                />
                <Route
                  path="orders/:orderId"
                  element={
                    <PortalProtectedRoute>
                      <PortalOrderDetail />
                    </PortalProtectedRoute>
                  }
                />
                <Route
                  path="documents"
                  element={
                    <PortalProtectedRoute>
                      <PortalDocuments />
                    </PortalProtectedRoute>
                  }
                />
                <Route
                  path="rfqs"
                  element={
                    <PortalProtectedRoute>
                      <PortalRfqs />
                    </PortalProtectedRoute>
                  }
                />
                <Route
                  path="tickets"
                  element={
                    <PortalProtectedRoute>
                      <PortalTickets />
                    </PortalProtectedRoute>
                  }
                />
                <Route
                  path="tickets/:ticketId"
                  element={
                    <PortalProtectedRoute>
                      <PortalTicketDetail />
                    </PortalProtectedRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <PortalProtectedRoute>
                      <PortalSettings />
                    </PortalProtectedRoute>
                  }
                />
                <Route
                  path="kyc"
                  element={
                    <PortalProtectedRoute>
                      <PortalKyc />
                    </PortalProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/portal/dashboard" replace />} />
              </Routes>
            </PortalAuthProvider>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
      <AuthGuardedWidgets isMobile={isMobile} />
    </>
  );
}

/** Renders global widgets only when user is fully authenticated (including MFA) */
function AuthGuardedWidgets({ isMobile }: { isMobile: boolean }) {
  const { user, mfaStatus, isApproved, loading } = useAuth();
  const location = useLocation();
  // Hide widgets on public/auth pages
  const publicPaths = ['/auth', '/mfa-verify', '/form-embed', '/public'];
  const portalPaths = ['/portal'];
  const isPublicPage = publicPaths.some(p => location.pathname.startsWith(p));
  const isPortalPage = portalPaths.some(p => location.pathname.startsWith(p));
  if (isPublicPage || isPortalPage) return null;
  // Do not render any protected UI until authentication and MFA state are fully resolved
  if (loading) return null;
  if (!user) return null;
  if (!isApproved) return null;
  if (mfaStatus === "enrollment_required" || mfaStatus === "verification_required") return null;
  return (
    <ErrorBoundary fallback={null}>
      <FloatingActionButton />
      {isMobile && <MobileAttendanceFAB />}
      <CommandPalette />
      <PortalChatButton />
      
      <FollowupReminderPopup />
      <EnquiryResponseAlert />
      <NewEnquiryAlert />
      <SLAReminderAlert />
    </ErrorBoundary>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider delayDuration={300}>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AnalyticsScopeProvider>
            <AppInner />
            <ErrorBoundary fallback={null}>
              <SessionHealthDebug />
            </ErrorBoundary>
          </AnalyticsScopeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
