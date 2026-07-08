import { PortalLayout } from "@/portal/components/PortalLayout";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FileText, MessageSquare, FileQuestion, AlertCircle, ShieldAlert, ShieldCheck, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { usePendingConfirmations } from "@/portal/pages/PortalConfirm";
import { Button } from "@/components/ui/button";
import { useMyKyc } from "@/hooks/useKyc";
import { usePortalOrders } from "@/portal/hooks/usePortalOrders";

const TILES = [
  { to: "/portal/orders", label: "Orders", icon: Package, hint: "Track your active orders" },
  { to: "/portal/documents", label: "Documents", icon: FileText, hint: "Invoices, manuals, certs" },
  { to: "/portal/rfqs", label: "Quotes & RFQs", icon: FileQuestion, hint: "Request a quote" },
  { to: "/portal/tickets", label: "Support", icon: MessageSquare, hint: "Raise & track tickets" },
];

export default function PortalDashboard() {
  const { contact, account } = usePortalAuth();
  const { data: pending } = usePendingConfirmations();
  const pendingCount = pending?.length ?? 0;
  const { account: kycAccount } = useMyKyc();
  const { data: orders } = usePortalOrders();
  const kycStatus = kycAccount?.kyc_status ?? "not_submitted";
  const hasOrders = (orders?.length ?? 0) > 0;

  return (
    <PortalLayout>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[2px] text-muted-foreground">Welcome back</p>
        <h1 className="text-3xl font-semibold mt-1">{contact?.full_name?.split(" ")[0] ?? "there"}</h1>
        <p className="text-sm text-muted-foreground mt-1">{account?.company_name}</p>
      </div>

      {kycStatus === "rejected" && (
        <Card className="mb-6 border-red-400 bg-red-50">
          <CardContent className="py-4 px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-900">KYC Resubmission Required</p>
                <p className="text-sm text-red-800/90 mt-0.5">
                  {kycAccount?.kyc_rejection_reason
                    ? `Reason: ${kycAccount.kyc_rejection_reason}`
                    : "Your last KYC submission could not be approved. Please resubmit to continue."}
                </p>
              </div>
            </div>
            <Button asChild variant="destructive">
              <Link to="/portal/kyc">Update KYC</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {kycStatus === "pending_verification" && (
        <Card className="mb-6 border-amber-400 bg-amber-50">
          <CardContent className="py-4 px-5 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-900">KYC under review</p>
              <p className="text-sm text-amber-800/80 mt-0.5">
                We've received your documents and our team is verifying them. This typically takes a few hours.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {(kycStatus === "not_submitted" || kycStatus === "resubmission_required") && hasOrders && (
        <Card className="mb-6 border-amber-400 bg-amber-50">
          <CardContent className="py-4 px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-900">Complete your KYC to process your order</p>
                <p className="text-sm text-amber-800/80 mt-0.5">
                  Verify your identity so we can dispatch your order without delay.
                </p>
              </div>
            </div>
            <Button asChild>
              <Link to="/portal/kyc">Start KYC</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {pendingCount > 0 && (
        <Card className="mb-6 border-amber-400 bg-amber-50">
          <CardContent className="py-4 px-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-900">
                  {pendingCount === 1
                    ? "1 order is waiting for your confirmation"
                    : `${pendingCount} orders are waiting for your confirmation`}
                </p>
                <p className="text-sm text-amber-800/80">
                  Please review and confirm so we can dispatch them.
                </p>
              </div>
            </div>
            <Button asChild>
              <Link to="/portal/confirm">Review &amp; confirm</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="block group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base font-medium">{t.label}</CardTitle>
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "hsl(var(--portal-gold))" }}
                  />
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{t.hint}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>This is your home for everything xboom — orders, documents, quotes, and support — all in one place.</p>
          <p>Detailed pages will be filled in shortly. If you need anything urgent, use the Support section.</p>
        </CardContent>
      </Card>
    </PortalLayout>
  );
}
