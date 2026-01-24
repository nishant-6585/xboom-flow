import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Training, TrainingFormData, TRAINING_TYPES, TRAINING_CATEGORIES, TRAINING_PAYMENT_STATUSES } from "@/hooks/useTrainings";
import { TrainingForm } from "./TrainingForm";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Edit2, Trash2, MapPin, Calendar, Users, IndianRupee, Upload, X, Award, Download, FileDown } from "lucide-react";
import { generateCertificate, generateAllCertificates } from "@/lib/certificateGenerator";
import { toast } from "sonner";

interface TrainingDialogProps {
  training: Training | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<TrainingFormData>, files?: File[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRemovePicture: (trainingId: string, pictureUrl: string) => Promise<void>;
}

const paymentStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  partial: { label: "Partial", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

const typeConfig: Record<string, { label: string; className: string }> = {
  demo: { label: "Demo", className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  training: { label: "Training", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
};

export function TrainingDialog({ training, open, onOpenChange, onUpdate, onDelete, onRemovePicture }: TrainingDialogProps) {
  const { role } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isUploadingPictures, setIsUploadingPictures] = useState(false);

  if (!training) return null;

  const categoryLabel = TRAINING_CATEGORIES.find(c => c.value === training.category)?.label || training.category;
  const paymentConfig = paymentStatusConfig[training.payment_status] || paymentStatusConfig.pending;
  const tConfig = typeConfig[training.type] || typeConfig.training;
  const balanceAmount = (training.amount_quoted || 0) - (training.amount_paid || 0);

  const handleUpdate = async (data: TrainingFormData, files?: File[]) => {
    await onUpdate(training.id, data, files);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await onDelete(training.id);
    setShowDeleteDialog(false);
    onOpenChange(false);
  };

  const handleAddPictures = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setIsUploadingPictures(true);
    try {
      await onUpdate(training.id, {}, files);
    } finally {
      setIsUploadingPictures(false);
    }
  };

  const handleGenerateCertificate = (traineeName: string) => {
    generateCertificate({
      traineeName,
      clientName: training.client_name,
      trainingType: training.type,
      category: training.category,
      modelName: training.model_name,
      trainingDate: training.training_date,
      trainingNumber: training.training_number,
      city: training.city,
    });
    toast.success(`Certificate generated for ${traineeName}`);
  };

  const handleGenerateAllCertificates = () => {
    if (!training.trainee_names || training.trainee_names.length === 0) {
      toast.error("No trainees to generate certificates for");
      return;
    }
    generateAllCertificates(training.trainee_names, {
      clientName: training.client_name,
      trainingType: training.type,
      category: training.category,
      modelName: training.model_name,
      trainingDate: training.training_date,
      trainingNumber: training.training_number,
      city: training.city,
    });
    toast.success(`Generating ${training.trainee_names.length} certificates...`);
  };

  if (isEditing) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit - {training.training_number}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
            <TrainingForm
              initialData={{
                client_name: training.client_name,
                city: training.city,
                model_name: training.model_name || "",
                type: training.type,
                category: training.category,
                no_of_people: training.no_of_people,
                trainee_names: training.trainee_names || [],
                amount_quoted: training.amount_quoted,
                amount_paid: training.amount_paid,
                payment_status: training.payment_status,
                training_date: training.training_date,
                notes: training.notes || "",
              }}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              isEditing
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle>{training.training_number || "Details"}</DialogTitle>
                <Badge className={tConfig.className}>{tConfig.label}</Badge>
                <Badge className={paymentConfig.className}>{paymentConfig.label}</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                {role === "admin" && (
                  <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-120px)]">
            <div className="space-y-6 pr-4">
              {/* Client Info */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Client Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Client Name</div>
                    <div className="font-medium">{training.client_name}</div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                    <div>
                      <div className="text-sm text-muted-foreground">City</div>
                      <div className="font-medium">{training.city}</div>
                    </div>
                  </div>
                  {training.model_name && (
                    <div>
                      <div className="text-sm text-muted-foreground">Model</div>
                      <div className="font-medium">{training.model_name}</div>
                    </div>
                  )}
                  {training.training_date && (
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <div className="text-sm text-muted-foreground">Date</div>
                        <div className="font-medium">{format(new Date(training.training_date), "dd MMM yyyy")}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Training Details */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Training Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Type</div>
                    <Badge className={tConfig.className}>{tConfig.label}</Badge>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Category</div>
                    <div className="font-medium">{categoryLabel}</div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Users className="h-4 w-4 text-muted-foreground mt-1" />
                    <div>
                      <div className="text-sm text-muted-foreground">People Trained</div>
                      <div className="font-medium">{training.no_of_people}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trainee Names & Certificates */}
              {training.trainee_names && training.trainee_names.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Award className="h-5 w-5 text-primary" />
                        Trainee Names & Certificates
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateAllCertificates}
                        className="gap-1"
                      >
                        <FileDown className="h-4 w-4" />
                        Download All ({training.trainee_names.length})
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {training.trainee_names.map((name, index) => (
                        <div 
                          key={index} 
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="font-medium">
                              {index + 1}
                            </Badge>
                            <span className="font-medium">{name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGenerateCertificate(name)}
                            className="gap-1 text-primary hover:text-primary"
                          >
                            <Download className="h-4 w-4" />
                            Certificate
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Payment Details */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Payment Details</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Quoted</div>
                    <div className="font-semibold">₹{training.amount_quoted?.toLocaleString() || 0}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Paid</div>
                    <div className="font-semibold">₹{training.amount_paid?.toLocaleString() || 0}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Balance</div>
                    <div className="font-semibold">₹{balanceAmount.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Status</div>
                    <Badge className={paymentConfig.className}>{paymentConfig.label}</Badge>
                  </div>
                </div>
              </div>

              {/* Pictures */}
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-lg">Pictures</h3>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleAddPictures}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPictures}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {isUploadingPictures ? "Uploading..." : "Add Pictures"}
                    </Button>
                  </div>
                </div>
                {training.pictures && training.pictures.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {training.pictures.map((url, index) => (
                      <div key={index} className="relative group aspect-square">
                        <img
                          src={url}
                          alt={`Training ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                        <button
                          onClick={() => onRemovePicture(training.id, url)}
                          className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No pictures uploaded</p>
                )}
              </div>

              {/* Notes */}
              {training.notes && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-lg mb-3">Notes</h3>
                    <p className="text-muted-foreground">{training.notes}</p>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training/Demo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the record for {training.client_name}. This action cannot be undone.
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
    </>
  );
}
