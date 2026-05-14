import { PortalLayout } from "@/portal/components/PortalLayout";
import { usePortalAuth } from "@/portal/hooks/usePortalAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, FileText, MessageSquare, FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";

const TILES = [
  { to: "/portal/orders", label: "Orders", icon: Package, hint: "Track your active orders" },
  { to: "/portal/documents", label: "Documents", icon: FileText, hint: "Invoices, manuals, certs" },
  { to: "/portal/rfqs", label: "Quotes & RFQs", icon: FileQuestion, hint: "Request a quote" },
  { to: "/portal/tickets", label: "Support", icon: MessageSquare, hint: "Raise & track tickets" },
];

export default function PortalDashboard() {
  const { contact, account } = usePortalAuth();

  return (
    <PortalLayout>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[2px] text-muted-foreground">Welcome back</p>
        <h1 className="text-3xl font-semibold mt-1">{contact?.full_name?.split(" ")[0] ?? "there"}</h1>
        <p className="text-sm text-muted-foreground mt-1">{account?.company_name}</p>
      </div>

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
