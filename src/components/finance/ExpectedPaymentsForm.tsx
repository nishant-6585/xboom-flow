import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useExpectedPayments, ExpectedPaymentFormData } from '@/hooks/useExpectedPayments';
import { Loader2, Plus, Calendar, IndianRupee } from 'lucide-react';

interface ExpectedPaymentsFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders?: Array<{ id: string; order_number: string; customer_name: string; customer_company: string; total_sales_amount: number; amount_paid: number }>;
  pipelineOrders?: Array<{ id: string; customer_name: string; customer_company: string; expected_price: number; product_name: string }>;
}

export function ExpectedPaymentsForm({ open, onOpenChange, orders = [], pipelineOrders = [] }: ExpectedPaymentsFormProps) {
  const { createPayment } = useExpectedPayments();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ExpectedPaymentFormData>({
    source_type: 'manual',
    customer_name: '',
    amount: 0,
    expected_date: new Date().toISOString().split('T')[0],
  });

  const handleSourceChange = (value: 'manual' | 'pipeline' | 'order') => {
    setFormData({ ...formData, source_type: value, source_id: undefined, order_number: undefined });
  };

  const handleOrderSelect = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      const pendingAmount = (order.total_sales_amount || 0) - (order.amount_paid || 0);
      setFormData({
        ...formData,
        source_id: order.id,
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_company: order.customer_company,
        amount: pendingAmount > 0 ? pendingAmount : 0,
      });
    }
  };

  const handlePipelineSelect = (pipelineId: string) => {
    const pipeline = pipelineOrders.find(p => p.id === pipelineId);
    if (pipeline) {
      setFormData({
        ...formData,
        source_id: pipeline.id,
        customer_name: pipeline.customer_name,
        customer_company: pipeline.customer_company,
        amount: pipeline.expected_price || 0,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer_name || !formData.amount || !formData.expected_date) {
      return;
    }

    setLoading(true);
    const success = await createPayment(formData);
    setLoading(false);

    if (success) {
      setFormData({
        source_type: 'manual',
        customer_name: '',
        amount: 0,
        expected_date: new Date().toISOString().split('T')[0],
      });
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Add Expected Payment
          </DialogTitle>
          <DialogDescription>
            Track expected incoming payments for cashflow analysis.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Source Type</Label>
            <Select value={formData.source_type} onValueChange={(v) => handleSourceChange(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual Entry</SelectItem>
                <SelectItem value="order">Link to Order</SelectItem>
                <SelectItem value="pipeline">Link to Pipeline</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.source_type === 'order' && orders.length > 0 && (
            <div className="space-y-2">
              <Label>Select Order</Label>
              <Select onValueChange={handleOrderSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an order" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map(order => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.order_number} - {order.customer_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {formData.source_type === 'pipeline' && pipelineOrders.length > 0 && (
            <div className="space-y-2">
              <Label>Select Pipeline</Label>
              <Select onValueChange={handlePipelineSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelineOrders.map(pipeline => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.customer_name} - {pipeline.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_name">Customer Name *</Label>
              <Input
                id="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="Customer name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_company">Company</Label>
              <Input
                id="customer_company"
                value={formData.customer_company || ''}
                onChange={(e) => setFormData({ ...formData, customer_company: e.target.value })}
                placeholder="Company name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₹) *</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="amount"
                  type="number"
                  min={0}
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  className="pl-9"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expected_date">Expected Date *</Label>
              <Input
                id="expected_date"
                type="date"
                value={formData.expected_date}
                onChange={(e) => setFormData({ ...formData, expected_date: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this expected payment..."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
