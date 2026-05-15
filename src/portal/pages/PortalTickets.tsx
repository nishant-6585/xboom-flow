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
import { Plus, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalTickets() {
  const { data, isLoading } = usePortalTickets();
  const [open, setOpen] = useState(false);

  return (
    <PortalLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">Raise a ticket and follow the conversation here.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New ticket
        </Button>
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
                  </div>
                  <div className="font-medium mt-1 truncate">{t.subject}</div>
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