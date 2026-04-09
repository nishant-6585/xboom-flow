import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Users, BarChart3 } from "lucide-react";
import { OutboundExcelUpload } from "./outbound/OutboundExcelUpload";
import { OutboundContactsList } from "./outbound/OutboundContactsList";
import { OutboundAnalytics } from "./outbound/OutboundAnalytics";

export function OutboundSalesPanel() {
  return (
    <Tabs defaultValue="upload" className="space-y-4">
      <TabsList>
        <TabsTrigger value="upload" className="flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload
        </TabsTrigger>
        <TabsTrigger value="contacts" className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          Contacts
        </TabsTrigger>
        <TabsTrigger value="analytics" className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Analytics
        </TabsTrigger>
      </TabsList>

      <TabsContent value="upload">
        <OutboundExcelUpload />
      </TabsContent>

      <TabsContent value="contacts">
        <OutboundContactsList />
      </TabsContent>

      <TabsContent value="analytics">
        <OutboundAnalytics />
      </TabsContent>
    </Tabs>
  );
}
