import { useEffect, useState } from "react";
import { PortalLayout } from "@/portal/components/PortalLayout";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface Prefs {
  email_order_status: boolean;
  email_supply_chain_notes: boolean;
  email_new_docs: boolean;
  email_ticket_replies: boolean;
  email_renewals: boolean;
  whatsapp_order_status: boolean;
  whatsapp_supply_chain_notes: boolean;
  whatsapp_new_docs: boolean;
  whatsapp_ticket_replies: boolean;
  whatsapp_renewals: boolean;
}

const DEFAULT_PREFS: Prefs = {
  email_order_status: true,
  email_supply_chain_notes: true,
  email_new_docs: true,
  email_ticket_replies: true,
  email_renewals: true,
  whatsapp_order_status: true,
  whatsapp_supply_chain_notes: true,
  whatsapp_new_docs: false,
  whatsapp_ticket_replies: true,
  whatsapp_renewals: true,
};

const ROWS: Array<{ key: keyof Prefs extends `email_${infer R}` ? R : never; label: string; hint: string }> = [
  { key: "order_status", label: "Order status updates", hint: "When your order moves through production, dispatch, delivery" },
  { key: "supply_chain_notes", label: "Supply chain notes", hint: "Customer-facing updates from our ops team" },
  { key: "new_docs", label: "New documents", hint: "Invoices, manuals, certificates uploaded for you" },
  { key: "ticket_replies", label: "Ticket replies", hint: "Replies on support tickets you raised" },
  { key: "renewals", label: "Renewals & expiries", hint: "DaaS, AMC and warranty reminders" },
] as never;

export default function PortalSettings() {
  const { contact, refresh } = usePortalAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (!contact) return;
    setFullName(contact.full_name ?? "");
    setPhone(contact.phone ?? "");
    setWhatsapp(contact.whatsapp_number ?? "");

    (async () => {
      const { data } = await supabase
        .from("portal_notification_preferences")
        .select("*")
        .eq("contact_id", contact.id)
        .maybeSingle();
      if (data) {
        const { contact_id: _ignored, ...rest } = data as Prefs & { contact_id: string };
        setPrefs({ ...DEFAULT_PREFS, ...(rest as Prefs) });
      }
      setLoading(false);
    })();
  }, [contact]);

  const saveProfile = async () => {
    if (!contact) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("portal_contacts")
      .update({ full_name: fullName.trim(), phone: phone.trim() || null, whatsapp_number: whatsapp.trim() || null })
      .eq("id", contact.id);
    setSavingProfile(false);
    if (error) {
      toast({ title: "Couldn't save profile", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Profile updated" });
    await refresh();
  };

  const savePrefs = async () => {
    if (!contact) return;
    setSavingPrefs(true);
    const { error } = await supabase
      .from("portal_notification_preferences")
      .upsert({ contact_id: contact.id, ...prefs }, { onConflict: "contact_id" });
    setSavingPrefs(false);
    if (error) {
      toast({ title: "Couldn't save preferences", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Preferences saved" });
  };

  const toggle = (k: keyof Prefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <PortalLayout>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[2px] text-muted-foreground">Account</p>
        <h1 className="text-3xl font-semibold mt-1">Settings</h1>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
      ) : (
        <div className="grid gap-6 max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>Your profile</CardTitle>
              <CardDescription>Used on tickets, invoices and notifications.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="fn">Full name</Label>
                <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="em">Email</Label>
                <Input id="em" value={contact?.email ?? ""} disabled />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Input id="role" value={contact?.role ?? ""} disabled className="capitalize" />
              </div>
              <div>
                <Label htmlFor="ph">Phone</Label>
                <Input id="ph" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" />
              </div>
              <div>
                <Label htmlFor="wa">WhatsApp number</Label>
                <Input id="wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+91…" />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button onClick={saveProfile} disabled={savingProfile}>
                  {savingProfile && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save profile
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notification preferences</CardTitle>
              <CardDescription>Choose how you want to be notified. WhatsApp requires a number on file.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-4 items-center">
                <div />
                <div className="text-xs uppercase tracking-wider text-muted-foreground text-center">Email</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground text-center">WhatsApp</div>
                {ROWS.map((row, i) => {
                  const ek = `email_${row.key}` as keyof Prefs;
                  const wk = `whatsapp_${row.key}` as keyof Prefs;
                  return (
                    <div key={row.key} className="contents">
                      {i > 0 && <Separator className="col-span-3" />}
                      <div>
                        <div className="font-medium text-sm">{row.label}</div>
                        <div className="text-xs text-muted-foreground">{row.hint}</div>
                      </div>
                      <Switch checked={prefs[ek] as boolean} onCheckedChange={() => toggle(ek)} />
                      <Switch checked={prefs[wk] as boolean} onCheckedChange={() => toggle(wk)} disabled={!whatsapp} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end mt-6">
                <Button onClick={savePrefs} disabled={savingPrefs}>
                  {savingPrefs && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PortalLayout>
  );
}
