import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";

interface PortalAccountRow {
  id: string;
  company_name: string;
  status: string;
  industry: string | null;
  created_at: string;
  contact_count?: number;
}

export default function PortalCustomers() {
  const { role } = useAuth();
  const [rows, setRows] = useState<PortalAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [industry, setIndustry] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactRole, setContactRole] = useState<"buyer" | "admin" | "technician" | "finance">("buyer");
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = role === "admin";

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("portal_accounts")
      .select("id, company_name, status, industry, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load accounts", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as PortalAccountRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const reset = () => {
    setCompanyName("");
    setGstin("");
    setIndustry("");
    setFullName("");
    setEmail("");
    setPhone("");
    setContactRole("buyer");
  };

  const submit = async () => {
    if (!companyName || !fullName || !email) {
      toast({ title: "Missing fields", description: "Company, full name and email are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("portal-invite-customer", {
      body: {
        new_account: {
          company_name: companyName,
          gstin: gstin || undefined,
          industry: industry || undefined,
          primary_contact_name: fullName,
        },
        full_name: fullName,
        email,
        phone: phone || undefined,
        contact_role: contactRole,
      },
    });
    setSubmitting(false);
    if (error || (data as { error?: string })?.error) {
      const msg = (data as { error?: string })?.error || error?.message || "Invite failed";
      toast({ title: "Invite failed", description: msg, variant: "destructive" });
      return;
    }
    toast({ title: "Invite sent", description: `${email} will receive a setup link.` });
    setOpen(false);
    reset();
    load();
  };

  if (!isAdmin) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <Header />
        <div className="max-w-3xl mx-auto px-4 py-12">
          <Card>
            <CardHeader>
              <CardTitle>Admin only</CardTitle>
              <CardDescription>You don't have permission to manage portal customers.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">B2B Portal Customers</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage customer companies and invite portal users.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Invite customer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Invite a new customer</DialogTitle>
                <DialogDescription>
                  Creates a portal account, a primary contact, and emails them a setup link.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Company name *</Label>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Drones Pvt Ltd" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>GSTIN</Label>
                    <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Surveying" />
                  </div>
                </div>
                <div className="border-t pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Primary contact name *</Label>
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={contactRole} onValueChange={(v) => setContactRole(v as typeof contactRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buyer">Buyer</SelectItem>
                        <SelectItem value="admin">Customer Admin</SelectItem>
                        <SelectItem value="technician">Technician</SelectItem>
                        <SelectItem value="finance">Finance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
                <Button onClick={submit} disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send invite
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No portal customers yet. Click "Invite customer" to get started.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.company_name}</TableCell>
                      <TableCell>{r.industry ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
