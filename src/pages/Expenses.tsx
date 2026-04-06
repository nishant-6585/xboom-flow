import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { useExpenses, EXPENSE_TYPES, EXPENSE_STATUSES, PAYMENT_MODES, Expense } from "@/hooks/useExpenses";
import { usePettyCash } from "@/hooks/usePettyCash";
import { useOrders } from "@/hooks/useOrders";
import { useInventoryProcurements } from "@/hooks/useInventoryProcurements";
import { useAllExpenseLinks } from "@/hooks/useExpenseLinks";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { Plus, Receipt, Loader2, Check, X, Wallet, TrendingUp, Clock, CheckCircle, CreditCard, Banknote, Users, Package, ShoppingCart, Link2, ChevronsUpDown, CalendarIcon, Filter, Upload, AlertTriangle, FileText } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { DocumentViewer } from "@/components/hr/DocumentViewer";

export default function Expenses() {
  const { expenses, loading, createExpense, approveExpense, rejectExpense, markReimbursed, deleteExpense, canApprove, canDelete, refetch: refetchExpenses } = useExpenses();
  const { myBalance, getUserBalance, getAllUserBalances, givePettyCash, recordReceivedCash, deductForExpense, creditOverpayment, canManage, transactions, refetch: refetchPettyCash } = usePettyCash();
  const { orders, loading: ordersLoading } = useOrders();
  const { procurements, loading: procurementsLoading } = useInventoryProcurements();
  const { linkOrdersToExpense, linkProcurementsToExpense, getLinkedOrdersForExpense, getLinkedProcurementsForExpense, refetch: refetchLinks } = useAllExpenseLinks();
  const { user, profile } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Form state
  const [expenseType, setExpenseType] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [useFromPettyCash, setUseFromPettyCash] = useState(false);
  const [pettyCashAmount, setPettyCashAmount] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [selectedProcurementIds, setSelectedProcurementIds] = useState<string[]>([]);

  // Receipt viewer
  const [receiptViewerOpen, setReceiptViewerOpen] = useState(false);
  const [receiptViewerUrl, setReceiptViewerUrl] = useState<string | null>(null);
  const [receiptViewerName, setReceiptViewerName] = useState("");

  // Give petty cash dialog
  const [giveCashDialogOpen, setGiveCashDialogOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [targetUserName, setTargetUserName] = useState("");
  const [giveCashAmount, setGiveCashAmount] = useState("");
  const [giveCashNotes, setGiveCashNotes] = useState("");
  const [givingCash, setGivingCash] = useState(false);

  // Record received petty cash dialog
  const [recordCashDialogOpen, setRecordCashDialogOpen] = useState(false);
  const [receivedCashAmount, setReceivedCashAmount] = useState("");
  const [receivedCashNotes, setReceivedCashNotes] = useState("");
  const [recordingReceivedCash, setRecordingReceivedCash] = useState(false);

  // Record payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  // Get all users from expenses for dropdown
  const allUsers = Array.from(new Set(expenses.map(e => JSON.stringify({ id: e.created_by, name: e.created_by_name }))))
    .map(s => JSON.parse(s) as { id: string; name: string });

  const resetForm = () => {
    setExpenseType("");
    setAmount("");
    setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
    setDescription("");
    setVendorName("");
    setPaymentMode("");
    setNotes("");
    setUseFromPettyCash(false);
    setPettyCashAmount("");
    setSelectedOrderIds([]);
    setSelectedProcurementIds([]);
    setReceiptFile(null);
  };

  // Check if GST bill is required (amount > 2000)
  const expenseAmount = parseFloat(amount) || 0;
  const isGstBillRequired = expenseAmount > 2000;
  const isGstBillMissing = isGstBillRequired && !receiptFile;

  const uploadReceipt = async (file: File): Promise<string | null> => {
    try {
      const { validateFile } = await import('@/lib/fileValidation');
      const validation = validateFile(file, 'screenshots');
      if (!validation.valid) { toast.error(validation.error); return null; }
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('payment-screenshots')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Store the path, not a public URL - bucket is private
      return fileName;
    } catch (error: any) {
      console.error('Error uploading receipt:', error);
      toast.error('Failed to upload receipt');
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!expenseType || !amount) {
      toast.error("Please fill in required fields");
      return;
    }

    const submitExpenseAmount = parseFloat(amount);
    
    // Validate GST bill requirement
    if (submitExpenseAmount > 2000 && !receiptFile) {
      toast.error("GST Bill is mandatory for expenses over ₹2,000");
      return;
    }

    setSubmitting(true);

    // Upload receipt if provided
    let receiptUrl: string | null = null;
    if (receiptFile) {
      setUploadingReceipt(true);
      receiptUrl = await uploadReceipt(receiptFile);
      setUploadingReceipt(false);
      if (!receiptUrl && submitExpenseAmount > 2000) {
        toast.error("Failed to upload GST bill. Please try again.");
        setSubmitting(false);
        return;
      }
    }
    const pettyCashToUse = useFromPettyCash ? Math.min(parseFloat(pettyCashAmount) || 0, myBalance, submitExpenseAmount) : 0;

    const result = await createExpense({
      expense_type: expenseType,
      amount: submitExpenseAmount,
      expense_date: expenseDate,
      description: description || null,
      vendor_name: vendorName || null,
      payment_mode: paymentMode || null,
      notes: notes || null,
      receipt_url: receiptUrl,
      paid_from_petty_cash: pettyCashToUse,
      amount_paid: pettyCashToUse, // Initially, petty cash used = paid
      payment_notes: pettyCashToUse > 0 ? `₹${pettyCashToUse} paid from petty cash` : null,
    });

    if (result && pettyCashToUse > 0) {
      await deductForExpense(result.id, pettyCashToUse, `Used for ${EXPENSE_TYPES.find(t => t.value === expenseType)?.label || expenseType} expense`);
    }

    // Link orders and procurements if selected
    if (result) {
      if (selectedOrderIds.length > 0) {
        await linkOrdersToExpense(result.id, selectedOrderIds);
      }
      if (selectedProcurementIds.length > 0) {
        await linkProcurementsToExpense(result.id, selectedProcurementIds);
      }
    }

    setSubmitting(false);
    if (result) {
      resetForm();
      setDialogOpen(false);
      refetchPettyCash();
      refetchLinks();
    }
  };

  const handleGivePettyCash = async () => {
    if (!targetUserId || !giveCashAmount) {
      toast.error("Please select user and enter amount");
      return;
    }

    setGivingCash(true);
    const success = await givePettyCash(targetUserId, targetUserName, parseFloat(giveCashAmount), giveCashNotes);
    setGivingCash(false);

    if (success) {
      setGiveCashDialogOpen(false);
      setTargetUserId("");
      setTargetUserName("");
      setGiveCashAmount("");
      setGiveCashNotes("");
    }
  };

  const handleRecordReceivedCash = async () => {
    if (!receivedCashAmount) {
      toast.error("Please enter amount");
      return;
    }

    setRecordingReceivedCash(true);
    const success = await recordReceivedCash(parseFloat(receivedCashAmount), receivedCashNotes);
    setRecordingReceivedCash(false);

    if (success) {
      setRecordCashDialogOpen(false);
      setReceivedCashAmount("");
      setReceivedCashNotes("");
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedExpense || !paymentAmount) {
      toast.error("Please enter payment amount");
      return;
    }

    const paidAmount = parseFloat(paymentAmount);
    const expenseAmount = selectedExpense.amount;
    const alreadyPaid = (selectedExpense as any).amount_paid || 0;
    const totalAfterPayment = alreadyPaid + paidAmount;
    const overpayment = totalAfterPayment > expenseAmount ? totalAfterPayment - expenseAmount : 0;

    setRecordingPayment(true);

    try {
      // Update expense with payment
      const { error } = await supabase
        .from('expenses')
        .update({
          amount_paid: Math.min(totalAfterPayment, expenseAmount),
          payment_notes: paymentNotes || `Payment of ₹${paidAmount} recorded`,
          status: totalAfterPayment >= expenseAmount ? 'reimbursed' : 'approved',
        })
        .eq('id', selectedExpense.id);

      if (error) throw error;

      // If overpayment, credit to user's petty cash
      if (overpayment > 0) {
        await creditOverpayment(
          selectedExpense.created_by,
          selectedExpense.created_by_name,
          overpayment,
          selectedExpense.id
        );
        toast.success(`Payment recorded. ₹${overpayment} credited to ${selectedExpense.created_by_name}'s petty cash`);
      } else {
        toast.success('Payment recorded successfully');
      }

      refetchExpenses();
      refetchPettyCash();
      setPaymentDialogOpen(false);
      setSelectedExpense(null);
      setPaymentAmount("");
      setPaymentNotes("");
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast.error(error.message || 'Failed to record payment');
    } finally {
      setRecordingPayment(false);
    }
  };

  const openPaymentDialog = (expense: Expense) => {
    setSelectedExpense(expense);
    setPaymentAmount("");
    setPaymentNotes("");
    setPaymentDialogOpen(true);
  };

  // Filter expenses based on tab, search, and date range
  const filteredExpenses = expenses.filter(expense => {
    const matchesTab = activeTab === "all" || 
      (activeTab === "pending" && expense.status === "pending") ||
      (activeTab === "approved" && expense.status === "approved") ||
      (activeTab === "paid" && expense.status === "reimbursed") ||
      (activeTab === "mine" && expense.created_by === user?.id) ||
      (activeTab === "petty_cash");
    
    const matchesSearch = !searchQuery || 
      expense.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.vendor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      EXPENSE_TYPES.find(t => t.value === expense.expense_type)?.label.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Date filter
    const expenseDate = parseISO(expense.expense_date);
    const matchesDateRange = (!startDate || expenseDate >= startOfDay(startDate)) && 
                             (!endDate || expenseDate <= endOfDay(endDate));
    
    return matchesTab && matchesSearch && matchesDateRange;
  });

  // Calculate stats
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const pendingExpenses = expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0);
  const approvedExpenses = expenses.filter(e => e.status === 'approved').reduce((sum, e) => sum + e.amount, 0);
  const paidExpenses = expenses.filter(e => e.status === 'reimbursed').reduce((sum, e) => sum + e.amount, 0);
  const myExpenses = expenses.filter(e => e.created_by === user?.id).reduce((sum, e) => sum + e.amount, 0);

  const userBalances = getAllUserBalances();

  const getStatusBadge = (status: string) => {
    const statusConfig = EXPENSE_STATUSES.find(s => s.value === status);
    return (
      <Badge className={statusConfig?.color || 'bg-gray-100 text-gray-800'}>
        {statusConfig?.label || status}
      </Badge>
    );
  };

  const getExpenseTypeLabel = (type: string) => {
    return EXPENSE_TYPES.find(t => t.value === type)?.label || type;
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-4 sm:py-6 flex-1 overflow-x-hidden">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Expenses</h1>
            <p className="text-muted-foreground">Track and manage company expenses</p>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <Dialog open={giveCashDialogOpen} onOpenChange={setGiveCashDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Banknote className="w-4 h-4 mr-2" />
                    Give Petty Cash
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Banknote className="w-5 h-5" />
                      Give Petty Cash
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Select User *</Label>
                      <Select 
                        value={targetUserId} 
                        onValueChange={(value) => {
                          setTargetUserId(value);
                          const selectedUser = allUsers.find(u => u.id === value);
                          setTargetUserName(selectedUser?.name || '');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUsers.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name} (Balance: ₹{getUserBalance(u.id).toLocaleString()})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (₹) *</Label>
                      <Input
                        type="number"
                        value={giveCashAmount}
                        onChange={(e) => setGiveCashAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={giveCashNotes}
                        onChange={(e) => setGiveCashNotes(e.target.value)}
                        placeholder="Purpose of petty cash..."
                        rows={2}
                      />
                    </div>
                    <Button 
                      onClick={handleGivePettyCash} 
                      className="w-full" 
                      disabled={givingCash}
                    >
                      {givingCash ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Give Petty Cash'
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {/* Record Received Cash - Available to all users */}
            <Dialog open={recordCashDialogOpen} onOpenChange={setRecordCashDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Wallet className="w-4 h-4 mr-2" />
                  Record Received Cash
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Wallet className="w-5 h-5" />
                    Record Petty Cash Received
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="p-3 bg-muted/50 border rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      Record petty cash you have received. This will be added to your balance.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (₹) *</Label>
                    <Input
                      type="number"
                      value={receivedCashAmount}
                      onChange={(e) => setReceivedCashAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={receivedCashNotes}
                      onChange={(e) => setReceivedCashNotes(e.target.value)}
                      placeholder="Purpose or source of petty cash..."
                      rows={2}
                    />
                  </div>
                  <Button 
                    onClick={handleRecordReceivedCash} 
                    className="w-full" 
                    disabled={recordingReceivedCash}
                  >
                    {recordingReceivedCash ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Recording...
                      </>
                    ) : (
                      'Record Cash'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Receipt className="w-5 h-5" />
                    Add New Expense
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  {/* Petty Cash Balance Banner */}
                  {myBalance > 0 && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium text-green-800 dark:text-green-200">Your Petty Cash Balance</span>
                        </div>
                        <span className="font-bold text-green-600">₹{myBalance.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Expense Type *</Label>
                      <Select value={expenseType} onValueChange={setExpenseType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPENSE_TYPES.map(type => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Amount (₹) *</Label>
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Mode</Label>
                      <Select value={paymentMode} onValueChange={setPaymentMode}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_MODES.map(mode => (
                            <SelectItem key={mode.value} value={mode.value}>
                              {mode.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of expense"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Vendor/Paid To</Label>
                    <Input
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      placeholder="Vendor or recipient name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Additional notes..."
                      rows={2}
                    />
                  </div>

                  {/* Screenshot / Receipt Upload */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      Screenshot / Bill {isGstBillRequired && <span className="text-destructive">* (GST Bill Required)</span>}
                    </Label>
                    
                    {isGstBillMissing && (
                      <Alert variant="destructive" className="py-2">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          GST Bill is mandatory for expenses over ₹2,000. Please upload the bill to proceed.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setReceiptFile(file);
                          }
                        }}
                        className="flex-1"
                      />
                      {receiptFile && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setReceiptFile(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {receiptFile && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="h-3 w-3 text-green-600" />
                        {receiptFile.name}
                      </p>
                    )}
                    {!isGstBillRequired && (
                      <p className="text-xs text-muted-foreground">
                        Upload payment screenshot, invoice, or receipt (optional)
                      </p>
                    )}
                  </div>

                  {/* Link to Orders - Multi-select Dropdown */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      Link to Orders (Optional)
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between h-auto min-h-10 font-normal"
                        >
                          <span className="text-left truncate">
                            {selectedOrderIds.length === 0 
                              ? "Select orders..." 
                              : `${selectedOrderIds.length} order(s) selected`}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[350px] p-0 bg-popover z-50" align="start">
                        <Command>
                          <CommandInput placeholder="Search orders..." />
                          <CommandList>
                            <CommandEmpty>No orders found.</CommandEmpty>
                            <CommandGroup className="max-h-64 overflow-auto">
                              {orders.slice(0, 50).map((order) => (
                                <CommandItem
                                  key={order.id}
                                  value={`${order.order_number} ${order.product_name} ${order.customer_company}`}
                                  onSelect={() => {
                                    if (selectedOrderIds.includes(order.id)) {
                                      setSelectedOrderIds(selectedOrderIds.filter(id => id !== order.id));
                                    } else {
                                      setSelectedOrderIds([...selectedOrderIds, order.id]);
                                    }
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      selectedOrderIds.includes(order.id) ? "opacity-100" : "opacity-0"
                                    }`}
                                  />
                                  <span className="truncate text-sm">
                                    <span className="font-medium">{order.order_number || 'No Order#'}</span>
                                    <span className="text-muted-foreground"> - {order.product_name}</span>
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedOrderIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedOrderIds.map(id => {
                          const order = orders.find(o => o.id === id);
                          return order ? (
                            <Badge key={id} variant="secondary" className="text-xs">
                              {order.order_number || 'Order'}
                              <button
                                type="button"
                                className="ml-1 hover:text-destructive"
                                onClick={() => setSelectedOrderIds(selectedOrderIds.filter(oid => oid !== id))}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>

                  {/* Link to Procurements - Multi-select Dropdown */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Link to Procurements (Optional)
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between h-auto min-h-10 font-normal"
                        >
                          <span className="text-left truncate">
                            {selectedProcurementIds.length === 0 
                              ? "Select procurements..." 
                              : `${selectedProcurementIds.length} procurement(s) selected`}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[350px] p-0 bg-popover z-50" align="start">
                        <Command>
                          <CommandInput placeholder="Search procurements..." />
                          <CommandList>
                            <CommandEmpty>No procurements found.</CommandEmpty>
                            <CommandGroup className="max-h-64 overflow-auto">
                              {procurements.slice(0, 50).map((proc) => (
                                <CommandItem
                                  key={proc.id}
                                  value={`${proc.procurement_number} ${proc.product_name} ${proc.supplier_name}`}
                                  onSelect={() => {
                                    if (selectedProcurementIds.includes(proc.id)) {
                                      setSelectedProcurementIds(selectedProcurementIds.filter(id => id !== proc.id));
                                    } else {
                                      setSelectedProcurementIds([...selectedProcurementIds, proc.id]);
                                    }
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      selectedProcurementIds.includes(proc.id) ? "opacity-100" : "opacity-0"
                                    }`}
                                  />
                                  <span className="truncate text-sm">
                                    <span className="font-medium">{proc.procurement_number || 'No Proc#'}</span>
                                    <span className="text-muted-foreground"> - {proc.product_name}</span>
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedProcurementIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedProcurementIds.map(id => {
                          const proc = procurements.find(p => p.id === id);
                          return proc ? (
                            <Badge key={id} variant="outline" className="text-xs">
                              {proc.procurement_number || 'Proc'}
                              <button
                                type="button"
                                className="ml-1 hover:text-destructive"
                                onClick={() => setSelectedProcurementIds(selectedProcurementIds.filter(pid => pid !== id))}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>


                  {/* Use Petty Cash Option */}
                  {myBalance > 0 && amount && (
                    <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="usePettyCash"
                          checked={useFromPettyCash}
                          onCheckedChange={(checked) => {
                            setUseFromPettyCash(!!checked);
                            if (checked) {
                              setPettyCashAmount(Math.min(parseFloat(amount) || 0, myBalance).toString());
                            }
                          }}
                        />
                        <Label htmlFor="usePettyCash" className="text-sm cursor-pointer">
                          Use from Petty Cash
                        </Label>
                      </div>
                      {useFromPettyCash && (
                        <div className="space-y-2">
                          <Label className="text-xs">Amount from Petty Cash (max: ₹{Math.min(parseFloat(amount) || 0, myBalance).toLocaleString()})</Label>
                          <Input
                            type="number"
                            value={pettyCashAmount}
                            onChange={(e) => setPettyCashAmount(e.target.value)}
                            max={Math.min(parseFloat(amount) || 0, myBalance)}
                            placeholder="0.00"
                          />
                          {parseFloat(pettyCashAmount) > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Remaining to claim: ₹{(parseFloat(amount) - parseFloat(pettyCashAmount)).toLocaleString()}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <Button 
                    onClick={handleSubmit} 
                    className="w-full" 
                    disabled={submitting || isGstBillMissing}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {uploadingReceipt ? 'Uploading Receipt...' : 'Adding...'}
                      </>
                    ) : isGstBillMissing ? (
                      <>
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Upload GST Bill to Continue
                      </>
                    ) : (
                      'Add Expense'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Total</span>
              </div>
              <p className="text-2xl font-bold">₹{totalExpenses.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-2xl font-bold text-yellow-600">₹{pendingExpenses.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-muted-foreground">Approved</span>
              </div>
              <p className="text-2xl font-bold text-green-600">₹{approvedExpenses.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">My Expenses</span>
              </div>
              <p className="text-2xl font-bold text-primary">₹{myExpenses.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-300">My Petty Cash</span>
              </div>
              <p className="text-2xl font-bold text-green-600">₹{myBalance.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs and Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Expense Records
                </CardTitle>
                <Input
                  placeholder="Search expenses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              {/* Date Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "justify-start text-left font-normal h-9",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'dd MMM yyyy') : 'Start Date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground text-sm">to</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "justify-start text-left font-normal h-9",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, 'dd MMM yyyy') : 'End Date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStartDate(undefined);
                      setEndDate(undefined);
                    }}
                    className="h-9 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="paid">Paid</TabsTrigger>
                <TabsTrigger value="mine">My Expenses</TabsTrigger>
                {canManage && <TabsTrigger value="petty_cash">Petty Cash</TabsTrigger>}
              </TabsList>

              {activeTab === "petty_cash" ? (
                <TabsContent value="petty_cash" className="mt-0">
                  <div className="space-y-4">
                    <h3 className="font-medium flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      User Petty Cash Balances
                    </h3>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userBalances.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                                No petty cash balances
                              </TableCell>
                            </TableRow>
                          ) : (
                            userBalances.map((ub) => (
                              <TableRow key={ub.user_id}>
                                <TableCell className="font-medium">{ub.user_name}</TableCell>
                                <TableCell className="text-right">
                                  <span className={ub.balance > 0 ? 'text-green-600 font-bold' : 'text-red-600'}>
                                    ₹{ub.balance.toLocaleString()}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <h3 className="font-medium flex items-center gap-2 mt-6">
                      <CreditCard className="h-4 w-4" />
                      Recent Petty Cash Transactions
                    </h3>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead>By</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactions.slice(0, 20).map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="whitespace-nowrap">
                                {format(parseISO(t.created_at), 'dd MMM yyyy')}
                              </TableCell>
                              <TableCell>{t.user_name}</TableCell>
                              <TableCell>
                                <Badge variant={t.transaction_type === 'cash_given' || t.transaction_type === 'overpayment_credit' ? 'default' : 'secondary'}>
                                  {t.transaction_type.replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                <span className={t.transaction_type === 'cash_given' || t.transaction_type === 'overpayment_credit' ? 'text-green-600' : 'text-red-600'}>
                                  {t.transaction_type === 'cash_given' || t.transaction_type === 'overpayment_credit' ? '+' : '-'}₹{t.amount.toLocaleString()}
                                </span>
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate">{t.notes || '-'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{t.created_by_name}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>
              ) : (
                <TabsContent value={activeTab} className="mt-0">
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Receipt</TableHead>
                          <TableHead>Linked To</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Submitted By</TableHead>
                          {canApprove && <TableHead>Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredExpenses.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={canApprove ? 11 : 10} className="text-center py-8 text-muted-foreground">
                              No expenses found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredExpenses.map((expense) => {
                            const amountPaid = (expense as any).amount_paid || 0;
                            const paidFromPetty = (expense as any).paid_from_petty_cash || 0;
                            const pendingAmount = expense.amount - amountPaid;
                            const linkedOrderIds = getLinkedOrdersForExpense(expense.id);
                            const linkedProcurementIds = getLinkedProcurementsForExpense(expense.id);
                            const linkedOrders = orders.filter(o => linkedOrderIds.includes(o.id));
                            const linkedProcs = procurements.filter(p => linkedProcurementIds.includes(p.id));

                            return (
                              <TableRow key={expense.id}>
                                <TableCell className="whitespace-nowrap">
                                  {format(parseISO(expense.expense_date), 'dd MMM yyyy')}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{getExpenseTypeLabel(expense.expense_type)}</Badge>
                                </TableCell>
                                <TableCell className="max-w-[200px] truncate">
                                  {expense.description || '-'}
                                </TableCell>
                                <TableCell>{expense.vendor_name || '-'}</TableCell>
                                <TableCell>
                                  {expense.receipt_url ? (
                                    <button
                                      onClick={() => {
                                        setReceiptViewerUrl(expense.receipt_url);
                                        setReceiptViewerName(expense.description || 'Receipt');
                                        setReceiptViewerOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 text-primary hover:underline"
                                    >
                                      <FileText className="h-4 w-4" />
                                      <span className="text-xs">View</span>
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="space-y-1">
                                    {linkedOrders.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {linkedOrders.map(o => (
                                          <Badge key={o.id} variant="secondary" className="text-xs">
                                            <ShoppingCart className="h-3 w-3 mr-1" />
                                            {o.order_number || 'Order'}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    {linkedProcs.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {linkedProcs.map(p => (
                                          <Badge key={p.id} variant="outline" className="text-xs">
                                            <Package className="h-3 w-3 mr-1" />
                                            {p.procurement_number || 'Proc'}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                    {linkedOrders.length === 0 && linkedProcs.length === 0 && (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  ₹{expense.amount.toLocaleString()}
                                  {paidFromPetty > 0 && (
                                    <div className="text-xs text-green-600">₹{paidFromPetty} from petty cash</div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={amountPaid >= expense.amount ? 'text-green-600' : 'text-orange-600'}>
                                    ₹{amountPaid.toLocaleString()}
                                  </span>
                                  {pendingAmount > 0 && (
                                    <div className="text-xs text-red-600">₹{pendingAmount} pending</div>
                                  )}
                                </TableCell>
                                <TableCell>{getStatusBadge(expense.status)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {expense.created_by_name}
                                </TableCell>
                                {canApprove && (
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      {expense.status === 'pending' && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                            onClick={() => approveExpense(expense.id)}
                                            title="Approve"
                                          >
                                            <Check className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            onClick={() => rejectExpense(expense.id)}
                                            title="Reject"
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </>
                                      )}
                                      {(expense.status === 'approved' || expense.status === 'pending') && pendingAmount > 0 && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-xs"
                                          onClick={() => openPaymentDialog(expense)}
                                        >
                                          Record Payment
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {/* Record Payment Dialog */}
        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Record Payment
              </DialogTitle>
            </DialogHeader>
            {selectedExpense && (
              <div className="space-y-4 pt-4">
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expense Amount</span>
                    <span className="font-medium">₹{selectedExpense.amount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Already Paid</span>
                    <span className="font-medium text-green-600">₹{((selectedExpense as any).amount_paid || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t pt-2">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-medium text-red-600">
                      ₹{(selectedExpense.amount - ((selectedExpense as any).amount_paid || 0)).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    For: {selectedExpense.created_by_name}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Payment Amount (₹) *</Label>
                  <Input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  {parseFloat(paymentAmount) > (selectedExpense.amount - ((selectedExpense as any).amount_paid || 0)) && (
                    <p className="text-xs text-green-600">
                      ₹{(parseFloat(paymentAmount) - (selectedExpense.amount - ((selectedExpense as any).amount_paid || 0))).toLocaleString()} will be credited to {selectedExpense.created_by_name}'s petty cash
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Payment reference, mode, etc."
                    rows={2}
                  />
                </div>

                <Button 
                  onClick={handleRecordPayment} 
                  className="w-full" 
                  disabled={recordingPayment || !paymentAmount}
                >
                  {recordingPayment ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Recording...
                    </>
                  ) : (
                    'Record Payment'
                  )}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
