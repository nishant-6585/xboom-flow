import { useState, useEffect } from "react";
import { useTasks, TaskType, TASK_TYPES, TaskFormData } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ListTodo, Save } from "lucide-react";
import { toast } from "sonner";

interface TeamMember {
  user_id: string;
  name: string;
  role: 'sales' | 'supply_chain' | 'admin' | 'finance' | 'it' | 'marketing';
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiryId?: string;
  orderId?: string;
  pipelineId?: string;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  enquiryId,
  orderId,
  pipelineId,
}: TaskFormDialogProps) {
  const { profile, user } = useAuth();
  const { createTask } = useTasks();
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [formData, setFormData] = useState<TaskFormData>({
    task_type: "custom",
    title: "",
    description: "",
    assigned_to: "",
    assigned_to_name: "",
    assigned_role: "sales",
    priority: 3,
    due_date: "",
  });

  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        // Fetch profiles and user_roles separately then merge
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, name")
          .eq("is_approved", true);

        if (profilesError) throw profilesError;

        const { data: roles, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id, role");

        if (rolesError) throw rolesError;

        // Create a map of user_id to role
        const roleMap = new Map<string, string>();
        (roles || []).forEach((r: any) => {
          roleMap.set(r.user_id, r.role);
        });

        const members: TeamMember[] = (profiles || [])
          .filter((p: any) => roleMap.has(p.user_id))
          .map((p: any) => ({
            user_id: p.user_id,
            name: p.name,
            role: (roleMap.get(p.user_id) || "sales") as TeamMember["role"],
          }));

        setTeamMembers(members);
      } catch (error) {
        console.error("Error fetching team members:", error);
      }
    };

    if (open) {
      fetchTeamMembers();
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!formData.title || !formData.assigned_to) {
      toast.error("Please fill in required fields");
      return;
    }

    setLoading(true);
    try {
      const success = await createTask({
        ...formData,
        enquiry_id: enquiryId,
        order_id: orderId,
        pipeline_id: pipelineId,
      });

      if (success) {
        onOpenChange(false);
        resetForm();
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      task_type: "custom",
      title: "",
      description: "",
      assigned_to: "",
      assigned_to_name: "",
      assigned_role: "sales",
      priority: 3,
      due_date: "",
    });
  };

  const handleAssigneeChange = (userId: string) => {
    const member = teamMembers.find((m) => m.user_id === userId);
    if (member) {
      setFormData({
        ...formData,
        assigned_to: member.user_id,
        assigned_to_name: member.name,
        assigned_role: member.role,
      });
    }
  };

  const filteredMembers = formData.assigned_role
    ? teamMembers.filter((m) => m.role === formData.assigned_role)
    : teamMembers;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListTodo className="w-5 h-5" />
            Create Task
          </DialogTitle>
          <DialogDescription>
            Assign a task to a team member
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Task Type *</Label>
            <Select
              value={formData.task_type}
              onValueChange={(value) =>
                setFormData({ ...formData, task_type: value as TaskType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="Task title..."
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Task description..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assign to Role *</Label>
              <Select
                value={formData.assigned_role}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    assigned_role: value as TaskFormData["assigned_role"],
                    assigned_to: "",
                    assigned_to_name: "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="supply_chain">Supply Chain</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="it">IT</SelectItem>
                  <SelectItem value="marketing">Marketing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Assign to User *</Label>
              <Select
                value={formData.assigned_to}
                onValueChange={handleAssigneeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {filteredMembers.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={formData.priority?.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: parseInt(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">High</SelectItem>
                  <SelectItem value="2">Medium</SelectItem>
                  <SelectItem value="3">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input
                type="datetime-local"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Creating..." : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
