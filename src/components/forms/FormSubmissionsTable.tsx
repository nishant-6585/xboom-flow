import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFormSubmissions, FormSubmission, FormField } from "@/hooks/useForms";
import { format } from "date-fns";
import { Eye, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface FormSubmissionsTableProps {
  formId: string;
  fields: FormField[];
}

export function FormSubmissionsTable({ formId, fields }: FormSubmissionsTableProps) {
  const { submissions, isLoading, deleteSubmission } = useFormSubmissions(formId);
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);

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
      </div>
    );
  }

  const displayFields = fields.slice(0, 3);

  return (
    <>
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
                  return (
                    <TableCell key={field.id} className="max-w-[200px] truncate">
                      {Array.isArray(value) ? (
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
                  return (
                    <div key={field.id} className="space-y-1">
                      <label className="text-sm font-medium">{field.label}</label>
                      <div className="text-sm bg-muted p-2 rounded">
                        {Array.isArray(value) ? value.join(", ") : String(value || "-")}
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
