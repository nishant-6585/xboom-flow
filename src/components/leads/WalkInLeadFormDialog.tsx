import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, TriangleAlert, UserPlus, X } from "lucide-react";
import {
  useCreateWalkInLead,
  useExistingLeadMatches,
  WALK_IN_OUTCOMES,
  WALK_IN_TIMELINES,
  WALK_IN_REFERRAL_SOURCES,
} from "@/hooks/useWalkInLeads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (leadId: number) => void;
}

/** Follow-up presets — a rep with a customer in front of them shouldn't be
 *  picking dates out of a calendar widget. */
const FOLLOW_UP_PRESETS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "In 2 weeks", days: 14 },
] as const;

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

export function WalkInLeadFormDialog({ open, onOpenChange, onCreated }: Props) {
  const create = useCreateWalkInLead();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [productInput, setProductInput] = useState("");
  const [products, setProducts] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [outcome, setOutcome] = useState("");
  const [referral, setReferral] = useState("");
  const [accompaniedBy, setAccompaniedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [followUpLabel, setFollowUpLabel] = useState<string | null>(null);

  const { matches, isChecking } = useExistingLeadMatches(phone, email);

  function reset() {
    setName(""); setPhone(""); setEmail(""); setCompany("");
    setStoreLocation(""); setProductInput(""); setProducts([]);
    setBudget(""); setTimeline(""); setOutcome(""); setReferral("");
    setAccompaniedBy(""); setNotes(""); setFollowUp(null); setFollowUpLabel(null);
  }

  function addProduct() {
    const p = productInput.trim();
    if (!p) return;
    if (!products.includes(p)) setProducts((prev) => [...prev, p]);
    setProductInput("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Customer name is required");
    if (phone.replace(/\D/g, "").length < 10) {
      return toast.error("Enter a valid phone number");
    }
    try {
      const leadId = await create.mutateAsync({
        name, phone, email, company,
        store_location: storeLocation,
        products_interested: products,
        budget_range: budget,
        purchase_timeline: timeline,
        visit_outcome: outcome,
        follow_up_at: followUp,
        referral_source: referral,
        accompanied_by: accompaniedBy,
        notes,
      });
      toast.success(`Walk-in recorded and assigned to you`);
      onCreated?.(leadId);
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not record the walk-in");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" /> Record a walk-in
          </DialogTitle>
          <DialogDescription>
            Captured against you automatically — no assignment step. Only the name
            and phone are required, so you can finish this while the customer is
            still with you and fill in the rest afterwards.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] px-6">
          <form id="walk-in-form" onSubmit={handleSubmit} className="space-y-5 pb-4">
            {/* Who */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wi-name">Customer name *</Label>
                <Input id="wi-name" value={name} onChange={(e) => setName(e.target.value)}
                       placeholder="Full name" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-phone">Phone *</Label>
                <Input id="wi-phone" value={phone} onChange={(e) => setPhone(e.target.value)}
                       placeholder="10-digit mobile" inputMode="tel" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-email">Email</Label>
                <Input id="wi-email" type="email" value={email}
                       onChange={(e) => setEmail(e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-company">Company</Label>
                <Input id="wi-company" value={company}
                       onChange={(e) => setCompany(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            {/* Duplicate warning — shown, never blocking. The rep is standing
                with the customer and is better placed to judge than we are. */}
            {isChecking && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking for existing leads…
              </p>
            )}
            {matches.length > 0 && (
              <div
                className="rounded-md border border-amber-400/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2"
                data-testid="walk-in-duplicate-warning"
              >
                <div className="flex items-start gap-2 text-sm">
                  <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <div className="font-medium">
                      Already in the pipeline ({matches.length})
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Someone with this phone or email already exists. Recording this
                      anyway is fine — just check you are not doubling up on a
                      colleague's customer.
                    </div>
                  </div>
                </div>
                <ul className="space-y-1">
                  {matches.slice(0, 4).map((m) => (
                    <li key={`${m.source}-${m.source_row_id}`}
                        className="text-xs flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">{m.source}</Badge>
                      <span className="font-medium">{m.name ?? "—"}</span>
                      <span className="text-muted-foreground">
                        {m.sales_person_name ? `owned by ${m.sales_person_name}` : "unassigned"}
                        {m.status ? ` · ${m.status}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* The visit */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wi-store">Store / branch</Label>
                <Input id="wi-store" value={storeLocation}
                       onChange={(e) => setStoreLocation(e.target.value)}
                       placeholder="Where they walked in" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-referral">How did they hear about us?</Label>
                <Select value={referral} onValueChange={setReferral}>
                  <SelectTrigger id="wi-referral"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {WALK_IN_REFERRAL_SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Interest */}
            <div className="space-y-1.5">
              <Label htmlFor="wi-products">Products they looked at</Label>
              <div className="flex gap-2">
                <Input
                  id="wi-products"
                  value={productInput}
                  onChange={(e) => setProductInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addProduct(); }
                  }}
                  placeholder="Type and press Enter"
                />
                <Button type="button" variant="outline" onClick={addProduct}>Add</Button>
              </div>
              {products.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {products.map((p) => (
                    <Badge key={p} variant="secondary" className="gap-1">
                      {p}
                      <button type="button" aria-label={`Remove ${p}`}
                              onClick={() => setProducts((prev) => prev.filter((x) => x !== p))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wi-budget">Budget</Label>
                <Input id="wi-budget" value={budget} onChange={(e) => setBudget(e.target.value)}
                       placeholder="e.g. ₹2–3L" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-timeline">Buying timeline</Label>
                <Select value={timeline} onValueChange={setTimeline}>
                  <SelectTrigger id="wi-timeline"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {WALK_IN_TIMELINES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Outcome */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wi-outcome">How did the visit end?</Label>
                <Select value={outcome} onValueChange={setOutcome}>
                  <SelectTrigger id="wi-outcome"><SelectValue placeholder="Can be filled in later" /></SelectTrigger>
                  <SelectContent>
                    {WALK_IN_OUTCOMES.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wi-accompanied">Came with</Label>
                <Input id="wi-accompanied" value={accompaniedBy}
                       onChange={(e) => setAccompaniedBy(e.target.value)}
                       placeholder="Spouse, colleague, consultant…" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Follow up</Label>
              <div className="flex flex-wrap gap-1.5">
                {FOLLOW_UP_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant={followUpLabel === p.label ? "default" : "outline"}
                    onClick={() => {
                      if (followUpLabel === p.label) { setFollowUp(null); setFollowUpLabel(null); }
                      else { setFollowUp(isoInDays(p.days)); setFollowUpLabel(p.label); }
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wi-notes">Notes</Label>
              <Textarea id="wi-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                        rows={3} placeholder="What they asked for, objections, anything worth remembering" />
            </div>
          </form>
        </ScrollArea>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="walk-in-form" disabled={create.isPending}>
            {create.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Record walk-in
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
