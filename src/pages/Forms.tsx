import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForms, Form } from "@/hooks/useForms";
import { useLeadsFormAnalytics, countLeadsForForm } from "@/hooks/useLeadsFormAnalytics";
import { useAuth } from "@/hooks/useAuth";
import { useFormPermissions } from "@/hooks/useFormPermissions";
import { FormCreateDialog } from "@/components/forms/FormCreateDialog";
import { FormDetailDialog } from "@/components/forms/FormDetailDialog";
import { FormEmbedDialog } from "@/components/forms/FormEmbedDialog";
import { FormQRCodeDialog } from "@/components/forms/FormQRCodeDialog";
import { FormsOverallAnalytics } from "@/components/forms/FormsOverallAnalytics";
import { FormsDashboard } from "@/components/forms/FormsDashboard";
import { Plus, FileText, Inbox, Trash2, Code, Link2, QrCode, LayoutGrid, BarChart3, LayoutDashboard } from "lucide-react";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function Forms() {
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const { data: permissions, isLoading: permsLoading } = useFormPermissions();
  const { forms, isLoading, deleteForm } = useForms();
  const { data: liveLeads = [] } = useLeadsFormAnalytics(90);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<Form | null>(null);
  const [embedForm, setEmbedForm] = useState<Form | null>(null);
  const [qrForm, setQrForm] = useState<Form | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  const access = useMemo(() => {
    const isAdmin = role === "admin";
    const isIt = role === "it";
    const isPrivileged = isAdmin || isIt;
    const canView = isPrivileged || !!permissions?.can_view_forms;
    const canCreate = isPrivileged || !!permissions?.can_create_forms;
    const canEdit = isPrivileged || !!permissions?.can_edit_forms;
    const canViewSubmissions = isPrivileged || !!permissions?.can_view_submissions;

    return { isAdmin, canView, canCreate, canEdit, canViewSubmissions };
  }, [permissions, role]);

  if (authLoading || permsLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Forms</h1>
            <p className="text-muted-foreground">Create and manage embeddable forms</p>
          </div>
          {access.canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Form
            </Button>
          )}
        </div>

        {!access.canView ? (
          <Card className="py-10">
            <CardHeader>
              <CardTitle>Access required</CardTitle>
              <CardDescription>
                You don't have permission to view Forms. Ask an admin to enable "View Forms" for your user.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Go Back
              </Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading forms...</div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full max-w-lg grid-cols-3">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="forms" className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                All Forms
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analytics
              </TabsTrigger>
            </TabsList>

            <TabsContent value="forms" className="mt-6">
              {forms.length === 0 ? (
                <Card className="py-12">
                  <CardContent className="text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No forms yet</h3>
                    <p className="text-muted-foreground mb-4">Create your first form to start collecting submissions</p>
                    {access.canCreate && (
                      <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Form
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {forms.map((form) => (
                    <Card key={form.id} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1" onClick={() => setSelectedForm(form)}>
                            <CardTitle className="text-lg">{form.name}</CardTitle>
                            {form.description && (
                              <CardDescription className="mt-1">{form.description}</CardDescription>
                            )}
                          </div>
                          <Badge variant={form.is_active ? "default" : "secondary"}>
                            {form.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent onClick={() => setSelectedForm(form)}>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <FileText className="h-4 w-4" />
                            {form.form_fields?.length || 0} fields
                          </div>
                          <div className="flex items-center gap-1">
                            <Inbox className="h-4 w-4" />
                            {countLeadsForForm(form.name, liveLeads)} live (90d)
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-3">
                          Created {format(new Date(form.created_at), "MMM d, yyyy")}
                        </div>
                      </CardContent>
                      <div className="px-6 pb-4 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            const formUrl = `${window.location.origin}/form-embed/${form.id}`;
                            navigator.clipboard.writeText(formUrl);
                            toast.success("Form URL copied to clipboard!");
                          }}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQrForm(form);
                          }}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEmbedForm(form);
                          }}
                        >
                          <Code className="h-4 w-4 mr-1" />
                          Embed
                        </Button>
                        {access.canEdit && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Form?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the form and all its submissions.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteForm(form.id)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="dashboard" className="mt-6">
              <FormsDashboard forms={forms} />
            </TabsContent>

            <TabsContent value="analytics" className="mt-6">
              <FormsOverallAnalytics forms={forms} />
            </TabsContent>
          </Tabs>
        )}
      </main>

      <FormCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <FormDetailDialog
        form={selectedForm}
        open={!!selectedForm}
        onOpenChange={() => setSelectedForm(null)}
      />
      {embedForm && (
        <FormEmbedDialog
          open={!!embedForm}
          onOpenChange={() => setEmbedForm(null)}
          formId={embedForm.id}
          formName={embedForm.name}
        />
      )}
      {qrForm && (
        <FormQRCodeDialog
          open={!!qrForm}
          onOpenChange={() => setQrForm(null)}
          formId={qrForm.id}
          formName={qrForm.name}
        />
      )}
    </div>
  );
}
