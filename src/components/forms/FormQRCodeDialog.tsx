import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { Download, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface FormQRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
}

export function FormQRCodeDialog({ open, onOpenChange, formId, formName }: FormQRCodeDialogProps) {
  const formUrl = `${window.location.origin}/form-embed/${formId}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(formUrl);
    toast.success("URL copied to clipboard!");
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById("form-qr-code");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      
      const downloadLink = document.createElement("a");
      downloadLink.download = `${formName.replace(/\s+/g, "-").toLowerCase()}-qrcode.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
      
      toast.success("QR code downloaded!");
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleOpenForm = () => {
    window.open(formUrl, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">QR Code for {formName}</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-6 py-4">
          {/* QR Code */}
          <div className="p-4 bg-white rounded-xl shadow-sm border">
            <QRCodeSVG
              id="form-qr-code"
              value={formUrl}
              size={200}
              level="H"
              includeMargin={true}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          {/* URL Display */}
          <div className="w-full">
            <p className="text-xs text-muted-foreground text-center mb-2">Form URL</p>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <code className="text-xs flex-1 truncate">{formUrl}</code>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopyUrl}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 w-full">
            <Button variant="outline" className="flex-1" onClick={handleDownloadQR}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleOpenForm}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Form
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
