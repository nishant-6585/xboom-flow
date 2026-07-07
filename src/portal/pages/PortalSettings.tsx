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
import { Loader2, Plus, UserCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

  // Team
  const isCustomerAdmin = contact?.role === "admin";
  type Teammate = { id: string; full_name: string; email: string; role: string; is_active: boolean; last_login_at: string | null; invited_at: string | null };
  const [team, setTeam] = useState<Teammate[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [iName, setIName] = useState("");
  const [iEmail, setIEmail] = useState("");
  const [iPhone, setIPhone] = useState("");
  const [iRole, setIRole] = useState<"buyer" | "admin" | "technician" | "finance">("buyer");
  const [inviting, setInviting] = useState(false);

  const loadTeam = async () => {
    if (!contact) return;
    setTeamLoading(true);
    const { data, error } = await supabase
      .rpc("get_my_portal_team_with_auth_login");
    if (!error) setTeam((data ?? []) as Teammate[]);
    setTeamLoading(false);
  };

  useEffect(() => {
    if (isCustomerAdmin) void loadTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, isCustomerAdmin]);

  const sendInvite = async () => {
    if (!iName || !iEmail) {
      toast({ title: "Name and email required", variant: "destructive" });
      return;
    }
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("portal-invite-teammate", {
      body: { full_name: iName, email: iEmail, phone: iPhone || undefined, contact_role: iRole },
    });
    setInviting(false);
    if (error || (data as { error?: string })?.error) {
      toast({
        title: "Invite failed",
        description: (data as { error?: string })?.error || error?.message || "Try again",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Invite sent", description: `${iEmail} will receive a setup link.` });
    setInviteOpen(false);
    setIName(""); setIEmail(""); setIPhone(""); setIRole("buyer");
    void loadTeam();
  };

  const toggleActive = async (t: Teammate) => {
    if (t.id === contact?.id) {
      toast({ title: "You can't deactivate yourself", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("portal_contacts")
      .update({ is_active: !t.is_active })
      .eq("id", t.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t.is_active ? "Teammate deactivated" : "Teammate reactivated" });
    void loadTeam();
  };

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

          {isCustomerAdmin && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Team</CardTitle>
                  <CardDescription>Invite teammates to access this portal account.</CardDescription>
                </div>
                <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="h-4 w-4 mr-2" />Invite teammate</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Invite a teammate</DialogTitle>
                      <DialogDescription>They'll get an email with a link to set their password.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div><Label>Full name *</Label><Input value={iName} onChange={(e) => setIName(e.target.value)} /></div>
                      <div><Label>Email *</Label><Input type="email" value={iEmail} onChange={(e) => setIEmail(e.target.value)} /></div>
                      <div><Label>Phone</Label><Input value={iPhone} onChange={(e) => setIPhone(e.target.value)} placeholder="+91…" /></div>
                      <div>
                        <Label>Role</Label>
                        <Select value={iRole} onValueChange={(v) => setIRole(v as typeof iRole)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="buyer">Buyer</SelectItem>
                            <SelectItem value="technician">Technician</SelectItem>
                            <SelectItem value="finance">Finance</SelectItem>
                            <SelectItem value="admin">Customer Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting}>Cancel</Button>
                      <Button onClick={sendInvite} disabled={inviting}>
                        {inviting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send invite
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {teamLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
                ) : team.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No teammates yet.</p>
                ) : (
                  <div className="divide-y">
                    {team.map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-3 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <UserCircle2 className="h-8 w-8 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {t.full_name} {t.id === contact?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{t.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="secondary" className="capitalize">{t.role}</Badge>
                          {!t.is_active && <Badge variant="outline">Inactive</Badge>}
                          {!t.last_login_at && t.is_active && <Badge variant="outline">Pending</Badge>}
                          {t.id !== contact?.id && (
                            <Button size="sm" variant="ghost" onClick={() => toggleActive(t)}>
                              {t.is_active ? "Deactivate" : "Reactivate"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PortalLayout>
  );
}
