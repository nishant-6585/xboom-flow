import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";
import { Download, Copy, ExternalLink, Palette } from "lucide-react";
import { toast } from "sonner";
import xboomLogo from "@/assets/xboom-logo-icon.jpeg";
import { cn } from "@/lib/utils";

interface FormQRCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
}

const COLOR_PRESETS = [
  { name: "Classic", fg: "#000000", bg: "#ffffff" },
  { name: "Xboom Orange", fg: "#ea580c", bg: "#ffffff" },
  { name: "Dark Orange", fg: "#ea580c", bg: "#18181b" },
  { name: "Navy", fg: "#1e3a5f", bg: "#ffffff" },
  { name: "Emerald", fg: "#047857", bg: "#ffffff" },
  { name: "Purple", fg: "#7c3aed", bg: "#ffffff" },
];

export function FormQRCodeDialog({ open, onOpenChange, formId, formName }: FormQRCodeDialogProps) {
  const formUrl = `${window.location.origin}/form-embed/${formId}`;
  const [fgColor, setFgColor] = useState("#ea580c");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [showLogo, setShowLogo] = useState(true);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(formUrl);
    toast.success("URL copied to clipboard!");
  };

  const handleDownloadQR = () => {
    const container = document.getElementById("qr-container");
    if (!container) return;

    // Create a canvas to combine QR and logo
    const canvas = document.createElement("canvas");
    const size = 250;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get the SVG
    const svg = container.querySelector("svg");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const qrImg = new Image();
    qrImg.onload = () => {
      ctx.drawImage(qrImg, 0, 0, size, size);
      URL.revokeObjectURL(svgUrl);

      if (showLogo) {
        const logoImg = new Image();
        logoImg.crossOrigin = "anonymous";
        logoImg.onload = () => {
          const logoSize = size * 0.22;
          const logoX = (size - logoSize) / 2;
          const logoY = (size - logoSize) / 2;
          
          // Draw white circle background
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, logoSize / 2 + 4, 0, Math.PI * 2);
          ctx.fillStyle = bgColor;
          ctx.fill();
          
          // Draw logo
          ctx.save();
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, logoSize / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
          ctx.restore();

          downloadCanvas(canvas);
        };
        logoImg.src = xboomLogo;
      } else {
        downloadCanvas(canvas);
      }
    };
    qrImg.src = svgUrl;
  };

  const downloadCanvas = (canvas: HTMLCanvasElement) => {
    const pngFile = canvas.toDataURL("image/png");
    const downloadLink = document.createElement("a");
    downloadLink.download = `${formName.replace(/\s+/g, "-").toLowerCase()}-qrcode.png`;
    downloadLink.href = pngFile;
    downloadLink.click();
    toast.success("QR code downloaded!");
  };

  const handleOpenForm = () => {
    window.open(formUrl, "_blank");
  };

  const applyPreset = (preset: typeof COLOR_PRESETS[0]) => {
    setFgColor(preset.fg);
    setBgColor(preset.bg);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">QR Code for {formName}</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-5 py-4">
          {/* QR Code with Logo */}
          <div 
            id="qr-container"
            className="relative p-4 rounded-xl shadow-sm border"
            style={{ backgroundColor: bgColor }}
          >
            <QRCodeSVG
              value={formUrl}
              size={200}
              level="H"
              includeMargin={true}
              bgColor={bgColor}
              fgColor={fgColor}
            />
            {showLogo && (
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div 
                  className="rounded-full p-1 shadow-sm"
                  style={{ backgroundColor: bgColor }}
                >
                  <img 
                    src={xboomLogo} 
                    alt="Xboom Logo" 
                    className="h-11 w-11 rounded-full object-cover"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Color Customization */}
          <div className="w-full space-y-3">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Color Theme</Label>
            </div>
            
            {/* Presets */}
            <div className="grid grid-cols-3 gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border-2 transition-all text-left",
                    fgColor === preset.fg && bgColor === preset.bg
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/50 hover:bg-muted"
                  )}
                >
                  <div 
                    className="h-5 w-5 rounded-full border shrink-0"
                    style={{ 
                      background: `linear-gradient(135deg, ${preset.fg} 50%, ${preset.bg} 50%)`,
                      borderColor: preset.bg === "#ffffff" ? "#e5e7eb" : preset.bg
                    }}
                  />
                  <span className="text-xs font-medium truncate">{preset.name}</span>
                </button>
              ))}
            </div>

            {/* Custom Colors */}
            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">QR Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer"
                  />
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1">{fgColor}</code>
                </div>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">Background</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-8 w-10 rounded border cursor-pointer"
                  />
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1">{bgColor}</code>
                </div>
              </div>
            </div>

            {/* Logo Toggle */}
            <label className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer">
              <span className="text-sm font-medium">Show Xboom Logo</span>
              <input
                type="checkbox"
                checked={showLogo}
                onChange={(e) => setShowLogo(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            </label>
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
