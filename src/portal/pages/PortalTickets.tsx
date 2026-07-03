import { useState } from "react";
import { Link } from "react-router-dom";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, MessageSquare, ArrowRight, Loader2, Wrench } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  usePortalTickets,
  useCreateTicket,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketCategory,
  type TicketPriority,
} from "@/portal/hooks/usePortalTickets";
import { TicketPriorityBadge, TicketStatusBadge } from "@/portal/components/TicketStatusBadge";
import { usePortalOrders } from "@/portal/hooks/usePortalOrders";
import { AttachmentUploader } from "@/portal/components/AttachmentUploader";
import type { UploadedAttachment } from "@/portal/lib/portalUploads";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

type MyPurchaseOption = {
  order_id: string;
  order_number: string | null;
  product_name: string | null;
};

function useMyPurchaseOptions() {
  return useQuery({
    queryKey: ["portal", "my-purchases", "options"],
    queryFn: async (): Promise<MyPurchaseOption[]> => {
      const { data, error } = await (supabase as any).rpc("get_my_purchases");
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        order_id: r.order_id,
        order_number: r.order_number,
        product_name: r.product_name,
      }));
    },
    staleTime: 60_000,
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalTickets() {
  const { data, isLoading } = usePortalTickets();
  const [open, setOpen] = useState(false);
  const [srOpen, setSrOpen] = useState(false);

  return (
    <PortalLayout>
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">Raise a ticket and follow the conversation here.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSrOpen(true)}>
            <Wrench className="h-4 w-4 mr-1.5" /> Raise a Service Request
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New ticket
          </Button>
        </div>
      </div>

      {isLoading && <Skeleton className="h-48 w-full" />}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No tickets yet</p>
            <p className="text-sm text-muted-foreground mt-1">Need help? Raise a ticket and our team will respond.</p>
            <Button className="mt-4" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Raise a ticket
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data?.map((t) => (
          <Link key={t.id} to={`/portal/tickets/${t.id}`} className="block group">
            <Card className="transition-shadow group-hover:shadow-md">
              <CardContent className="py-4 px-5 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{t.ticket_number}</span>
                    <TicketStatusBadge status={t.status} />
                    <TicketPriorityBadge priority={t.priority} />
                    {t.ticket_type === "service_request" && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        <Wrench className="h-3 w-3 mr-1" /> Service request · 12h SLA
                      </Badge>
                    )}
                  </div>
                  <div className="font-medium mt-1 truncate">{t.subject}</div>
                  {t.related_order_number && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      Order {t.related_order_number}
                      {t.related_product_name ? ` · ${t.related_product_name}` : ""}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Updated {formatDate(t.updated_at)}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <NewTicketDialog open={open} onOpenChange={setOpen} />
      <ServiceRequestDialog open={srOpen} onOpenChange={setSrOpen} />
    </PortalLayout>
  );
}

function NewTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const create = useCreateTicket();
  const { data: orders } = usePortalOrders();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("technical");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [orderId, setOrderId] = useState<string>("none");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);

  function reset() {
    setSubject("");
    setDescription("");
    setCategory("technical");
    setPriority("medium");
    setOrderId("none");
    setAttachments([]);
  }

  async function submit() {
    if (subject.trim().length < 5) {
      toast({ title: "Subject too short", variant: "destructive" });
      return;
    }
    if (description.trim().length < 20) {
      toast({ title: "Add more detail", description: "Description must be at least 20 characters.", variant: "destructive" });
      return;
    }
    try {
      const res = await create.mutateAsync({
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        order_id: orderId === "none" ? null : orderId,
        attachments,
      });
      toast({ title: "Ticket raised", description: `${res?.ticket_number} — we'll respond soon.` });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: "Couldn't raise ticket", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Related order (optional)</Label>
            <Select value={orderId} onValueChange={setOrderId}>
              <SelectTrigger><SelectValue placeholder="Select an order" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {orders?.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.order_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              rows={6}
              placeholder="Tell us what's happening, what you've tried, and any error messages."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label className="mb-2 block">Attachments</Label>
            <AttachmentUploader scope="ticket" attachments={attachments} onChange={setAttachments} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Raise ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const create = useCreateTicket();
  const { data: purchases, isLoading: loadingPurchases } = useMyPurchaseOptions();
  const [purchaseId, setPurchaseId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);

  const selected = purchases?.find((p) => p.order_id === purchaseId) ?? null;

  function reset() {
    setPurchaseId("");
    setDescription("");
    setAttachments([]);
  }

  async function submit() {
    if (!selected) {
      toast({ title: "Select a purchase", description: "Pick the order this service request is for.", variant: "destructive" });
      return;
    }
    if (description.trim().length < 20) {
      toast({ title: "Add more detail", description: "Please describe the issue (min 20 chars).", variant: "destructive" });
      return;
    }
    const subject = `Service request — ${selected.product_name ?? "Order"} (${selected.order_number ?? "no #"})`;
    try {
      const res = await create.mutateAsync({
        subject,
        description: description.trim(),
        category: "technical",
        priority: "high",
        order_id: null,
        attachments,
        ticket_type: "service_request",
        related_order_id: selected.order_id,
        related_order_number: selected.order_number,
        related_product_name: selected.product_name,
      });
      toast({ title: "Service request raised", description: `${res?.ticket_number} — supply chain team notified (12h SLA).` });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: "Couldn't raise request", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raise a Service Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            For drones you've purchased — our supply-chain team will respond within 12 hours.
          </p>
          <div>
            <Label>Purchase *</Label>
            <Select value={purchaseId} onValueChange={setPurchaseId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingPurchases ? "Loading purchases…" : "Select the order / product"} />
              </SelectTrigger>
              <SelectContent>
                {(purchases ?? []).map((p) => (
                  <SelectItem key={p.order_id} value={p.order_id}>
                    {(p.order_number ?? "Order")} — {p.product_name ?? "Product"}
                  </SelectItem>
                ))}
                {(!loadingPurchases && (purchases?.length ?? 0) === 0) && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No purchases on record. Contact support if this looks wrong.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="sr-description">What's going wrong? *</Label>
            <Textarea
              id="sr-description"
              rows={6}
              placeholder="Describe the issue, when it started, and any error codes."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-2 block">Photos / videos (optional)</Label>
            <AttachmentUploader scope="ticket" attachments={attachments} onChange={setAttachments} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !purchaseId}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Raise service request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}