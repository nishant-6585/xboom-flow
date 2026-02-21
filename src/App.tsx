import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { MobileAttendanceFAB } from "@/components/attendance/MobileAttendanceFAB";
import { CommandPalette } from "@/components/CommandPalette";
import { useIsMobile } from "@/hooks/use-mobile";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Orders from "./pages/Orders";
import Suppliers from "./pages/Suppliers";
import Procurement from "./pages/Procurement";
import Inventory from "./pages/Inventory";
import Pricelist from "./pages/Pricelist";
import Sales from "./pages/Sales";
import Finance from "./pages/Finance";
import Tasks from "./pages/Tasks";
import Meetings from "./pages/Meetings";
import HR from "./pages/HR";
import Expenses from "./pages/Expenses";
import Forms from "./pages/Forms";
import FormEmbed from "./pages/FormEmbed";
import Repairs from "./pages/Repairs";
import Trainings from "./pages/Trainings";
import Billing from "./pages/Billing";
import Tickets from "./pages/Tickets";
import Tally from "./pages/Tally";
import Buyback from "./pages/Buyback";
import PublicDroneRepairEnquiry from "./pages/PublicDroneRepairEnquiry";
import Candidates from "./pages/Candidates";
import NotFound from "./pages/NotFound";

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
  return (
    <>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="/suppliers" element={<ProtectedRoute><Suppliers /></ProtectedRoute>} />
        <Route path="/procurement" element={<ProtectedRoute><Procurement /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
        <Route path="/pricelist" element={<ProtectedRoute><Pricelist /></ProtectedRoute>} />
        <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
        <Route path="/finance" element={<ProtectedRoute><Finance /></ProtectedRoute>} />
        <Route path="/meetings" element={<ProtectedRoute><Meetings /></ProtectedRoute>} />
        <Route path="/hr" element={<ProtectedRoute><HR /></ProtectedRoute>} />
        <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
        <Route path="/forms" element={<ProtectedRoute><Forms /></ProtectedRoute>} />
        <Route path="/repairs" element={<ProtectedRoute><Repairs /></ProtectedRoute>} />
        <Route path="/trainings" element={<ProtectedRoute><Trainings /></ProtectedRoute>} />
        <Route path="/form-embed/:formId" element={<FormEmbed />} />
        <Route path="/public/drone-repair-enquiry" element={<PublicDroneRepairEnquiry />} />
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
        <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
        <Route path="/tally" element={<ProtectedRoute><Tally /></ProtectedRoute>} />
        <Route path="/buyback" element={<ProtectedRoute><Buyback /></ProtectedRoute>} />
        <Route path="/candidates" element={<ProtectedRoute><Candidates /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <FloatingActionButton />
      {isMobile && <MobileAttendanceFAB />}
      <CommandPalette />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
