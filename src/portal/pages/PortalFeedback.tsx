import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Loader2, MessageSquareHeart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePortalOrders } from "@/portal/hooks/usePortalOrders";
import {
  FEEDBACK_CATEGORIES,
  usePortalFeedbackList,
  useSubmitFeedback,
  type FeedbackCategory,
} from "@/portal/hooks/usePortalFeedback";

const NO_ORDER = "none";

// Public "write a review" link for the Xboom Google Business listing.
// public/google-review-qr.png encodes this same URL.
const GOOGLE_REVIEW_URL = "https://g.page/r/CfJDbEcul78fEBM/review";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= (hover || value);
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="p-1"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
          >
            <Star
              className={`h-7 w-7 transition-colors ${
                filled ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalFeedback() {
  const { toast } = useToast();
  const [params] = useSearchParams();
  const { data: orders } = usePortalOrders();
  const { data: past, isLoading: loadingPast } = usePortalFeedbackList();
  const submit = useSubmitFeedback();

  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory>("overall");
  const [orderId, setOrderId] = useState<string>(params.get("order") ?? NO_ORDER);
  const [comment, setComment] = useState("");

  const orderNumberById = new Map((orders ?? []).map((o) => [o.id, o.order_number]));

  async function handleSubmit() {
    if (rating === 0) {
      toast({ title: "Pick a rating", description: "Tap the stars to rate your experience.", variant: "destructive" });
      return;
    }
    try {
      await submit.mutateAsync({
        rating,
        category,
        comment,
        order_id: orderId === NO_ORDER ? null : orderId,
      });
      toast({ title: "Thank you!", description: "Your feedback has been shared with our team." });
      setRating(0);
      setCategory("overall");
      setOrderId(NO_ORDER);
      setComment("");
    } catch (e) {
      toast({
        title: "Couldn't submit feedback",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <PortalLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tell us how we're doing — it helps us serve you better.
        </p>
      </div>

      <Card>
        <CardContent className="py-6 px-5 space-y-4 max-w-xl">
          <div>
            <Label className="mb-1.5 block">How was your experience?</Label>
            <StarPicker value={rating} onChange={setRating} />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">What is this about?</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">Related order (optional)</Label>
              <Select value={orderId} onValueChange={setOrderId}>
                <SelectTrigger>
                  <SelectValue placeholder="No specific order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ORDER}>No specific order</SelectItem>
                  {(orders ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.order_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block">Comments (optional)</Label>
            <Textarea
              rows={4}
              placeholder="What went well? What could we improve?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <Button onClick={handleSubmit} disabled={submit.isPending}>
            {submit.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Submit feedback
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="py-6 px-5 flex items-center gap-5 flex-wrap max-w-xl">
          <img
            src="/google-review-qr.png"
            alt="QR code — scan to review xboom on Google"
            className="h-28 w-28 rounded-md border"
          />
          <div className="flex-1 min-w-[200px]">
            <p className="font-medium">Enjoying working with us?</p>
            <p className="text-sm text-muted-foreground mt-1">
              A quick Google review goes a long way — scan the QR with your phone, or tap the button.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer">
                <Star className="h-3.5 w-3.5 mr-1.5 text-amber-400 fill-amber-400" />
                Review us on Google
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Previously shared</h2>
        {loadingPast && <Skeleton className="h-24 w-full" />}
        {!loadingPast && (past?.length ?? 0) === 0 && (
          <Card>
            <CardContent className="py-10 flex flex-col items-center text-center">
              <MessageSquareHeart className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nothing yet — your feedback will appear here.</p>
            </CardContent>
          </Card>
        )}
        <div className="space-y-3">
          {past?.map((f) => (
            <Card key={f.id}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`h-3.5 w-3.5 ${
                          n <= f.rating ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {FEEDBACK_CATEGORIES.find((c) => c.value === f.category)?.label ?? f.category}
                  </span>
                  {f.order_id && orderNumberById.get(f.order_id) && (
                    <span className="text-xs text-muted-foreground">· Order {orderNumberById.get(f.order_id)}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">{formatDate(f.created_at)}</span>
                </div>
                {f.comment && <p className="text-sm mt-2">{f.comment}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PortalLayout>
  );
}
