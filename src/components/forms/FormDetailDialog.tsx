import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, useFormFields, useForms } from "@/hooks/useForms";
import { FormBuilder } from "./FormBuilder";
import { FormPreview } from "./FormPreview";
import { FormSubmissionsTable } from "./FormSubmissionsTable";
import { FormEmbedDialog } from "./FormEmbedDialog";
import { FormAnalyticsChart } from "./FormAnalyticsChart";
import { useAuth } from "@/hooks/useAuth";
import { useFormPermissions } from "@/hooks/useFormPermissions";
import { Code, Eye, Settings, Inbox, Save, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface FormDetailDialogProps {
  form: Form | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FormDetailDialog({ form, open, onOpenChange }: FormDetailDialogProps) {
  const { role } = useAuth();
  const { data: permissions } = useFormPermissions();
  const { fields } = useFormFields(form?.id || "");
  const { updateForm, isUpdating } = useForms();
  const [embedOpen, setEmbedOpen] = useState(false);
  const [editName, setEditName] = useState(form?.name || "");
  const [editDescription, setEditDescription] = useState(form?.description || "");

  // Calculate permissions
  const canEdit = useMemo(() => {
    return role === "admin" || !!permissions?.can_edit_forms;
  }, [role, permissions]);

  const canViewSubmissions = useMemo(() => {
    return role === "admin" || !!permissions?.can_view_submissions;
  }, [role, permissions]);

  // Sync state when form changes
  useEffect(() => {
    if (form) {
      setEditName(form.name);
      setEditDescription(form.description || "");
    }
  }, [form?.id, form?.name, form?.description]);

  if (!form) return null;

  const handleSaveDetails = () => {
    if (!editName.trim()) {
      toast.error("Form name is required");
      return;
    }
    updateForm({
      id: form.id,
      name: editName.trim(),
      description: editDescription.trim() || null,
    }, {
      onSuccess: () => toast.success("Form details updated"),
    });
  };

  const hasChanges = editName !== form.name || editDescription !== (form.description || "");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl">{form.name}</DialogTitle>
                {form.description && (
                  <p className="text-sm text-muted-foreground mt-1">{form.description}</p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={form.is_active ? "default" : "secondary"}>
                  {form.is_active ? "Active" : "Inactive"}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setEmbedOpen(true)}>
                  <Code className="h-4 w-4 mr-2" />
                  Embed
                </Button>
              </div>
            </div>
          </DialogHeader>

          <Tabs defaultValue="builder" className="mt-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="builder" className="gap-2">
                <Settings className="h-4 w-4" />
                Builder
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2">
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="submissions" className="gap-2">
                <Inbox className="h-4 w-4" />
                Submissions
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="builder" className="mt-6">
              <FormBuilder formId={form.id} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value="preview" className="mt-6">
              <FormPreview
                formName={form.name}
                formDescription={form.description}
                fields={fields}
              />
            </TabsContent>

            <TabsContent value="submissions" className="mt-6">
              {canViewSubmissions ? (
                <FormSubmissionsTable formId={form.id} fields={fields} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  You don't have permission to view submissions
                </div>
              )}
            </TabsContent>

            <TabsContent value="analytics" className="mt-6">
              <FormAnalyticsChart formId={form.id} />
            </TabsContent>

            {canEdit && (
              <TabsContent value="settings" className="mt-6 space-y-6">
              {/* Form Details */}
              <div className="p-4 border rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Form Details</Label>
                  {hasChanges && (
                    <Button size="sm" onClick={handleSaveDetails} disabled={isUpdating}>
                      <Save className="h-4 w-4 mr-2" />
                      {isUpdating ? "Saving..." : "Save Changes"}
                    </Button>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Form Name *</Label>
                    <Input
                      id="edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Form name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Brief description of this form"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* Form Status */}
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-base">Form Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable or disable this form from accepting submissions
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => updateForm({ id: form.id, is_active: checked })}
                />
              </div>
            </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      <FormEmbedDialog
        open={embedOpen}
        onOpenChange={setEmbedOpen}
        formId={form.id}
        formName={form.name}
      />
    </>
  );
}
