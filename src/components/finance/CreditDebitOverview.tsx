import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, IndianRupee, Package, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface PaymentRecord {
  id: string;
  amount: number;
  order_id: string;
  order_number?: string;
  customer_name?: string;
  status: string;
  submitted_at: string;
  reviewed_at?: string;
}

interface SupplierPayment {
  id: string;
  amount: number;
  supplier_name?: string;
  procurement_number?: string;
  order_number?: string;
  payment_date: string;
  payment_type: string;
  notes?: string;
}

interface CreditDebitOverviewProps {
  paymentRecords: PaymentRecord[];
  supplierPayments: SupplierPayment[];
  loading: boolean;
}

export function CreditDebitOverview({ paymentRecords, supplierPayments, loading }: CreditDebitOverviewProps) {
  // Calculate totals
  const approvedPayments = paymentRecords.filter(p => p.status === 'approved');
  const totalCredits = approvedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalDebits = supplierPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const netCashflow = totalCredits - totalDebits;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Credits</p>
                <p className="text-2xl font-bold text-green-600">
                  ₹{totalCredits.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {approvedPayments.length} payments received
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-500/20">
                <ArrowUpRight className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Debits</p>
                <p className="text-2xl font-bold text-red-600">
                  ₹{totalDebits.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {supplierPayments.length} payments made
                </p>
              </div>
              <div className="p-3 rounded-full bg-red-500/20">
                <ArrowDownRight className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br ${netCashflow >= 0 ? 'from-blue-500/10 to-blue-500/5 border-blue-500/20' : 'from-orange-500/10 to-orange-500/5 border-orange-500/20'}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Cashflow</p>
                <p className={`text-2xl font-bold ${netCashflow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                  ₹{Math.abs(netCashflow).toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {netCashflow >= 0 ? 'Net positive' : 'Net negative'}
                </p>
              </div>
              <div className={`p-3 rounded-full ${netCashflow >= 0 ? 'bg-blue-500/20' : 'bg-orange-500/20'}`}>
                {netCashflow >= 0 ? (
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-orange-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tables */}
      <Tabs defaultValue="credits" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="credits" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Credits ({approvedPayments.length})
          </TabsTrigger>
          <TabsTrigger value="debits" className="gap-2">
            <TrendingDown className="h-4 w-4" />
            Debits ({supplierPayments.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="credits" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-green-600" />
                Payments Received
              </CardTitle>
              <CardDescription>All approved customer payments linked to orders</CardDescription>
            </CardHeader>
            <CardContent>
              {approvedPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <IndianRupee className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No approved payments yet</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {approvedPayments.slice(0, 20).map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">
                            {payment.order_number || payment.order_id.slice(0, 8)}
                          </TableCell>
                          <TableCell>{payment.customer_name || '-'}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            ₹{Number(payment.amount).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell>
                            {format(new Date(payment.reviewed_at || payment.submitted_at), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-500/20 text-green-700">Received</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debits" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownRight className="h-5 w-5 text-red-600" />
                Payments Made
              </CardTitle>
              <CardDescription>All supplier payments for procurements and expenses</CardDescription>
            </CardHeader>
            <CardContent>
              {supplierPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No supplier payments yet</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Supplier</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierPayments.slice(0, 20).map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">
                            {payment.supplier_name || '-'}
                          </TableCell>
                          <TableCell>
                            {payment.procurement_number || payment.order_number || '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-600">
                            ₹{Number(payment.amount).toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell>
                            {format(new Date(payment.payment_date), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {payment.payment_type}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
