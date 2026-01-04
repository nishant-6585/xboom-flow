import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Supplier } from '@/hooks/useSuppliers';
import { Building2, Phone, Mail, MapPin, Star, Edit, BookOpen } from 'lucide-react';

interface SupplierCardProps {
  supplier: Supplier;
  onEdit: (supplier: Supplier) => void;
  onViewLedger: (supplier: Supplier) => void;
}

const preferenceConfig: Record<string, { label: string; className: string }> = {
  high: {
    label: 'High Priority',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  medium: {
    label: 'Medium Priority',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  low: {
    label: 'Low Priority',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  },
};

export function SupplierCard({ supplier, onEdit, onViewLedger }: SupplierCardProps) {
  const prefConfig = preferenceConfig[supplier.preference];

  return (
    <Card className="glass hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <h3 className="font-semibold truncate">{supplier.name}</h3>
              <Badge className={prefConfig.className}>
                <Star className="h-3 w-3 mr-1" />
                {prefConfig.label}
              </Badge>
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
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
