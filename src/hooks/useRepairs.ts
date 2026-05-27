import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type RepairIssueType = 
  | 'motor_failure'
  | 'gimbal_issue'
  | 'camera_damage'
  | 'battery_problem'
  | 'gps_issue'
  | 'remote_controller'
  | 'propeller_damage'
  | 'frame_damage'
  | 'flight_controller'
  | 'esc_issue'
  | 'software_issue'
  | 'water_damage'
  | 'crash_damage'
  | 'other';

export type RepairPaymentStatus = 'pending' | 'partial' | 'paid';

export type RepairStage =
  | 'pending_receipt'
  | 'received'
  | 'diagnosing'
  | 'quoted'
  | 'in_repair'
  | 'ready_for_pickup'
  | 'delivered'
  | 'cancelled'
  | 'returned_unrepaired';

export interface RepairStageMeta {
  value: RepairStage;
  label: string;
  category: 'open' | 'closed';
  description?: string;
}

export const REPAIR_STAGES: ReadonlyArray<RepairStageMeta> = [
  { value: 'pending_receipt',     label: 'Pending Receipt',       category: 'open',   description: 'Awaiting physical arrival' },
  { value: 'received',            label: 'Received',              category: 'open' },
  { value: 'diagnosing',          label: 'Diagnosing',            category: 'open' },
  { value: 'quoted',              label: 'Quote Sent',            category: 'open',   description: 'Awaiting customer approval' },
  { value: 'in_repair',           label: 'In Repair',             category: 'open' },
  { value: 'ready_for_pickup',    label: 'Ready for Pickup',      category: 'open' },
  { value: 'delivered',           label: 'Delivered',             category: 'closed' },
  { value: 'cancelled',           label: 'Cancelled',             category: 'closed' },
  { value: 'returned_unrepaired', label: 'Returned (Unrepaired)', category: 'closed' },
];

export const TERMINAL_REPAIR_STAGES: ReadonlyArray<RepairStage> = [
  'delivered', 'cancelled', 'returned_unrepaired',
];

export function isTerminalRepairStage(s: RepairStage | string | null | undefined): boolean {
  return !!s && (TERMINAL_REPAIR_STAGES as readonly string[]).includes(s);
}

export function getRepairStageLabel(s: RepairStage | string | null | undefined): string {
  return REPAIR_STAGES.find(x => x.value === s)?.label ?? (s ? String(s) : 'Unknown');
}

export function getRepairStageBadgeClass(s: RepairStage | string | null | undefined): string {
  switch (s) {
    case 'pending_receipt':     return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';
    case 'received':            return 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20';
    case 'diagnosing':          return 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20';
    case 'quoted':              return 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20';
    case 'in_repair':           return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20';
    case 'ready_for_pickup':    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20';
    case 'delivered':           return 'bg-green-600/10 text-green-700 dark:text-green-300 border-green-600/20';
    case 'cancelled':           return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'returned_unrepaired': return 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20';
    default:                    return 'bg-muted text-muted-foreground border-border';
  }
}

/**
 * Next valid stages from the current one. Mirrors `is_valid_repair_stage_transition`
 * in the DB — keep both in sync.
 */
export function getNextValidStages(s: RepairStage | string | null | undefined): RepairStage[] {
  switch (s) {
    case 'pending_receipt':     return ['received', 'cancelled'];
    case 'received':            return ['diagnosing', 'cancelled', 'returned_unrepaired'];
    case 'diagnosing':          return ['quoted', 'cancelled', 'returned_unrepaired'];
    case 'quoted':              return ['in_repair', 'cancelled', 'returned_unrepaired'];
    case 'in_repair':           return ['ready_for_pickup', 'cancelled', 'returned_unrepaired'];
    case 'ready_for_pickup':    return ['delivered', 'cancelled'];
    default:                    return [];
  }
}

export interface RepairStageHistoryRow {
  id: string;
  repair_id: string;
  from_stage: RepairStage | null;
  to_stage: RepairStage;
  changed_by: string | null;
  changed_by_name: string | null;
  notes: string | null;
  changed_at: string;
}

export interface ComponentReplaced {
  name: string;
  cost: number;
  // Optional — present only for inventory-linked components
  part_id?: string | null;
  part_code?: string | null;
  quantity?: number;
  cost_per_unit?: number;
}

export const isInventoryLinkedComponent = (c: ComponentReplaced): boolean => !!c.part_id;

export interface Repair {
  id: string;
  repair_number: string | null;
  customer_name: string;
  model_name: string;
  date_of_receipt: string;
  contact_no: string;
  issue_details: string | null;
  issue_type: RepairIssueType;
  components_replaced: ComponentReplaced[];
  total_component_cost: number;
  inspection_charges: number;
  repair_cost_charged: number;
  date_completed: string | null;
  days_to_complete: number | null;
  committed_date: string | null;
  payment_status: RepairPaymentStatus;
  advance_amount: number;
  total_quote_amount: number;
  balance_amount: number;
  profit: number;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  email: string | null;
  intake_payload: Record<string, unknown> | null;
  source_lead_id: number | null;
  // v2 — stage state machine
  repair_stage: RepairStage;
  item_received_at: string | null;
  assigned_technician_id: string | null;
  assigned_technician_name: string | null;
  quote_sent_at: string | null;
  quote_accepted_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  duplicate_source_lead_ids: number[];
}

export interface RepairFormData {
  customer_name: string;
  model_name: string;
  date_of_receipt: string;
  contact_no: string;
  issue_details?: string;
  issue_type: RepairIssueType;
  components_replaced: ComponentReplaced[];
  inspection_charges: number;
  repair_cost_charged: number;
  date_completed?: string | null;
  committed_date?: string | null;
  payment_status: RepairPaymentStatus;
  advance_amount: number;
  total_quote_amount: number;
  notes?: string;
}

export const ISSUE_TYPES: { value: RepairIssueType; label: string }[] = [
  { value: 'motor_failure', label: 'Motor Failure' },
  { value: 'gimbal_issue', label: 'Gimbal Issue' },
  { value: 'camera_damage', label: 'Camera Damage' },
  { value: 'battery_problem', label: 'Battery Problem' },
  { value: 'gps_issue', label: 'GPS Issue' },
  { value: 'remote_controller', label: 'Remote Controller' },
  { value: 'propeller_damage', label: 'Propeller Damage' },
  { value: 'frame_damage', label: 'Frame Damage' },
  { value: 'flight_controller', label: 'Flight Controller' },
  { value: 'esc_issue', label: 'ESC Issue' },
  { value: 'software_issue', label: 'Software Issue' },
  { value: 'water_damage', label: 'Water Damage' },
  { value: 'crash_damage', label: 'Crash Damage' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_STATUSES: { value: RepairPaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

export function useRepairs() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchRepairs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("repairs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Transform the data to ensure components_replaced is properly typed
      const transformedData = (data || []).map(repair => ({
        ...repair,
        components_replaced: (Array.isArray(repair.components_replaced) 
          ? repair.components_replaced 
          : []) as unknown as ComponentReplaced[],
        duplicate_source_lead_ids: (Array.isArray((repair as { duplicate_source_lead_ids?: unknown }).duplicate_source_lead_ids)
          ? (repair as { duplicate_source_lead_ids: unknown[] }).duplicate_source_lead_ids
          : []) as number[],
      }));
      
      setRepairs(transformedData as Repair[]);
    } catch (error: any) {
      console.error("Error fetching repairs:", error);
      toast({
        title: "Error",
        description: "Failed to load repairs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepairs();

    // Set up realtime subscription
    const channel = supabase
      .channel("repairs-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "repairs" },
        () => {
          fetchRepairs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const createRepair = async (formData: RepairFormData, userId: string, userName: string) => {
    try {
      const totalComponentCost = formData.components_replaced.reduce(
        (sum, comp) => sum + (comp.cost || 0),
        0
      );

      const insertData = {
        customer_name: formData.customer_name,
        model_name: formData.model_name,
        date_of_receipt: formData.date_of_receipt,
        contact_no: formData.contact_no,
        issue_details: formData.issue_details || null,
        issue_type: formData.issue_type,
        components_replaced: JSON.parse(JSON.stringify(formData.components_replaced)),
        total_component_cost: totalComponentCost,
        inspection_charges: formData.inspection_charges,
        repair_cost_charged: formData.repair_cost_charged,
        date_completed: formData.date_completed || null,
        committed_date: formData.committed_date || null,
        payment_status: formData.payment_status,
        advance_amount: formData.advance_amount,
        total_quote_amount: formData.total_quote_amount,
        notes: formData.notes || null,
        created_by: userId,
        created_by_name: userName,
      };

      const { data, error } = await supabase
        .from("repairs")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Repair job created successfully",
      });

      return data;
    } catch (error: any) {
      console.error("Error creating repair:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create repair job",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateRepair = async (id: string, updates: Partial<RepairFormData>) => {
    try {
      let updateData: any = { ...updates };
      
      // Calculate total component cost if components are being updated
      if (updates.components_replaced) {
        updateData.total_component_cost = updates.components_replaced.reduce(
          (sum, comp) => sum + (comp.cost || 0),
          0
        );
        updateData.components_replaced = JSON.parse(JSON.stringify(updates.components_replaced));
      }

      const { error } = await supabase
        .from("repairs")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Repair job updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating repair:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update repair job",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteRepair = async (id: string) => {
    try {
      const { error } = await supabase.from("repairs").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Repair job deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting repair:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete repair job",
        variant: "destructive",
      });
      throw error;
    }
  };

  /**
   * Move a repair to a new stage via the secure RPC. Validates transition,
   * records audit history, and applies stage-specific side effects.
   */
  const updateRepairStage = async (
    id: string,
    newStage: RepairStage,
    opts?: { notes?: string; cancellationReason?: string },
  ) => {
    try {
      // Bypass generated types — RPC was added in v2 and types file may be stale.
      const { error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      }).rpc('update_repair_stage', {
        _repair_id: id,
        _new_stage: newStage,
        _notes: opts?.notes ?? null,
        _cancellation_reason: opts?.cancellationReason ?? null,
      });
      if (error) throw error;

      toast({
        title: "Stage updated",
        description: `Repair moved to ${getRepairStageLabel(newStage)}`,
      });
    } catch (error: any) {
      const msg = String(error?.message || '');
      const friendly = msg.includes('invalid_transition')
        ? 'That stage change isn\'t allowed from the current stage.'
        : msg.includes('permission_denied')
        ? 'Only Admin or Supply Chain can change repair stages.'
        : msg || 'Failed to update repair stage';
      console.error('Error updating repair stage:', error);
      toast({ title: "Error", description: friendly, variant: "destructive" });
      throw error;
    }
  };

  /**
   * Assign or reassign the technician on a repair. Plain UPDATE (no RPC needed —
   * repairs table has existing RLS that allows admin/supply_chain to update).
   */
  const assignTechnician = async (
    id: string,
    technicianId: string | null,
    technicianName: string | null,
  ) => {
    try {
      const { error } = await supabase
        .from('repairs')
        .update({
          assigned_technician_id: technicianId,
          assigned_technician_name: technicianName,
        } as never)
        .eq('id', id);
      if (error) throw error;
      toast({
        title: "Technician updated",
        description: technicianName ? `Assigned to ${technicianName}` : 'Technician cleared',
      });
    } catch (error: any) {
      console.error('Error assigning technician:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to assign technician',
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    repairs,
    loading,
    createRepair,
    updateRepair,
    deleteRepair,
    updateRepairStage,
    assignTechnician,
    refetch: fetchRepairs,
  };
}

/**
 * Fetch the full stage-change history for a single repair, newest first.
 * Lightweight on-demand fetch (no realtime); called by RepairDialog.
 */
export function useRepairStageHistory(repairId: string | null) {
  const [history, setHistory] = useState<RepairStageHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!repairId) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (c: string, v: string) => {
              order: (c: string, o: { ascending: boolean }) => Promise<{
                data: RepairStageHistoryRow[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from('repair_stage_history')
        .select('*')
        .eq('repair_id', repairId)
        .order('changed_at', { ascending: false });
      if (!cancelled) {
        if (error) console.error('Error fetching stage history:', error);
        setHistory(data || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repairId]);

  return { history, loading };
}
