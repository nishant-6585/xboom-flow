import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PenTool } from 'lucide-react';

interface SignatureSectionProps {
  authorizedSignatory: string;
  onAuthorizedSignatoryChange: (name: string) => void;
  compact?: boolean;
}

export function SignatureSection({
  authorizedSignatory,
  onAuthorizedSignatoryChange,
  compact = false,
}: SignatureSectionProps) {
  if (compact) {
    return (
      <div className="space-y-2">
        <Label className="text-sm flex items-center gap-2">
          <PenTool className="h-4 w-4" />
          Authorized Signatory
        </Label>
        <Input
          value={authorizedSignatory}
          onChange={(e) => onAuthorizedSignatoryChange(e.target.value)}
          placeholder="Name for signature block"
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PenTool className="h-4 w-4" />
          Authorization
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-2">
          <Label>Authorized Signatory Name</Label>
          <Input
            value={authorizedSignatory}
            onChange={(e) => onAuthorizedSignatoryChange(e.target.value)}
            placeholder="Name to appear in signature block"
          />
          <p className="text-xs text-muted-foreground">
            This name will appear in the signature section of the PDF document.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}