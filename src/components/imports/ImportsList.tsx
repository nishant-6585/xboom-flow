import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useImports, Import, ImportItem } from "@/hooks/useImports";
import { ImportFormDialog } from "./ImportFormDialog";
import { ImportStatusBadge } from "./ImportStatusBadge";
import { 
  Plus, 
  Search, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  FileText, 
  ExternalLink,
  Ship,
  Package,
  Clock,
  CheckCircle2,
  DollarSign,
  RefreshCcw
} from "lucide-react";
import { format } from "date-fns";

export function ImportsList() {
  const { imports, loading, createImport, updateImport, deleteImport, refetch } = useImports();
  const [searchQuery, setSearchQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingImport, setEditingImport] = useState<Import | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [importToDelete, setImportToDelete] = useState<Import | null>(null);

  const filteredImports = imports.filter(imp => 
    imp.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    imp.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    imp.import_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEdit = (imp: Import) => {
    setEditingImport(imp);
    setFormOpen(true);
  };

  const handleDelete = (imp: Import) => {
    setImportToDelete(imp);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (importToDelete) {
      await deleteImport(importToDelete.id);
      setDeleteDialogOpen(false);
      setImportToDelete(null);
    }
  };

  const handleSubmit = async (data: Omit<Import, 'id' | 'created_at' | 'updated_at'>, items: ImportItem[]) => {
    const result = editingImport
      ? await updateImport(editingImport.id, data, items)
      : await createImport(data, items);
    if (result?.ok) setEditingImport(null);
    return result;
  };


  // Stats calculations
  const stats = {
    total: imports.length,
    inTransit: imports.filter(i => ['shipped', 'in_transit', 'at_port'].includes(i.status)).length,
    customs: imports.filter(i => i.status === 'customs_clearance').length,
    delivered: imports.filter(i => i.status === 'delivered').length,
    totalValue: imports.reduce((sum, i) => sum + (i.total_amount || 0), 0),
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Paid</Badge>;
      case 'partial':
        return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Partial</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Imports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Ship className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.inTransit}</p>
                <p className="text-xs text-muted-foreground">In Transit</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.customs}</p>
                <p className="text-xs text-muted-foreground">Customs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.delivered}</p>
                <p className="text-xs text-muted-foreground">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">${stats.totalValue.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Value</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Ship className="w-5 h-5" />
              Imports
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search imports..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="icon" onClick={refetch}>
                <RefreshCcw className="w-4 h-4" />
              </Button>
              <Button onClick={() => { setEditingImport(null); setFormOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Import
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">Loading imports...</div>
            </div>
          ) : filteredImports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Ship className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-1">No imports found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Try a different search term' : 'Get started by adding your first import'}
              </p>
              {!searchQuery && (
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Import
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Import #</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredImports.map((imp, index) => (
                    <TableRow 
                      key={imp.id}
                      className={index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                    >
                      <TableCell>
                        <span className="font-mono text-sm font-medium">
                          {imp.import_number || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{imp.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty: {imp.quantity}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{imp.supplier_name || '-'}</p>
                          {imp.origin_country && (
                            <p className="text-xs text-muted-foreground">{imp.origin_country}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ImportStatusBadge status={imp.status} />
                      </TableCell>
                      <TableCell>
                        {getPaymentBadge(imp.payment_status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-medium">
                          {imp.currency} {(imp.total_amount || 0).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        {imp.expected_arrival ? (
                          <span className="text-sm">
                            {format(new Date(imp.expected_arrival), 'MMM d, yyyy')}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {imp.po_document_url && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={imp.po_document_url} target="_blank" rel="noopener noreferrer" title="PO">
                                <FileText className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                          {imp.bill_of_entry_url && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <a href={imp.bill_of_entry_url} target="_blank" rel="noopener noreferrer" title="Bill of Entry">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(imp)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(imp)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <ImportFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingImport(null);
        }}
        onSubmit={handleSubmit}
        editingImport={editingImport}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Import</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete import "{importToDelete?.import_number}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
