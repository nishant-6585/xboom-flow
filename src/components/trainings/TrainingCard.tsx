import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Training, TRAINING_TYPES, TRAINING_CATEGORIES, TRAINING_STATUSES } from "@/hooks/useTrainings";
import { format } from "date-fns";
import { MapPin, Calendar, Users, IndianRupee, Image as ImageIcon } from "lucide-react";

interface TrainingCardProps {
  training: Training;
  onClick?: () => void;
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

const statusConfig: Record<string, { label: string; className: string }> = {
  requested: { label: "Requested", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  done: { label: "Done", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
};

export function TrainingCard({ training, onClick }: TrainingCardProps) {
  const categoryLabel = TRAINING_CATEGORIES.find(c => c.value === training.category)?.label || training.category;
  const paymentConfig = paymentStatusConfig[training.payment_status] || paymentStatusConfig.pending;
  const tConfig = typeConfig[training.type] || typeConfig.training;
  const sConfig = statusConfig[training.status] || statusConfig.requested;
  const balanceAmount = (training.amount_quoted || 0) - (training.amount_paid || 0);

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {training.training_number && (
                  <Badge variant="outline" className="font-mono text-xs">
                    {training.training_number}
                  </Badge>
                )}
                <Badge className={tConfig.className}>{tConfig.label}</Badge>
                <Badge className={sConfig.className}>{sConfig.label}</Badge>
                <Badge className={paymentConfig.className}>{paymentConfig.label}</Badge>
              </div>
              <h3 className="font-semibold text-lg mt-2">{training.client_name}</h3>
              {training.model_name && (
                <p className="text-sm text-muted-foreground">{training.model_name}</p>
              )}
            </div>
            {training.pictures && training.pictures.length > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
                <span className="text-xs">{training.pictures.length}</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{training.city}</span>
            </div>
            {training.training_date && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{format(new Date(training.training_date), "dd MMM yyyy")}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>{training.no_of_people} {training.no_of_people === 1 ? 'person' : 'people'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-xs">{categoryLabel}</span>
            </div>
          </div>

          {/* Trainee Names Preview */}
          {training.trainee_names && training.trainee_names.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {training.trainee_names.slice(0, 3).map((name, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {name}
                </Badge>
              ))}
              {training.trainee_names.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{training.trainee_names.length - 3} more
                </Badge>
              )}
            </div>
          )}

          {/* Amount */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-1">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">₹{training.amount_quoted?.toLocaleString() || 0}</span>
            </div>
            {balanceAmount > 0 && (
              <span className="text-sm text-muted-foreground">
                Balance: ₹{balanceAmount.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
