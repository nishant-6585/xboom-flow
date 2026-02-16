import { useState, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFormSubmissions, FormSubmission, FormField } from "@/hooks/useForms";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Eye, Trash2, RefreshCw, ExternalLink } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface FormSubmissionsTableProps {
  formId: string;
  fields: FormField[];
}

function AttachmentLink({ storagePath }: { storagePath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (url) {
      window.open(url, '_blank');
      return;
    }
    setLoading(true);
    try {
      // Parse "storage:bucket:path" format
      const parts = storagePath.split(':');
      const bucket = parts[1];
      const path = parts.slice(2).join(':');
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (error) throw error;
      setUrl(data.signedUrl);
      window.open(data.signedUrl, '_blank');
    } catch {
      // Fallback for legacy public URLs
      if (storagePath.startsWith('http')) {
        window.open(storagePath, '_blank');
      }
    } finally {
      setLoading(false);
    }
  }, [storagePath, url]);

  return (
    <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={handleClick} disabled={loading}>
      <ExternalLink className="h-3 w-3 mr-1" />
      {loading ? 'Loading...' : 'View Attachment'}
    </Button>
  );
}


export function FormSubmissionsTable({ formId, fields }: FormSubmissionsTableProps) {
  const { submissions, isLoading, refetch, deleteSubmission } = useFormSubmissions(formId);
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  const handleRefresh = async () => {
    setIsRefetching(true);
    await refetch();
    setIsRefetching(false);
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading submissions...</div>;
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg border-dashed">
        <p className="text-muted-foreground">No submissions yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Submissions will appear here once users fill out your form
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={handleRefresh} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    );
  }

  const displayFields = fields.slice(0, 3);

  return (
    <>
      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-muted-foreground">{submissions.length} submission{submissions.length !== 1 ? 's' : ''}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Submitted At</TableHead>
              {displayFields.map((field) => (
                <TableHead key={field.id}>{field.label}</TableHead>
              ))}
              {fields.length > 3 && <TableHead>...</TableHead>}
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {submissions.map((submission) => (
              <TableRow key={submission.id}>
                <TableCell className="text-sm">
                  {format(new Date(submission.submitted_at), "MMM d, yyyy HH:mm")}
                </TableCell>
                {displayFields.map((field) => {
                  const value = submission.submission_data[field.id];
                  const isStoragePath = typeof value === 'string' && value.startsWith('storage:');
                  return (
                    <TableCell key={field.id} className="max-w-[200px] truncate">
                      {isStoragePath ? (
                        <Badge variant="secondary" className="text-xs">📎 Attachment</Badge>
                      ) : Array.isArray(value) ? (
                        <div className="flex gap-1 flex-wrap">
                          {value.map((v, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm">{String(value || "-")}</span>
                      )}
                    </TableCell>
                  );
                })}
                {fields.length > 3 && (
                  <TableCell>
                    <Badge variant="outline">+{fields.length - 3} more</Badge>
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedSubmission(submission)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Submission?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteSubmission(submission.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Submission Details</DialogTitle>
          </DialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Submitted: {format(new Date(selectedSubmission.submitted_at), "PPpp")}
              </div>
              <div className="space-y-3">
                {fields.map((field) => {
                  const value = selectedSubmission.submission_data[field.id];
                  const isStoragePath = typeof value === 'string' && value.startsWith('storage:');
                  return (
                    <div key={field.id} className="space-y-1">
                      <label className="text-sm font-medium">{field.label}</label>
                      <div className="text-sm bg-muted p-2 rounded">
                        {isStoragePath ? (
                          <AttachmentLink storagePath={value as string} />
                        ) : Array.isArray(value) ? value.join(", ") : String(value || "-")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
