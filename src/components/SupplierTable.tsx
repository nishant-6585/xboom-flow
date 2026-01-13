import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Supplier } from '@/hooks/useSuppliers';
import { useSupplierRatings } from '@/hooks/useSupplierRatings';
import { Phone, Mail, MapPin, Edit, BookOpen, Star, Building2 } from 'lucide-react';
import { SupplierPreferenceTag } from '@/components/procurement/SupplierPreferenceTag';
import { SupplierScoreBadge } from '@/components/procurement/SupplierScoreBadge';
import { SupplierRatingDialog } from '@/components/procurement/SupplierRatingDialog';

interface SupplierTableProps {
  suppliers: Supplier[];
  onEdit: (supplier: Supplier) => void;
  onViewLedger: (supplier: Supplier) => void;
}

function SupplierTableRow({ 
  supplier, 
  onEdit, 
  onViewLedger 
}: { 
  supplier: Supplier; 
  onEdit: (supplier: Supplier) => void; 
  onViewLedger: (supplier: Supplier) => void;
}) {
  const { score } = useSupplierRatings(supplier.id);
  const [showRatingDialog, setShowRatingDialog] = useState(false);

  return (
    <>
      <TableRow className="hover:bg-muted/50">
        <TableCell>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="font-medium">{supplier.name}</p>
              {supplier.brand_name && (
                <p className="text-xs text-muted-foreground">{supplier.brand_name}</p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="space-y-1">
            <p className="font-medium text-sm">{supplier.contact_name}</p>
            {supplier.mobile && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                {supplier.mobile}
              </div>
            )}
            {supplier.email && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[200px]">
                <Mail className="h-3 w-3" />
                {supplier.email}
              </div>
            )}
          </div>
        </TableCell>
        <TableCell>
          {supplier.city ? (
            <div className="flex items-center gap-1 text-sm">
              <MapPin className="h-3 w-3 text-muted-foreground" />
              {supplier.city}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant="secondary">{supplier.product_category}</Badge>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {supplier.products?.slice(0, 2).map((product) => (
              <Badge key={product} variant="outline" className="text-xs">
                {product}
              </Badge>
            ))}
            {supplier.products && supplier.products.length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{supplier.products.length - 2}
              </span>
            )}
            {(!supplier.products || supplier.products.length === 0) && (
              <span className="text-muted-foreground">-</span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <SupplierPreferenceTag preference={supplier.preference} size="md" />
        </TableCell>
        <TableCell>
          <SupplierScoreBadge score={score} size="sm" />
        </TableCell>
        <TableCell>
          {supplier.is_active ? (
            <Badge className="bg-green-500/20 text-green-700 hover:bg-green-500/30">Active</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => onEdit(supplier)} title="Edit">
              <Edit className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => onViewLedger(supplier)} title="Ledger">
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setShowRatingDialog(true)} title="Rate">
              <Star className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <SupplierRatingDialog
        open={showRatingDialog}
        onOpenChange={setShowRatingDialog}
        supplier={supplier}
      />
    </>
  );
}

export function SupplierTable({ suppliers, onEdit, onViewLedger }: SupplierTableProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[180px]">Supplier</TableHead>
              <TableHead className="w-[200px]">Contact</TableHead>
              <TableHead className="w-[100px]">City</TableHead>
              <TableHead className="w-[140px]">Category</TableHead>
              <TableHead className="w-[180px]">Products</TableHead>
              <TableHead className="w-[100px]">Priority</TableHead>
              <TableHead className="w-[80px]">Score</TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => (
              <SupplierTableRow
                key={supplier.id}
                supplier={supplier}
                onEdit={onEdit}
                onViewLedger={onViewLedger}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
