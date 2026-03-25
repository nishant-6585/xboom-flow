import { useState } from "react";
import { Enquiry } from "@/hooks/useEnquiries";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Sparkles, MessageCircle, Mail, Lightbulb, Loader2, RefreshCw } from "lucide-react";
import { differenceInDays } from "date-fns";

interface FollowupDrafterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Enquiry;
}

interface Drafts {
  whatsapp_message: string;
  email_subject: string;
  email_body: string;
  follow_up_strategy: string;
  tone_used: string;
}

export function FollowupDrafterDialog({ open, onOpenChange, enquiry }: FollowupDrafterDialogProps) {
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [editedWhatsapp, setEditedWhatsapp] = useState("");
  const [editedEmailSubject, setEditedEmailSubject] = useState("");
  const [editedEmailBody, setEditedEmailBody] = useState("");

  const generateDrafts = async () => {
    setLoading(true);
    try {
      const daysSinceCreated = differenceInDays(new Date(), new Date(enquiry.created_at));
      
      const { data, error } = await supabase.functions.invoke("ai-followup-drafter", {
        body: {
          enquiry: {
            ...enquiry,
            days_since_created: daysSinceCreated,
          },
        },
      });

      if (error) throw error;

      if (data?.error) {
        if (data.error.includes("Rate limit")) {
          toast.error("Rate limited — please try again in a moment.");
        } else if (data.error.includes("credits")) {
          toast.error("AI credits exhausted. Please add credits in workspace settings.");
        } else {
          toast.error(data.error);
        }
        return;
      }

      const d = data.drafts;
      setDrafts(d);
      setEditedWhatsapp(d.whatsapp_message);
      setEditedEmailSubject(d.email_subject);
      setEditedEmailBody(d.email_body);
      toast.success("Follow-up drafts generated!");
    } catch (err) {
      console.error("Failed to generate drafts:", err);
      toast.error("Failed to generate follow-up drafts");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const getToneBadge = (tone: string) => {
    const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      aggressive_close: { label: "🔥 Aggressive Close", variant: "destructive" },
      value_focused: { label: "💡 Value Focused", variant: "default" },
      soft_nurture: { label: "🌱 Soft Nurture", variant: "secondary" },
    };
    const c = config[tone] || { label: tone, variant: "outline" as const };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Follow-up Drafter
          </DialogTitle>
          <DialogDescription>
            Generate personalized follow-up messages for{" "}
            <span className="font-medium text-foreground">{enquiry.customer_name}</span> —{" "}
            <span className="text-primary">{enquiry.product_name}</span>
          </DialogDescription>
        </DialogHeader>

        {!drafts ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Sparkles className="w-12 h-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              AI will analyze the lead context and generate personalized WhatsApp &amp; Email follow-ups.
            </p>
            <Button onClick={generateDrafts} disabled={loading} size="lg">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Follow-up
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getToneBadge(drafts.tone_used)}
              </div>
              <Button variant="outline" size="sm" onClick={generateDrafts} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span className="ml-1">Regenerate</span>
              </Button>
            </div>

            <Tabs defaultValue="whatsapp">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="whatsapp" className="flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </TabsTrigger>
                <TabsTrigger value="email" className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4" />
                  Email
                </TabsTrigger>
              </TabsList>

              <TabsContent value="whatsapp" className="space-y-3 mt-3">
                <Textarea
                  value={editedWhatsapp}
                  onChange={(e) => setEditedWhatsapp(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {editedWhatsapp.length} characters
                  </span>
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(editedWhatsapp, "WhatsApp message")}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy Message
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="email" className="space-y-3 mt-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Subject</label>
                  <Textarea
                    value={editedEmailSubject}
                    onChange={(e) => setEditedEmailSubject(e.target.value)}
                    rows={1}
                    className="resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">Body</label>
                  <Textarea
                    value={editedEmailBody}
                    onChange={(e) => setEditedEmailBody(e.target.value)}
                    rows={10}
                    className="resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(editedEmailSubject, "Email subject")}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy Subject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(`Subject: ${editedEmailSubject}\n\n${editedEmailBody}`, "Full email")}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy Full Email
                  </Button>
                </div>
              </TabsContent>
            </Tabs>

            {/* Strategy Recommendation */}
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2 mb-1">
                <Lightbulb className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">AI Recommendation</span>
              </div>
              <p className="text-sm text-muted-foreground">{drafts.follow_up_strategy}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
