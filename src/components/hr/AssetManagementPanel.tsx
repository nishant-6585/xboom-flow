import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Package, Download, Upload, MoreVertical } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import useEmployeeAssets, {
  EmployeeAsset,
  ASSET_TYPES,
  ASSET_STATUSES,
  AssetFormData,
} from "@/hooks/useEmployeeAssets";
import { AssetFormDialog } from "./AssetFormDialog";
import { AssetImportDialog } from "./AssetImportDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Employee {
  id: string;
  name: string;
  is_active?: boolean;
}

export function AssetManagementPanel() {
  const { assets, loading, createAsset, updateAsset, deleteAsset, refetch } = useEmployeeAssets();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<EmployeeAsset | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [returnDialogAsset, setReturnDialogAsset] = useState<EmployeeAsset | null>(null);
  const [returnData, setReturnData] = useState({
    return_date: new Date().toISOString().split("T")[0],
    condition_on_return: "",
  });
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");

  const { toast } = useToast();
  const { user, profile } = useAuth();

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, name, is_active")
        .order("name");
      if (data) {
        // Sort active employees first, then inactive (offboarded) — both remain selectable
        const sorted = [...data].sort((a, b) => {
          if ((b.is_active ? 1 : 0) - (a.is_active ? 1 : 0) !== 0) {
            return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0);
          }
          return (a.name || "").localeCompare(b.name || "");
        });
        setEmployees(sorted);
      }
    };
    fetchEmployees();
  }, []);

  const handleSubmit = async (data: AssetFormData) => {
    if (editingAsset) {
      return await updateAsset(editingAsset.id, data);
    }
    return await createAsset(data);
  };

  const handleEdit = (asset: EmployeeAsset) => {
    setEditingAsset(asset);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (deleteConfirmId) {
      await deleteAsset(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleMarkReturned = async () => {
    if (returnDialogAsset) {
      await updateAsset(returnDialogAsset.id, {
        status: "returned",
        return_date: returnData.return_date,
        condition_on_return: returnData.condition_on_return || undefined,
      });
      setReturnDialogAsset(null);
      setReturnData({
        return_date: new Date().toISOString().split("T")[0],
        condition_on_return: "",
      });
    }
  };

  // Export assets to Excel
  const handleExport = () => {
    const exportData = filteredAssets.map((asset) => ({
      "Employee Name": asset.employees?.name || "",
      "Asset Type": ASSET_TYPES.find(t => t.value === asset.asset_type)?.label || asset.asset_type,
      "Asset Name": asset.asset_name,
      "Brand": asset.brand || "",
      "Model": asset.model || "",
      "Serial Number": asset.serial_number || "",
      "IMEI Number": asset.imei_number || "",
      "SIM Number": asset.sim_number || "",
      "Phone Number": asset.phone_number || "",
      "Purchase Date": asset.purchase_date || "",
      "Purchase Price": asset.purchase_price || "",
      "Assigned Date": asset.assigned_date,
      "Return Date": asset.return_date || "",
      "Status": ASSET_STATUSES.find(s => s.value === asset.status)?.label || asset.status,
      "Condition on Assign": asset.condition_on_assign || "",
      "Condition on Return": asset.condition_on_return || "",
      "Notes": asset.notes || "",
      "Assigned By": asset.assigned_by_name || "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Assets");
    XLSX.writeFile(wb, `assets_export_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: "Export Complete",
      description: `Exported ${exportData.length} assets to Excel`,
    });
  };

  // Handle bulk import
  const handleImport = async (parsedAssets: any[]) => {
    let successCount = 0;
    let errorCount = 0;

    for (const asset of parsedAssets) {
      try {
        const { error } = await supabase.from("employee_assets").insert({
          employee_id: asset.employee_id,
          asset_type: asset.asset_type,
          asset_name: asset.asset_name,
          brand: asset.brand || null,
          model: asset.model || null,
          serial_number: asset.serial_number || null,
          imei_number: asset.imei_number || null,
          sim_number: asset.sim_number || null,
          phone_number: asset.phone_number || null,
          purchase_date: asset.purchase_date || null,
          purchase_price: asset.purchase_price || null,
          assigned_date: asset.assigned_date,
          status: asset.status,
          condition_on_assign: asset.condition_on_assign || null,
          notes: asset.notes || null,
          assigned_by: user?.id,
          assigned_by_name: profile?.name || 'Unknown',
        });

        if (error) throw error;
        successCount++;
      } catch (error) {
        console.error("Error importing asset:", error);
        errorCount++;
      }
    }

    toast({
      title: "Import Complete",
      description: `Successfully imported ${successCount} assets${errorCount > 0 ? `, ${errorCount} failed` : ""}`,
      variant: errorCount > 0 ? "destructive" : "default",
    });

    // Refresh the assets list
    refetch();
  };

  const filteredAssets = assets.filter((asset) => {
    const matchesSearch =
      !searchQuery ||
      asset.asset_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.serial_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.employees?.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = typeFilter === "all" || asset.asset_type === typeFilter;
    const matchesStatus = statusFilter === "all" || asset.status === statusFilter;
    const matchesEmployee = employeeFilter === "all" || asset.employee_id === employeeFilter;

    return matchesSearch && matchesType && matchesStatus && matchesEmployee;
  });

  // Group assets by type for summary
  const assetSummary = assets.reduce((acc, asset) => {
    if (asset.status === "assigned") {
      acc[asset.asset_type] = (acc[asset.asset_type] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded animate-pulse" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-muted/50 rounded-lg text-center">
          <p className="text-2xl font-bold text-primary">{assets.length}</p>
          <p className="text-xs text-muted-foreground">Total Assets</p>
        </div>
        <div className="p-3 bg-green-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-green-600">
            {assets.filter((a) => a.status === "assigned").length}
          </p>
          <p className="text-xs text-muted-foreground">Assigned</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-gray-600">
            {assets.filter((a) => a.status === "returned").length}
          </p>
          <p className="text-xs text-muted-foreground">Returned</p>
        </div>
        <div className="p-3 bg-orange-50 rounded-lg text-center">
          <p className="text-2xl font-bold text-orange-600">
            {assets.filter((a) => ["lost", "damaged", "under_repair"].includes(a.status)).length}
          </p>
          <p className="text-xs text-muted-foreground">Issues</p>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search assets, serial numbers, employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ASSET_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {ASSET_STATUSES.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Employee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((emp) => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.name}{emp.is_active === false ? " (Offboarded)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import Assets
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExport} disabled={assets.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export Assets
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          onClick={() => {
            setEditingAsset(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Asset
        </Button>
      </div>

      {/* Assets Grid */}
      {filteredAssets.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No assets found</h3>
          <p className="text-muted-foreground">
            {assets.length === 0
              ? "Start by adding your first asset"
              : "Try adjusting your filters"}
          </p>
        </div>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Brand / Model</TableHead>
                <TableHead>Serial Number</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned Date</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.map((asset) => {
                const statusInfo = ASSET_STATUSES.find((s) => s.value === asset.status);
                const typeLabel = ASSET_TYPES.find((t) => t.value === asset.asset_type)?.label || asset.asset_type;
                return (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.asset_name}</TableCell>
                    <TableCell>{typeLabel}</TableCell>
                    <TableCell>{asset.employees?.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{[asset.brand, asset.model].filter(Boolean).join(" • ") || "—"}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{asset.serial_number || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{asset.phone_number || "—"}</TableCell>
                    <TableCell>
                      <Badge className={statusInfo?.color || "bg-muted"}>
                        {statusInfo?.label || asset.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(asset.assigned_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right">{asset.purchase_price ? `₹${asset.purchase_price.toLocaleString()}` : "—"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(asset)}>Edit</DropdownMenuItem>
                          {asset.status === "assigned" && (
                            <DropdownMenuItem onClick={() => setReturnDialogAsset(asset)}>Mark Returned</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setDeleteConfirmId(asset.id)} className="text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Form Dialog */}
      <AssetFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingAsset(null);
        }}
        onSubmit={handleSubmit}
        employees={employees}
        editingAsset={editingAsset}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The asset record will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Return Dialog */}
      <Dialog open={!!returnDialogAsset} onOpenChange={() => setReturnDialogAsset(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Asset as Returned</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Return Date</Label>
              <Input
                type="date"
                value={returnData.return_date}
                onChange={(e) =>
                  setReturnData({ ...returnData, return_date: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Condition on Return</Label>
              <Textarea
                value={returnData.condition_on_return}
                onChange={(e) =>
                  setReturnData({ ...returnData, condition_on_return: e.target.value })
                }
                placeholder="Describe the condition of the asset..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogAsset(null)}>
              Cancel
            </Button>
            <Button onClick={handleMarkReturned}>Confirm Return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <AssetImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
        employees={employees}
      />
    </div>
  );
}
