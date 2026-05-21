import { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useExpectedPayments } from '@/hooks/useExpectedPayments';
import { supabase } from '@/integrations/supabase/client';
import { CreditDebitOverview } from '@/components/finance/CreditDebitOverview';
import { CashflowChart } from '@/components/finance/CashflowChart';
import { ExpectedPaymentsForm } from '@/components/finance/ExpectedPaymentsForm';
import { InvoiceAgingDashboard } from '@/components/finance/InvoiceAgingDashboard';
import { PaymentRiskWidget } from '@/components/finance/PaymentRiskWidget';
import { RecurringExpensesPanel } from '@/components/finance/recurring/RecurringExpensesPanel';
import { 
  IndianRupee, TrendingUp, TrendingDown, Calendar, Plus, 
  ArrowUpRight, ArrowDownRight, Loader2, Lock, FileSpreadsheet, Repeat, Download
} from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTableExport } from '@/hooks/useTableExport';

interface PaymentRecord {
  id: string;
  amount: number;
  order_id: string;
  status: string;
  submitted_at: string;
  reviewed_at: string | null;
}

interface SupplierPayment {
  id: string;
  amount: number;
  supplier_id: string;
  payment_date: string;
  payment_type: string;
  notes: string | null;
}

interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_company: string;
  total_sales_amount: number;
  amount_paid: number;
  payment_status: string;
}

interface PipelineOrder {
  id: string;
  customer_name: string;
  customer_company: string;
  expected_price: number;
  product_name: string;
  status: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface InventoryProcurement {
  id: string;
  procurement_number: string;
}

export default function Finance() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { payments: expectedPayments, markAsReceived, deletePayment } = useExpectedPayments();
  const { exportToExcel } = useTableExport();
  
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [pipelineOrders, setPipelineOrders] = useState<PipelineOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [procurements, setProcurements] = useState<InventoryProcurement[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDoneRef = useRef(false);
  const [formOpen, setFormOpen] = useState(false);

  // Check role access
  const canAccess = role === 'admin' || role === 'finance';

  useEffect(() => {
    if (!user || !canAccess) return;

    const fetchData = async () => {
      if (!initialLoadDoneRef.current) {
        setLoading(true);
      }
      try {
        // Fetch payment records (credits)
        const { data: payments } = await supabase
          .from('payment_records')
          .select('*')
          .order('submitted_at', { ascending: false });
        
        // Fetch supplier payments (debits)
        const { data: supplierPays } = await supabase
          .from('supplier_payments')
          .select('*')
          .order('payment_date', { ascending: false });

        // Fetch orders for linking
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, order_number, customer_name, customer_company, total_sales_amount, amount_paid, payment_status')
          .order('created_at', { ascending: false });

        // Fetch pipeline orders for linking
        const { data: pipelineData } = await supabase
          .from('pipeline_orders')
          .select('id, customer_name, customer_company, expected_price, product_name, status')
          .eq('status', 'pending_confirmation')
          .order('created_at', { ascending: false });

        // Fetch suppliers for mapping
        const { data: suppliersData } = await supabase
          .from('suppliers')
          .select('id, name');

        // Fetch procurements for mapping
        const { data: procurementsData } = await supabase
          .from('inventory_procurements')
          .select('id, procurement_number');

        setPaymentRecords(payments || []);
        setSupplierPayments(supplierPays || []);
        setOrders(ordersData || []);
        setPipelineOrders(pipelineData || []);
        setSuppliers(suppliersData || []);
        setProcurements(procurementsData || []);
      } catch (error) {
        console.error('Error fetching finance data:', error);
      } finally {
        setLoading(false);
        initialLoadDoneRef.current = true;
      }
    };

    fetchData();
  }, [user, canAccess]);

  // Enrich payment records with order info
  const enrichedPaymentRecords = paymentRecords.map(pr => {
    const order = orders.find(o => o.id === pr.order_id);
    return {
      ...pr,
      order_number: order?.order_number,
      customer_name: order?.customer_name,
    };
  });

  // Enrich supplier payments with supplier/procurement info
  const enrichedSupplierPayments = supplierPayments.map(sp => {
    const supplier = suppliers.find(s => s.id === sp.supplier_id);
    return {
      ...sp,
      supplier_name: supplier?.name,
    };
  });

  // Orders with pending payments
  const pendingPaymentOrders = orders.filter(o => 
    o.payment_status === 'pending' || o.payment_status === 'partial'
  );

  const handleExportPayments = () => {
    const rows = enrichedPaymentRecords.map(p => ({
      submitted_at: p.submitted_at,
      order_number: (p as any).order_number,
      customer_name: (p as any).customer_name,
      amount: p.amount,
      status: p.status,
      reviewed_at: p.reviewed_at,
    }));
    exportToExcel(rows, 'payment-records', {
      sheetName: 'Payments',
      amountColumns: ['amount'],
      dateColumns: ['submitted_at', 'reviewed_at'],
      headers: {
        submitted_at: 'Submitted',
        order_number: 'Order #',
        customer_name: 'Customer',
        amount: 'Amount',
        status: 'Status',
        reviewed_at: 'Reviewed',
      },
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex flex-col items-center justify-center py-20">
            <Lock className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
            <p className="text-muted-foreground text-center max-w-md">
              The Finance module is only accessible to Admin and Finance team members.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/70">
                <IndianRupee className="h-6 w-6 text-primary-foreground" />
              </div>
              Finance Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Track credits, debits, and cashflow analysis
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleExportPayments} disabled={enrichedPaymentRecords.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" onClick={() => navigate('/bank-reconciliation')}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Bank Reconciliation
            </Button>
            <Button variant="outline" onClick={() => navigate('/payroll-reconciliation')}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Payroll Reconciliation
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Expected Payment
            </Button>
            <Button variant="outline" onClick={() => navigate('/credit-cards')}>
              <IndianRupee className="h-4 w-4 mr-2" />
              Credit Cards
            </Button>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="overview" className="gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Credit / Debit
            </TabsTrigger>
            <TabsTrigger value="cashflow" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Cashflow
            </TabsTrigger>
            <TabsTrigger value="recurring" className="gap-2">
              <Repeat className="h-4 w-4" />
              Recurring
            </TabsTrigger>
            <TabsTrigger value="aging" className="gap-2">
              <Calendar className="h-4 w-4" />
              Invoice Aging
            </TabsTrigger>
            <TabsTrigger value="risk" className="gap-2">
              <TrendingDown className="h-4 w-4" />
              Payment Risk
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <CreditDebitOverview
              paymentRecords={enrichedPaymentRecords}
              supplierPayments={enrichedSupplierPayments}
              loading={loading}
            />
          </TabsContent>

          <TabsContent value="cashflow">
            <CashflowChart
              expectedPayments={expectedPayments}
              onMarkReceived={markAsReceived}
              onDelete={deletePayment}
            />
          </TabsContent>

          <TabsContent value="recurring">
            <RecurringExpensesPanel />
          </TabsContent>

          <TabsContent value="aging">
            <InvoiceAgingDashboard />
          </TabsContent>

          <TabsContent value="risk">
            <PaymentRiskWidget />
          </TabsContent>
        </Tabs>
      </main>

      {/* Expected Payment Form Dialog */}
      <ExpectedPaymentsForm
        open={formOpen}
        onOpenChange={setFormOpen}
        orders={pendingPaymentOrders}
        pipelineOrders={pipelineOrders}
      />
    </div>
  );
}
