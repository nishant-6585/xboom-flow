import { useState } from "react";
import { Search, Users, Mail, Phone, Building2, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOutboundContacts } from "@/hooks/useOutboundContacts";

export function OutboundContactsList() {
  const { contacts, isLoadingContacts } = useOutboundContacts();
  const [search, setSearch] = useState('');

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.contact_name?.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.city?.toLowerCase().includes(q)
    );
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-primary" />
            Outbound Contacts ({contacts.length})
          </CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingContacts ? (
          <p className="text-center text-muted-foreground py-8">Loading contacts...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No contacts found. Upload an Excel file to get started.</p>
        ) : (
          <ScrollArea className="h-[500px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-2 font-medium">Contact</th>
                  <th className="text-left p-2 font-medium">Company</th>
                  <th className="text-left p-2 font-medium">Email</th>
                  <th className="text-left p-2 font-medium">Phone</th>
                  <th className="text-left p-2 font-medium">City</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-left p-2 font-medium">Dupes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/50">
                    <td className="p-2">
                      <div>
                        <p className="font-medium">{c.contact_name}</p>
                        {c.designation && <p className="text-xs text-muted-foreground">{c.designation}</p>}
                      </div>
                    </td>
                    <td className="p-2">
                      {c.company_name ? (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {c.company_name}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-2">
                      {c.email ? (
                        <span className="flex items-center gap-1 text-xs">
                          <Mail className="w-3 h-3" />
                          {c.email}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-2">
                      {c.phone ? (
                        <span className="flex items-center gap-1 text-xs">
                          <Phone className="w-3 h-3" />
                          {c.phone}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-2">
                      {c.city ? (
                        <span className="flex items-center gap-1 text-xs">
                          <MapPin className="w-3 h-3" />
                          {c.city}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs">{c.status}</Badge>
                    </td>
                    <td className="p-2">
                      {c.duplicate_count > 0 && (
                        <Badge variant="secondary" className="text-xs">{c.duplicate_count}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
