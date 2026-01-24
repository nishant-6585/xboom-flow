import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { QRCodeSVG } from "qrcode.react";
import { Download, Copy, ExternalLink, Check } from "lucide-react";
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
  { name: "Xboom", fg: "#ea580c", bg: "#ffffff" },
  { name: "Dark", fg: "#ea580c", bg: "#18181b" },
  { name: "Navy", fg: "#1e3a5f", bg: "#ffffff" },
  { name: "Emerald", fg: "#047857", bg: "#ffffff" },
  { name: "Purple", fg: "#7c3aed", bg: "#ffffff" },
];

export function FormQRCodeDialog({ open, onOpenChange, formId, formName }: FormQRCodeDialogProps) {
  const formUrl = `${window.location.origin}/form-embed/${formId}`;
  const [fgColor, setFgColor] = useState("#ea580c");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [showLogo, setShowLogo] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(formUrl);
    setCopied(true);
    toast.success("URL copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    const container = document.getElementById("qr-container");
    if (!container) return;

    const canvas = document.createElement("canvas");
    const size = 300;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
          
          ctx.beginPath();
          ctx.arc(size / 2, size / 2, logoSize / 2 + 6, 0, Math.PI * 2);
          ctx.fillStyle = bgColor;
          ctx.fill();
          
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

  const isPresetSelected = (preset: typeof COLOR_PRESETS[0]) => 
    fgColor === preset.fg && bgColor === preset.bg;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-primary/5 via-background to-primary/10">
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-lg font-semibold">{formName}</DialogTitle>
            <p className="text-sm text-muted-foreground">Customize and download your QR code</p>
          </DialogHeader>
          
          <div className="px-6 pb-6 space-y-6">
            {/* QR Code Preview */}
            <div className="flex justify-center">
              <div 
                id="qr-container"
                className="relative p-5 rounded-2xl shadow-lg border-2"
                style={{ backgroundColor: bgColor, borderColor: bgColor === "#ffffff" ? "#e5e7eb" : bgColor }}
              >
                <QRCodeSVG
                  value={formUrl}
                  size={180}
                  level="H"
                  includeMargin={true}
                  bgColor={bgColor}
                  fgColor={fgColor}
                />
                {showLogo && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div 
                      className="rounded-full p-1.5 shadow-md"
                      style={{ backgroundColor: bgColor }}
                    >
                      <img 
                        src={xboomLogo} 
                        alt="Xboom Logo" 
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Color Presets */}
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Color Theme
              </Label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-full border-2 transition-all text-sm font-medium",
                      isPresetSelected(preset)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted text-foreground"
                    )}
                  >
                    <div 
                      className="h-4 w-4 rounded-full border shadow-sm"
                      style={{ 
                        background: preset.bg === "#ffffff" 
                          ? `radial-gradient(circle at 30% 30%, ${preset.fg}, ${preset.fg})` 
                          : `linear-gradient(135deg, ${preset.fg} 50%, ${preset.bg} 50%)`,
                        borderColor: preset.bg === "#ffffff" ? "#e5e7eb" : preset.bg
                      }}
                    />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Colors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">QR Color</Label>
                <div className="flex items-center gap-2 p-2 bg-card rounded-lg border">
                  <input
                    type="color"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    className="h-8 w-8 rounded-lg border-0 cursor-pointer"
                  />
                  <code className="text-xs font-mono flex-1 text-muted-foreground">{fgColor}</code>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Background</Label>
                <div className="flex items-center gap-2 p-2 bg-card rounded-lg border">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-8 w-8 rounded-lg border-0 cursor-pointer"
                  />
                  <code className="text-xs font-mono flex-1 text-muted-foreground">{bgColor}</code>
                </div>
              </div>
            </div>

            {/* Logo Toggle */}
            <div className="flex items-center justify-between p-3 bg-card rounded-xl border">
              <div className="flex items-center gap-3">
                <img src={xboomLogo} alt="" className="h-8 w-8 rounded-full" />
                <div>
                  <p className="text-sm font-medium">Xboom Logo</p>
                  <p className="text-xs text-muted-foreground">Show in center</p>
                </div>
              </div>
              <Switch
                checked={showLogo}
                onCheckedChange={setShowLogo}
              />
            </div>

            {/* URL Display */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Form URL</Label>
              <div className="flex items-center gap-2 p-3 bg-card rounded-xl border">
                <code className="text-xs font-mono flex-1 truncate text-muted-foreground">{formUrl}</code>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-3 shrink-0" 
                  onClick={handleCopyUrl}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button onClick={handleDownloadQR} className="h-11">
                <Download className="h-4 w-4 mr-2" />
                Download PNG
              </Button>
              <Button variant="outline" onClick={handleOpenForm} className="h-11">
                <ExternalLink className="h-4 w-4 mr-2" />
                Preview Form
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
