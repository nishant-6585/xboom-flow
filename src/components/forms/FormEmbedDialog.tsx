import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Copy, Check, Code } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FormEmbedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
}

export function FormEmbedDialog({ open, onOpenChange, formId, formName }: FormEmbedDialogProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState("100%");
  const [height, setHeight] = useState("600");

  const baseUrl = window.location.origin;
  const embedUrl = `${baseUrl}/form-embed/${formId}`;
  
  const embedCode = `<iframe 
  src="${embedUrl}" 
  width="${width}" 
  height="${height}px" 
  frameborder="0" 
  style="border: none; border-radius: 8px;"
  title="${formName}"
></iframe>`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(embedCode);
    setCopied(true);
    toast({ title: "Embed code copied!" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Embed Form
          </DialogTitle>
          <DialogDescription>
            Copy the code below to embed "{formName}" on your website
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width</Label>
              <Input
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="100% or 500px"
              />
            </div>
            <div className="space-y-2">
              <Label>Height (px)</Label>
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="600"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Embed Code</Label>
            <Textarea
              value={embedCode}
              readOnly
              className="font-mono text-sm h-32"
            />
          </div>

          <Button onClick={handleCopy} className="w-full">
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copy Embed Code
              </>
            )}
          </Button>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Paste this code in your website's HTML where you want the form to appear</p>
            <p>• Submissions will be recorded and viewable in the Forms module</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
