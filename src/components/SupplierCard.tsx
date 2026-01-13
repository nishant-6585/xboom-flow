import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Supplier } from '@/hooks/useSuppliers';
import { useSupplierRatings } from '@/hooks/useSupplierRatings';
import { Building2, Phone, Mail, MapPin, Edit, BookOpen, Star } from 'lucide-react';
import { SupplierPreferenceTag } from '@/components/procurement/SupplierPreferenceTag';
import { SupplierScoreBadge } from '@/components/procurement/SupplierScoreBadge';
import { SupplierRatingDialog } from '@/components/procurement/SupplierRatingDialog';

interface SupplierCardProps {
  supplier: Supplier;
  onEdit: (supplier: Supplier) => void;
  onViewLedger: (supplier: Supplier) => void;
}

export function SupplierCard({ supplier, onEdit, onViewLedger }: SupplierCardProps) {
  const { score } = useSupplierRatings(supplier.id);
  const [showRatingDialog, setShowRatingDialog] = useState(false);

  return (
    <>
      <Card className="glass hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <h3 className="font-semibold truncate">{supplier.name}</h3>
                <SupplierPreferenceTag preference={supplier.preference} size="md" />
                <SupplierScoreBadge score={score} size="sm" />
                {!supplier.is_active && (
                  <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                )}
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-medium">Contact:</span>
                <span>{supplier.contact_name}</span>
              </div>
              {supplier.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  <span>{supplier.phone}</span>
                </div>
              )}
              {supplier.email && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{supplier.email}</span>
                </div>
              )}
              {supplier.city && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{supplier.city}</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{supplier.product_category}</Badge>
              {supplier.products?.slice(0, 3).map((product) => (
                <Badge key={product} variant="outline" className="text-xs">
                  {product}
                </Badge>
              ))}
              {supplier.products && supplier.products.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{supplier.products.length - 3} more
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => onEdit(supplier)}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onViewLedger(supplier)}>
              <BookOpen className="h-4 w-4 mr-1" />
              Ledger
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowRatingDialog(true)}>
              <Star className="h-4 w-4 mr-1" />
              Rate
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <SupplierRatingDialog
      open={showRatingDialog}
      onOpenChange={setShowRatingDialog}
      supplier={supplier}
    />
  </>
);
}
