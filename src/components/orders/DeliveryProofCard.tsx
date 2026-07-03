import { useRef, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, CheckCircle2, XCircle, Camera, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { validateFile } from "@/lib/fileValidation";

interface Props {
  orderId: string;
  orderNumber: string | null;
  deliveryMode: string | null;
  onDeliveryModeChange: (mode: "courier" | "office_pickup") => void;
  proofUrl: string | null;
  proofStatus: string | null;
  proofUploadedAt: string | null;
  proofReviewedAt: string | null;
  proofRejectReason: string | null;
  onChanged: () => void;
}

/**
 * Staff-facing card for the office/showroom delivery-proof workflow.
 * - Toggle delivery mode (courier / office pickup)
 * - Upload proof image (staff only)
 * - Approve / reject (admin & sales_manager)
 * Portal customers never see this card.
 */
export function DeliveryProofCard({
  orderId,
  orderNumber,
  deliveryMode,
  onDeliveryModeChange,
  proofUrl,
  proofStatus,
  proofUploadedAt,
  proofReviewedAt,
  proofRejectReason,
  onChanged,
}: Props) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const isSalesMgr = role === "sales_manager";
  const canReview = isAdmin || isSalesMgr;

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isPickup = deliveryMode === "office_pickup";

  async function loadPreview() {
    if (!proofUrl) return;
    const path = proofUrl.replace(/^delivery-proofs\//, "");
    const { data, error } = await supabase.storage
      .from("delivery-proofs")
      .createSignedUrl(path, 600);
    if (error) {
      toast.error("Could not open proof image");
      return;
    }
    setPreviewUrl(data.signedUrl);
  }

  async function handleUpload(file: File) {
    const v = validateFile(file, "screenshots");
    if (!v.valid) {
      toast.error(v.error || "Invalid file");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${orderId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("delivery-proofs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const storedRef = `delivery-proofs/${path}`;
      const { error: rpcErr } = await (supabase as any).rpc("submit_delivery_proof", {
        p_order_id: orderId,
        p_url: storedRef,
      });
      if (rpcErr) throw rpcErr;

      toast.success("Delivery proof uploaded — waiting for review");
      onDeliveryModeChange("office_pickup");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function approve() {
    setReviewing(true);
    const { error } = await (supabase as any).rpc("approve_delivery_proof", { p_order_id: orderId });
    setReviewing(false);
    if (error) return toast.error(error.message);
    toast.success("Proof approved");
    onChanged();
  }

  async function reject() {
    if (!rejectReason.trim()) return toast.error("Reason required");
    setReviewing(true);
    const { error } = await (supabase as any).rpc("reject_delivery_proof", {
      p_order_id: orderId,
      p_reason: rejectReason.trim(),
    });
    setReviewing(false);
    if (error) return toast.error(error.message);
    toast.success("Proof rejected");
    setRejectOpen(false);
    setRejectReason("");
    onChanged();
  }

  const statusBadge = (() => {
    if (!proofUrl) return null;
    if (proofStatus === "approved")
      return (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
        </Badge>
      );
    if (proofStatus === "rejected")
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300">
          <XCircle className="h-3 w-3 mr-1" /> Rejected
        </Badge>
      );
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-300">
        Pending review
      </Badge>
    );
  })();

  return (
    <div className="p-4 rounded-lg border bg-muted/40 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4" />
          <span className="font-medium text-sm">Delivery mode</span>
        </div>
        {statusBadge}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-3 items-start">
        <Select
          value={deliveryMode ?? "courier"}
          onValueChange={(v) => onDeliveryModeChange(v as "courier" | "office_pickup")}
        >
          <SelectTrigger className="bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="courier">Courier</SelectItem>
            <SelectItem value="office_pickup">Office / Showroom pickup</SelectItem>
          </SelectContent>
        </Select>

        <p className="text-xs text-muted-foreground">
          When the customer collects from the office/showroom, upload a photo of
          them receiving the product. Marking the order <b>Delivered</b> is
          blocked until proof is uploaded, and it stays pending review until
          admin or sales manager approves it.
        </p>
      </div>

      {isPickup && (
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              {proofUrl ? "Re-upload proof" : "Upload proof photo"}
            </Button>
            {proofUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (previewUrl) window.open(previewUrl, "_blank");
                  else loadPreview().then(() => {
                    setTimeout(() => previewUrl && window.open(previewUrl, "_blank"), 100);
                  });
                }}
              >
                <ImageIcon className="h-3.5 w-3.5 mr-1" />
                View proof
              </Button>
            )}
          </div>

          {proofUrl && (
            <div className="text-xs text-muted-foreground">
              Uploaded{" "}
              {proofUploadedAt
                ? format(new Date(proofUploadedAt), "dd MMM yyyy, HH:mm")
                : "—"}
              {proofReviewedAt && (
                <> · Reviewed {format(new Date(proofReviewedAt), "dd MMM yyyy, HH:mm")}</>
              )}
            </div>
          )}

          {proofStatus === "rejected" && proofRejectReason && (
            <div className="text-xs p-2 rounded bg-red-50 border border-red-200 text-red-800">
              <b>Rejection reason:</b> {proofRejectReason}
            </div>
          )}

          {canReview && proofStatus === "pending" && proofUrl && (
            <div className="pt-2 border-t border-border/60 flex flex-wrap gap-2">
              <Button size="sm" onClick={approve} disabled={reviewing}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve proof
              </Button>
              {!rejectOpen ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setRejectOpen(true)}
                  disabled={reviewing}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
              ) : (
                <div className="w-full space-y-2 mt-2">
                  <Label className="text-xs">Rejection reason</Label>
                  <Textarea
                    rows={2}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Why is this proof being rejected?"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={reject} disabled={reviewing || !rejectReason.trim()}>
                      Confirm reject
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRejectOpen(false); setRejectReason(""); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}