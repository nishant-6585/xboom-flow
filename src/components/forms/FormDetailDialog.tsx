import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Form, useFormFields, useForms } from "@/hooks/useForms";
import { FormBuilder } from "./FormBuilder";
import { FormPreview } from "./FormPreview";
import { FormSubmissionsTable } from "./FormSubmissionsTable";
import { FormEmbedDialog } from "./FormEmbedDialog";
import { Code, Eye, Settings, Inbox } from "lucide-react";

interface FormDetailDialogProps {
  form: Form | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FormDetailDialog({ form, open, onOpenChange }: FormDetailDialogProps) {
  const { fields } = useFormFields(form?.id || "");
  const { updateForm } = useForms();
  const [embedOpen, setEmbedOpen] = useState(false);

  if (!form) return null;

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
            <TabsList className="grid w-full grid-cols-4">
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
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="builder" className="mt-6">
              <FormBuilder formId={form.id} />
            </TabsContent>

            <TabsContent value="preview" className="mt-6">
              <FormPreview
                formName={form.name}
                formDescription={form.description}
                fields={fields}
              />
            </TabsContent>

            <TabsContent value="submissions" className="mt-6">
              <FormSubmissionsTable formId={form.id} fields={fields} />
            </TabsContent>

            <TabsContent value="settings" className="mt-6 space-y-6">
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
