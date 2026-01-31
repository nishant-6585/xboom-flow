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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Package } from "lucide-react";
import useEmployeeAssets, {
  EmployeeAsset,
  ASSET_TYPES,
  ASSET_STATUSES,
  AssetFormData,
} from "@/hooks/useEmployeeAssets";
import { AssetFormDialog } from "./AssetFormDialog";
import { AssetCard } from "./AssetCard";
import { supabase } from "@/integrations/supabase/client";

interface Employee {
  id: string;
  name: string;
}

export function AssetManagementPanel() {
  const { assets, loading, createAsset, updateAsset, deleteAsset } = useEmployeeAssets();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<EmployeeAsset | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [returnDialogAsset, setReturnDialogAsset] = useState<EmployeeAsset | null>(null);
  const [returnData, setReturnData] = useState({
    return_date: new Date().toISOString().split("T")[0],
    condition_on_return: "",
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");

  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (data) setEmployees(data);
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
                {emp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAssets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteConfirmId(id)}
              onMarkReturned={(asset) => setReturnDialogAsset(asset)}
            />
          ))}
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
    </div>
  );
}
