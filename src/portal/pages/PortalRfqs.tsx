import { useState } from "react";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, FileQuestion, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  usePortalRfqs,
  useCreateRfq,
  RFQ_DOMAINS,
  RFQ_BUDGET_RANGES,
  RFQ_DAAS_OPTIONS,
  type PortalRfq,
} from "@/portal/hooks/usePortalRfqs";
import { AttachmentUploader } from "@/portal/components/AttachmentUploader";
import type { UploadedAttachment } from "@/portal/lib/portalUploads";

const STATUS_LABELS: Record<PortalRfq["status"], string> = {
  open: "Open",
  in_quote: "Quote in progress",
  converted: "Converted to order",
  closed: "Closed",
};

const STATUS_TONES: Record<PortalRfq["status"], string> = {
  open: "bg-blue-100 text-blue-800",
  in_quote: "bg-amber-100 text-amber-900",
  converted: "bg-emerald-100 text-emerald-900",
  closed: "bg-muted text-muted-foreground",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function PortalRfqs() {
  const { data, isLoading } = usePortalRfqs();
  const [open, setOpen] = useState(false);

  return (
    <PortalLayout>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Quotes & RFQs</h1>
          <p className="text-sm text-muted-foreground mt-1">Tell us what you need — we'll get back with a quote.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New RFQ
        </Button>
      </div>

      {isLoading && <Skeleton className="h-48 w-full" />}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <FileQuestion className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No RFQs yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create a request and our team will respond within 1 business day.</p>
            <Button className="mt-4" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Create your first RFQ
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data?.map((r) => (
          <Card key={r.id}>
            <CardContent className="py-4 px-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.rfq_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_TONES[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                  </div>
                  <p className="text-sm mt-2 line-clamp-2">{r.use_case}</p>
                  <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {r.domains.length > 0 && <span>{r.domains.join(" · ")}</span>}
                    {r.budget_range && <span>Budget: {r.budget_range}</span>}
                    <span>Submitted {formatDate(r.created_at)}</span>
                    {r.attachments?.length > 0 && <span>{r.attachments.length} attachment(s)</span>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <NewRfqDialog open={open} onOpenChange={setOpen} />
    </PortalLayout>
  );
}

function NewRfqDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const create = useCreateRfq();
  const [domains, setDomains] = useState<string[]>([]);
  const [useCase, setUseCase] = useState("");
  const [desiredDate, setDesiredDate] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [daas, setDaas] = useState<string>("open");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);

  function reset() {
    setDomains([]);
    setUseCase("");
    setDesiredDate("");
    setBudget("");
    setDaas("open");
    setAttachments([]);
  }

  async function submit() {
    if (!useCase.trim() || useCase.trim().length < 20) {
      toast({ title: "Add more detail", description: "Use case must be at least 20 characters.", variant: "destructive" });
      return;
    }
    if (domains.length === 0) {
      toast({ title: "Pick at least one domain", variant: "destructive" });
      return;
    }
    try {
      const res = await create.mutateAsync({
        domains,
        use_case: useCase.trim(),
        desired_date: desiredDate || null,
        budget_range: budget || null,
        daas_interest: daas || null,
        attachments,
      });
      toast({ title: "RFQ submitted", description: `${res?.rfq_number} — our team will respond shortly.` });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({ title: "Couldn't submit RFQ", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New RFQ</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Domains *</Label>
            <div className="grid grid-cols-2 gap-2">
              {RFQ_DOMAINS.map((d) => {
                const checked = domains.includes(d);
                return (
                  <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setDomains((prev) => (v ? [...prev, d] : prev.filter((x) => x !== d)))
                      }
                    />
                    {d}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="use_case">Use case *</Label>
            <Textarea
              id="use_case"
              rows={5}
              placeholder="What are you trying to achieve? Quantity, payload, range, deployment timeline..."
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="desired_date">Desired delivery</Label>
              <Input
                id="desired_date"
                type="date"
                value={desiredDate}
                onChange={(e) => setDesiredDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Budget</Label>
              <Select value={budget} onValueChange={setBudget}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a range" />
                </SelectTrigger>
                <SelectContent>
                  {RFQ_BUDGET_RANGES.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Buy vs DaaS</Label>
            <Select value={daas} onValueChange={setDaas}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RFQ_DAAS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-2 block">Attachments</Label>
            <AttachmentUploader scope="rfq" attachments={attachments} onChange={setAttachments} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Submit RFQ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}