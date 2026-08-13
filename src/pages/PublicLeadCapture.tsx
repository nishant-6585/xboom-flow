import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, UserPlus, Send, AlertCircle } from "lucide-react";
import { validateEmail, validatePhone } from "@/lib/contactValidation";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-lead-public`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

interface Rep { id: string; name: string }

const empty = {
  customer_name: "",
  phone: "",
  email: "",
  company: "",
  city: "",
  product_name: "",
  quantity: "",
  lead_source: "",
  referred_by: "",
  notes: "",
  sales_person_id: "auto",
};

export default function PublicLeadCapture() {
  const [form, setForm] = useState(empty);
  const [reps, setReps] = useState<Rep[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ assigned_to_name: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(FN_URL, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
        const body = await res.json();
        if (body?.ok) {
          setReps(body.reps ?? []);
          setSources(body.sources ?? []);
        }
      } catch {
        /* form still usable; source list falls back below */
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  const set = (k: keyof typeof empty, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validationError = useMemo(() => {
    if (form.customer_name.trim().length < 2) return "Please enter the customer name";
    const p = validatePhone(form.phone, { required: true });
    if (p.valid === false) return p.error || "Enter a valid phone number";
    const em = validateEmail(form.email);
    if (em.valid === false) return em.error || "Enter a valid email address";
    if (!form.lead_source) return "Please select the lead source";
    return null;
  }, [form]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (validationError) { setError(validationError); return; }
    setSubmitting(true);
    try {
      const res = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          ...form,
          quantity: form.quantity ? Number(form.quantity) : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error(body?.error || "Submission failed");
      setDone({ assigned_to_name: body.assigned_to_name ?? null });
      setForm(empty);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const sourceOptions = sources.length ? sources : ["Referral", "Walk-in", "Exhibition / Event", "Other"];

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <Helmet>
        <title>Capture a Lead | XBoom</title>
        <meta name="description" content="Submit a referral or walk-in enquiry to the XBoom sales team." />
        <link rel="canonical" href="https://xboomflow.com/public/lead-capture" />
      </Helmet>

      <div className="mx-auto w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <UserPlus className="h-5 w-5 text-primary" /> Capture a Lead
            </CardTitle>
            <CardDescription>
              Referrals, walk-ins and offline enquiries — this goes straight to the sales team.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {done ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <h2 className="text-lg font-semibold">Lead submitted</h2>
                <p className="text-sm text-muted-foreground">
                  {done.assigned_to_name
                    ? `Assigned to ${done.assigned_to_name}. They will follow up shortly.`
                    : "Our sales team will follow up shortly."}
                </p>
                <Button variant="outline" onClick={() => setDone(null)}>Capture another lead</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="name">Customer name *</Label>
                    <Input id="name" value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} maxLength={120} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="phone">Phone *</Label>
                    <Input id="phone" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={20} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={255} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="company">Company</Label>
                    <Input id="company" value={form.company} onChange={(e) => set("company", e.target.value)} maxLength={160} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={120} />
                  </div>

                  <div className="grid gap-2">
                    <Label>Lead source *</Label>
                    <Select value={form.lead_source} onValueChange={(v) => set("lead_source", v)}>
                      <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                      <SelectContent>
                        {sourceOptions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Assign to salesperson</Label>
                    <Select value={form.sales_person_id} onValueChange={(v) => set("sales_person_id", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={loadingMeta ? "Loading…" : "Auto-assign"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-assign (round robin)</SelectItem>
                        {reps.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="referred_by">Referred by</Label>
                    <Input id="referred_by" value={form.referred_by} onChange={(e) => set("referred_by", e.target.value)} maxLength={160} placeholder="Name of the person who referred" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="product">Product interested in</Label>
                    <Input id="product" value={form.product_name} onChange={(e) => set("product_name", e.target.value)} maxLength={200} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="qty">Quantity</Label>
                    <Input id="qty" type="number" min={1} max={9999} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
                  </div>
                  <div className="grid gap-2 sm:col-span-2">
                    <Label htmlFor="notes">Requirement / notes</Label>
                    <Textarea id="notes" rows={4} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
                  </div>
                </div>

                {error && (
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Submit lead
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
