import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Upload, Image as ImageIcon } from "lucide-react";
import { 
  TrainingFormData, 
  TRAINING_TYPES, 
  TRAINING_CATEGORIES,
  TRAINING_PAYMENT_STATUSES,
  TRAINING_STATUSES,
  TrainingType,
  TrainingCategory,
  TrainingPaymentStatus,
  TrainingStatus
} from "@/hooks/useTrainings";
import { format } from "date-fns";

interface TrainingFormProps {
  onSubmit: (data: TrainingFormData, files?: File[]) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<TrainingFormData>;
  isEditing?: boolean;
}

export function TrainingForm({ onSubmit, onCancel, initialData, isEditing }: TrainingFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<TrainingFormData>({
    client_name: initialData?.client_name || "",
    city: initialData?.city || "",
    model_name: initialData?.model_name || "",
    type: initialData?.type || "training",
    category: initialData?.category || "drone_ops",
    no_of_people: initialData?.no_of_people || 1,
    trainee_names: initialData?.trainee_names || [],
    amount_quoted: initialData?.amount_quoted || 0,
    amount_paid: initialData?.amount_paid || 0,
    payment_status: initialData?.payment_status || "pending",
    status: initialData?.status || "requested",
    training_date: initialData?.training_date || format(new Date(), "yyyy-MM-dd"),
    notes: initialData?.notes || "",
  });

  const [newTraineeName, setNewTraineeName] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddTrainee = () => {
    if (newTraineeName.trim()) {
      setFormData({
        ...formData,
        trainee_names: [...formData.trainee_names, newTraineeName.trim()],
      });
      setNewTraineeName("");
    }
  };

  const handleRemoveTrainee = (index: number) => {
    setFormData({
      ...formData,
      trainee_names: formData.trainee_names.filter((_, i) => i !== index),
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => [...prev, ...files]);
    
    // Create preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPreviewUrls(prev => [...prev, ...newPreviews]);
  };

  const handleRemoveFile = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.client_name.trim() || !formData.city.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit(formData, selectedFiles.length > 0 ? selectedFiles : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const balanceAmount = (formData.amount_quoted || 0) - (formData.amount_paid || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Client Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="client_name">Client Name *</Label>
            <Input
              id="client_name"
              value={formData.client_name}
              onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
              placeholder="Enter client name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="Enter city"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model_name">Model Name</Label>
            <Input
              id="model_name"
              value={formData.model_name}
              onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
              placeholder="Enter drone model"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="training_date">Date</Label>
            <Input
              id="training_date"
              type="date"
              value={formData.training_date || ""}
              onChange={(e) => setFormData({ ...formData, training_date: e.target.value || null })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Training Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Training Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value as TrainingType })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {TRAINING_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value as TrainingCategory })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {TRAINING_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value as TrainingStatus })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {TRAINING_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="no_of_people">No. of People</Label>
            <Input
              id="no_of_people"
              type="number"
              min="1"
              value={formData.no_of_people || ""}
              onChange={(e) => setFormData({ ...formData, no_of_people: parseInt(e.target.value) || 1 })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Trainee Names */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trainee Names</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.trainee_names.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.trainee_names.map((name, index) => (
                <Badge key={index} variant="secondary" className="gap-1 pr-1">
                  {name}
                  <button
                    type="button"
                    onClick={() => handleRemoveTrainee(index)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          
          <div className="flex gap-2">
            <Input
              placeholder="Enter trainee name"
              value={newTraineeName}
              onChange={(e) => setNewTraineeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTrainee();
                }
              }}
              className="flex-1"
            />
            <Button type="button" variant="outline" onClick={handleAddTrainee}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="amount_quoted">Amount Quoted (₹)</Label>
            <Input
              id="amount_quoted"
              type="number"
              value={formData.amount_quoted || ""}
              onChange={(e) => setFormData({ ...formData, amount_quoted: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount_paid">Amount Paid (₹)</Label>
            <Input
              id="amount_paid"
              type="number"
              value={formData.amount_paid || ""}
              onChange={(e) => setFormData({ ...formData, amount_paid: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>Balance (₹)</Label>
            <div className="h-10 px-3 py-2 border rounded-md bg-muted font-medium">
              ₹{balanceAmount.toLocaleString()}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment_status">Payment Status</Label>
            <Select
              value={formData.payment_status}
              onValueChange={(value) => setFormData({ ...formData, payment_status: value as TrainingPaymentStatus })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {TRAINING_PAYMENT_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Pictures */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pictures</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewUrls.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {previewUrls.map((url, index) => (
                <div key={index} className="relative group aspect-square">
                  <img
                    src={url}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(index)}
                    className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Add Pictures
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Additional Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Any additional notes..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : isEditing ? "Update" : "Create Training/Demo"}
        </Button>
      </div>
    </form>
  );
}
