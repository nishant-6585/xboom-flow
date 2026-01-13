import { useState } from "react";
import { Star, Quote, CheckCircle, Clock, Trash2, Plus, Award } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCustomerTestimonials } from "@/hooks/useCustomerTestimonials";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function TestimonialsPanel() {
  const { testimonials, isLoading, createTestimonial, approveTestimonial, deleteTestimonial } = useCustomerTestimonials();
  const { role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_company: '',
    testimonial: '',
    rating: 5,
  });

  const handleSubmit = () => {
    if (!formData.customer_name.trim() || !formData.testimonial.trim()) return;
    createTestimonial.mutate(formData, {
      onSuccess: () => {
        setFormData({ customer_name: '', customer_company: '', testimonial: '', rating: 5 });
        setIsOpen(false);
      }
    });
  };

  const renderStars = (rating: number | null, interactive = false, onChange?: (r: number) => void) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "w-5 h-5 transition-colors",
              star <= (rating || 0) ? "text-yellow-500 fill-yellow-500" : "text-gray-300",
              interactive && "cursor-pointer hover:text-yellow-400"
            )}
            onClick={() => interactive && onChange?.(star)}
          />
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardContent className="p-6">
          <div className="h-48 bg-muted rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const pendingTestimonials = testimonials?.filter(t => !t.is_approved) || [];
  const approvedTestimonials = testimonials?.filter(t => t.is_approved) || [];

  return (
    <div className="space-y-6">
      {/* Add Testimonial Button */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Quote className="w-5 h-5 text-amber-500" />
              Customer Testimonials
              <Badge variant="outline" className="ml-2">
                <Award className="w-3 h-3 mr-1" />
                Earn 10-50 pts
              </Badge>
            </CardTitle>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Testimonial
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Quote className="w-5 h-5 text-amber-500" />
                    Submit Customer Testimonial
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Customer Name *</label>
                    <Input
                      value={formData.customer_name}
                      onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                      placeholder="Customer name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Company</label>
                    <Input
                      value={formData.customer_company}
                      onChange={(e) => setFormData({ ...formData, customer_company: e.target.value })}
                      placeholder="Company name (optional)"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Rating</label>
                    {renderStars(formData.rating, true, (r) => setFormData({ ...formData, rating: r }))}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Testimonial *</label>
                    <Textarea
                      value={formData.testimonial}
                      onChange={(e) => setFormData({ ...formData, testimonial: e.target.value })}
                      placeholder="What did the customer say about our service?"
                      rows={4}
                    />
                  </div>
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
                    <Award className="w-4 h-4 inline mr-2 text-primary" />
                    You'll earn <strong>{formData.rating * 10} points</strong> for this testimonial, 
                    plus <strong>15 bonus points</strong> when approved!
                  </div>
                  <Button 
                    onClick={handleSubmit} 
                    className="w-full"
                    disabled={createTestimonial.isPending || !formData.customer_name.trim() || !formData.testimonial.trim()}
                  >
                    {createTestimonial.isPending ? 'Submitting...' : 'Submit Testimonial'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Pending Approvals (Admin Only) */}
      {role === 'admin' && pendingTestimonials.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-500">
              <Clock className="w-5 h-5" />
              Pending Approval ({pendingTestimonials.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingTestimonials.map((t) => (
              <div key={t.id} className="p-4 rounded-lg border bg-yellow-500/5 border-yellow-500/20">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {renderStars(t.rating)}
                    </div>
                    <p className="text-sm italic">"{t.testimonial}"</p>
                    <p className="text-sm font-medium mt-2">
                      — {t.customer_name}
                      {t.customer_company && <span className="text-muted-foreground">, {t.customer_company}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Submitted by {t.submitted_by_name} on {format(new Date(t.created_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="bg-green-500 hover:bg-green-600"
                      onClick={() => approveTestimonial.mutate(t.id)}
                      disabled={approveTestimonial.isPending}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteTestimonial.mutate(t.id)}
                      disabled={deleteTestimonial.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Approved Testimonials */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {approvedTestimonials.map((t) => (
          <Card key={t.id} className="overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                {renderStars(t.rating)}
                <Badge className="bg-green-500/20 text-green-500 border-green-500/30 ml-auto">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Verified
                </Badge>
              </div>
              <Quote className="w-8 h-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm italic leading-relaxed">"{t.testimonial}"</p>
              <div className="mt-4 pt-4 border-t">
                <p className="font-semibold">{t.customer_name}</p>
                {t.customer_company && (
                  <p className="text-sm text-muted-foreground">{t.customer_company}</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {approvedTestimonials.length === 0 && pendingTestimonials.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Quote className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No testimonials yet. Collect customer feedback to earn points!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
