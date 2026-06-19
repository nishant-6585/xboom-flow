import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Mail, AlertCircle } from 'lucide-react';
import { isValidEmail, BYPASS_REASONS } from '@/lib/invoiceEmail';

export interface InvoiceEmailState {
  send: boolean;
  email: string;
  bypassPreset: string;
  bypassNotes: string;
}

interface Props {
  state: InvoiceEmailState;
  onChange: (s: InvoiceEmailState) => void;
  /** If true, user is admin/finance and may turn the checkbox OFF. */
  canBypass: boolean;
  className?: string;
}

export function defaultEmailState(initialEmail: string | null | undefined): InvoiceEmailState {
  return {
    send: true,
    email: (initialEmail || '').trim(),
    bypassPreset: BYPASS_REASONS[0],
    bypassNotes: '',
  };
}

/**
 * Validates the state and returns the bypass reason text (when skip).
 * Throws a user-friendly Error when invalid — caller catches and toasts.
 */
export function validateEmailState(s: InvoiceEmailState): { mode: 'auto' | 'skip'; email?: string; bypassReason?: string } {
  if (s.send) {
    if (!isValidEmail(s.email)) {
      throw new Error('A valid customer email is required to send the invoice.');
    }
    return { mode: 'auto', email: s.email.trim() };
  }
  const reason = [s.bypassPreset, s.bypassNotes.trim()].filter(Boolean).join(' — ');
  if (!reason || reason.length < 3) {
    throw new Error('Please pick a bypass reason for skipping the email.');
  }
  return { mode: 'skip', bypassReason: reason };
}

export function InvoiceEmailControl({ state, onChange, canBypass, className }: Props) {
  const [touched, setTouched] = useState(false);

  // Force send=true if user can't bypass
  useEffect(() => {
    if (!canBypass && !state.send) onChange({ ...state, send: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBypass]);

  const emailInvalid = state.send && touched && !isValidEmail(state.email);

  return (
    <div className={`border rounded-lg p-3 space-y-3 bg-muted/30 ${className || ''}`}>
      <div className="flex items-start gap-2">
        <Checkbox
          id="email-invoice-toggle"
          checked={state.send}
          disabled={!canBypass}
          onCheckedChange={(v) => onChange({ ...state, send: !!v })}
        />
        <div className="flex-1">
          <Label htmlFor="email-invoice-toggle" className="cursor-pointer flex items-center gap-1.5 font-medium">
            <Mail className="h-4 w-4" />
            Email invoice to customer
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {canBypass
              ? 'Default: sent automatically. Uncheck to skip (requires a reason).'
              : 'Customer email is required. Only Admin/Finance can skip sending.'}
          </p>
        </div>
      </div>

      {state.send ? (
        <div>
          <Label htmlFor="email-invoice-addr" className="text-xs">
            Customer email <span className="text-destructive">*</span>
          </Label>
          <Input
            id="email-invoice-addr"
            type="email"
            placeholder="customer@example.com"
            value={state.email}
            onBlur={() => setTouched(true)}
            onChange={(e) => onChange({ ...state, email: e.target.value })}
            className={emailInvalid ? 'border-destructive' : ''}
          />
          {emailInvalid && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Enter a valid email address.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            This will also be saved on the order.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Reason for skipping <span className="text-destructive">*</span></Label>
            <Select value={state.bypassPreset} onValueChange={(v) => onChange({ ...state, bypassPreset: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BYPASS_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Additional notes (optional)</Label>
            <Textarea
              rows={2}
              value={state.bypassNotes}
              onChange={(e) => onChange({ ...state, bypassNotes: e.target.value })}
              placeholder="Any extra context…"
            />
          </div>
        </div>
      )}
    </div>
  );
}