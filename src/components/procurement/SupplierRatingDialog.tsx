import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Star, Clock, Package, DollarSign, MessageSquare, Loader2 } from 'lucide-react';
import { useSupplierRatings } from '@/hooks/useSupplierRatings';
import { useAuth } from '@/hooks/useAuth';
import { Supplier } from '@/hooks/useSuppliers';
import { SupplierScoreBadge } from './SupplierScoreBadge';

interface SupplierRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier;
  orderId?: string;
  procurementId?: string;
}

export const SupplierRatingDialog: React.FC<SupplierRatingDialogProps> = ({
  open,
  onOpenChange,
  supplier,
  orderId,
  procurementId
}) => {
  const { profile } = useAuth();
  const { ratings, score, loading, createRating } = useSupplierRatings(supplier.id);
  
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [qualityRating, setQualityRating] = useState(0);
  const [pricingRating, setPricingRating] = useState(0);
  const [communicationRating, setCommunicationRating] = useState(0);
  const [daysPromised, setDaysPromised] = useState('');
  const [daysActual, setDaysActual] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (deliveryRating === 0 && qualityRating === 0 && pricingRating === 0 && communicationRating === 0) {
      return;
    }

    setSubmitting(true);
    const success = await createRating({
      supplier_id: supplier.id,
      order_id: orderId || null,
      inventory_procurement_id: procurementId || null,
      delivery_rating: deliveryRating > 0 ? deliveryRating : null,
      quality_rating: qualityRating > 0 ? qualityRating : null,
      pricing_rating: pricingRating > 0 ? pricingRating : null,
      communication_rating: communicationRating > 0 ? communicationRating : null,
      delivery_days_promised: daysPromised ? parseInt(daysPromised) : null,
      delivery_days_actual: daysActual ? parseInt(daysActual) : null,
      notes: notes || null,
      rated_by: profile?.user_id || null,
      rated_by_name: profile?.name || null,
    });

    setSubmitting(false);
    if (success) {
      resetForm();
    }
  };

  const resetForm = () => {
    setDeliveryRating(0);
    setQualityRating(0);
    setPricingRating(0);
    setCommunicationRating(0);
    setDaysPromised('');
    setDaysActual('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Rate Supplier - {supplier.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Score */}
          <SupplierScoreBadge score={score} showDetails />

          <Separator />

          {/* Rating Form */}
          <div className="space-y-4">
            <h3 className="font-medium">Add New Rating</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RatingInput
                icon={Clock}
                label="Delivery"
                description="Was the delivery on time?"
                value={deliveryRating}
                onChange={setDeliveryRating}
              />
              <RatingInput
                icon={Package}
                label="Quality"
                description="Was the product quality good?"
                value={qualityRating}
                onChange={setQualityRating}
              />
              <RatingInput
                icon={DollarSign}
                label="Pricing"
                description="Was the pricing competitive?"
                value={pricingRating}
                onChange={setPricingRating}
              />
              <RatingInput
                icon={MessageSquare}
                label="Communication"
                description="Was communication clear?"
                value={communicationRating}
                onChange={setCommunicationRating}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Days Promised</Label>
                <Input
                  type="number"
                  value={daysPromised}
                  onChange={(e) => setDaysPromised(e.target.value)}
                  placeholder="e.g., 7"
                />
              </div>
              <div className="space-y-2">
                <Label>Days Actual</Label>
                <Input
                  type="number"
                  value={daysActual}
                  onChange={(e) => setDaysActual(e.target.value)}
                  placeholder="e.g., 5"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional feedback..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={submitting || (deliveryRating === 0 && qualityRating === 0 && pricingRating === 0 && communicationRating === 0)}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Submit Rating
              </Button>
            </div>
          </div>

          {/* Previous Ratings */}
          {ratings.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-medium">Previous Ratings ({ratings.length})</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {ratings.map((rating) => (
                    <div key={rating.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-muted-foreground">
                          By {rating.rated_by_name || 'Unknown'} on {new Date(rating.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2">
                          {rating.delivery_rating && (
                            <span className="flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3" />{rating.delivery_rating}
                            </span>
                          )}
                          {rating.quality_rating && (
                            <span className="flex items-center gap-1 text-xs">
                              <Package className="h-3 w-3" />{rating.quality_rating}
                            </span>
                          )}
                          {rating.pricing_rating && (
                            <span className="flex items-center gap-1 text-xs">
                              <DollarSign className="h-3 w-3" />{rating.pricing_rating}
                            </span>
                          )}
                          {rating.communication_rating && (
                            <span className="flex items-center gap-1 text-xs">
                              <MessageSquare className="h-3 w-3" />{rating.communication_rating}
                            </span>
                          )}
                        </div>
                      </div>
                      {rating.notes && (
                        <p className="text-muted-foreground">{rating.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface RatingInputProps {
  icon: any;
  label: string;
  description: string;
  value: number;
  onChange: (value: number) => void;
}

const RatingInput: React.FC<RatingInputProps> = ({ icon: Icon, label, description, value, onChange }) => {
  return (
    <div className="p-3 border rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{label}</span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star === value ? 0 : star)}
            className="p-1 hover:scale-110 transition-transform"
          >
            <Star
              className={`h-5 w-5 ${star <= value ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
