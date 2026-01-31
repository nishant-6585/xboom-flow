import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Landmark } from 'lucide-react';

// Company bank details - can be configured in settings
const COMPANY_BANK_DETAILS = {
  bankName: 'HDFC Bank',
  accountName: 'Xboom Technologies Pvt Ltd',
  accountNumber: 'XXXX XXXX XXXX 1234',
  ifscCode: 'HDFC0001234',
  branch: 'Bengaluru - Koramangala',
  upiId: 'xboom@hdfcbank',
};

interface BankDetailsSectionProps {
  includeBankDetails: boolean;
  onIncludeBankDetailsChange: (include: boolean) => void;
  compact?: boolean;
}

export function BankDetailsSection({
  includeBankDetails,
  onIncludeBankDetailsChange,
  compact = false,
}: BankDetailsSectionProps) {
  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Include Bank Details in PDF</span>
        </div>
        <Switch
          checked={includeBankDetails}
          onCheckedChange={onIncludeBankDetailsChange}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Bank Details
          </CardTitle>
          <div className="flex items-center gap-2">
            <Switch
              id="include-bank"
              checked={includeBankDetails}
              onCheckedChange={onIncludeBankDetailsChange}
            />
            <Label htmlFor="include-bank" className="text-sm font-normal">
              Include in Document
            </Label>
          </div>
        </div>
      </CardHeader>
      {includeBankDetails && (
        <CardContent className="pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <div>
              <span className="text-muted-foreground">Bank Name:</span>
              <p className="font-medium">{COMPANY_BANK_DETAILS.bankName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Account Name:</span>
              <p className="font-medium">{COMPANY_BANK_DETAILS.accountName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Account Number:</span>
              <p className="font-medium">{COMPANY_BANK_DETAILS.accountNumber}</p>
            </div>
            <div>
              <span className="text-muted-foreground">IFSC Code:</span>
              <p className="font-medium">{COMPANY_BANK_DETAILS.ifscCode}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Branch:</span>
              <p className="font-medium">{COMPANY_BANK_DETAILS.branch}</p>
            </div>
            <div>
              <span className="text-muted-foreground">UPI ID:</span>
              <p className="font-medium">{COMPANY_BANK_DETAILS.upiId}</p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}