import { useState } from 'react';
import { AlertTriangle, Phone, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrdersMissingPhone, MissingPhoneOrder } from '@/hooks/useOrdersMissingPhone';
import { useOrders } from '@/hooks/useOrders';

interface MissingPhoneBannerProps {
  onOpenOrder?: (orderId: string) => void;
}

/**
 * Yellow alert shown on Orders / Dashboard listing orders that are missing a
 * customer mobile. SMS updates cannot be sent until the salesperson fixes them.
 */
export function MissingPhoneBanner({ onOpenOrder }: MissingPhoneBannerProps) {
  const { orders, loading } = useOrdersMissingPhone();
  const { orders: allOrders } = useOrders();
  const [expanded, setExpanded] = useState(false);

  if (loading || orders.length === 0) return null;

  const visible = expanded ? orders : orders.slice(0, 3);

  const handleClick = (mp: MissingPhoneOrder) => {
    if (!onOpenOrder) return;
    // Make sure the order exists in the loaded list before opening
    const exists = allOrders.find((o) => o.id === mp.id);
    if (exists) onOpenOrder(mp.id);
    else onOpenOrder(mp.id); // still call; parent decides fallback
  };

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="font-semibold text-amber-900 dark:text-amber-100">
              {orders.length} order{orders.length === 1 ? '' : 's'} missing customer mobile
            </h4>
            {orders.length > 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <>Show less <ChevronUp className="h-4 w-4 ml-1" /></>
                ) : (
                  <>Show all ({orders.length}) <ChevronDown className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            )}
          </div>
          <p className="text-sm text-amber-800 dark:text-amber-200/90 mt-0.5">
            Customers can&apos;t receive SMS order updates without a valid mobile number. Please add one.
          </p>
          <ul className="mt-3 space-y-1.5">
            {visible.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-md bg-white/70 dark:bg-amber-900/20 px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{o.order_number}</span>
                  <span className="text-muted-foreground">
                    {' '}— {o.customer_name || 'Unnamed'}
                    {o.customer_company ? ` (${o.customer_company})` : ''}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 border-amber-400 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  onClick={() => handleClick(o)}
                >
                  <Phone className="h-3.5 w-3.5 mr-1" />
                  Add phone
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}