import { useMemo, useRef, useState } from "react";
import { useProcessDocuments, type ProcessDocument } from "@/hooks/useProcessDocuments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookMarked, Upload, Download, Eye, MoreVertical, Pencil, Trash2, RefreshCw, FileText, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { validateFile } from "@/lib/fileValidation";

const PRESET_CATEGORIES = [
  "General",
  "Onboarding",
  "Offboarding",
  "HR Policies",
  "Payroll",
  "Sales",
  "Operations",
  "Finance",
  "IT",
  "Security",
];

function formatSize(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface Props {
  canManage: boolean;
}

export function ProcessDocumentsPanel({ canManage }: Props) {
  const { documents, loading, upload, replaceFile, updateMetadata, remove, getSignedUrl } =
    useProcessDocuments();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  const visibleCategories = useMemo(() => {
    const set = new Set<string>(PRESET_CATEGORIES);
    documents.forEach((d) => set.add(d.category));
    return Array.from(set);
  }, [documents]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
      if (!s) return true;
      return (
        d.title.toLowerCase().includes(s) ||
        (d.description || "").toLowerCase().includes(s) ||
        d.file_name.toLowerCase().includes(s) ||
        d.category.toLowerCase().includes(s)
      );
    });
  }, [documents, search, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ProcessDocument[]>();
    filtered.forEach((d) => {
      const list = map.get(d.category) || [];
      list.push(d);
      map.set(d.category, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  async function openInNewTab(doc: ProcessDocument) {
    try {
      const url = await getSignedUrl(doc.file_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error("Unable to preview", { description: e?.message });
    }
  }

  async function download(doc: ProcessDocument) {
    try {
      const url = await getSignedUrl(doc.file_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e: any) {
      toast.error("Unable to download", { description: e?.message });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BookMarked className="h-5 w-5" />
            Implementation Process Documents
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Central library of SOPs, policies and process guides for the team.
          </p>
        </div>
        {canManage && (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </DialogTrigger>
            <UploadDialog
              onClose={() => setUploadOpen(false)}
              onUpload={upload}
              presetCategories={visibleCategories}
            />
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by title, description, file name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full md:w-[220px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {visibleCategories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading documents...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mb-3 opacity-50" />
            <p className="font-medium">No process documents found</p>
            <p className="text-sm">
              {canManage
                ? "Upload your first SOP, policy or process guide to get started."
                : "Process documents will appear here once HR uploads them."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([category, docs]) => (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{category}</Badge>
                  <span className="text-xs text-muted-foreground">{docs.length} document{docs.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {docs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      canManage={canManage}
                      onPreview={() => openInNewTab(doc)}
                      onDownload={() => download(doc)}
                      onReplace={(file) => replaceFile(doc, file)}
                      onUpdate={(patch) => updateMetadata(doc.id, patch)}
                      onDelete={() => remove(doc)}
                      categories={visibleCategories}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocCard({
  doc, canManage, onPreview, onDownload, onReplace, onUpdate, onDelete, categories,
}: {
  doc: ProcessDocument;
  canManage: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onReplace: (file: File) => Promise<void>;
  onUpdate: (patch: Partial<Pick<ProcessDocument, "title" | "description" | "category" | "is_active">>) => Promise<void>;
  onDelete: () => Promise<void>;
  categories: string[];
}) {
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleReplace(file: File) {
    const v = validateFile(file, "documents");
    if (!v.valid) {
      toast.error(v.error || "Invalid file");
      return;
    }
    setBusy(true);
    try {
      await onReplace(file);
      toast.success("New version uploaded");
    } catch (e: any) {
      toast.error("Failed to replace", { description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={`relative ${!doc.is_active ? "opacity-60" : ""}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-medium truncate" title={doc.title}>{doc.title}</h4>
            <p className="text-xs text-muted-foreground truncate" title={doc.file_name}>
              {doc.file_name}
            </p>
          </div>
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => replaceRef.current?.click()} disabled={busy}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Upload new version
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUpdate({ is_active: !doc.is_active })}>
                  {doc.is_active ? "Archive" : "Restore"}
                </DropdownMenuItem>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete &quot;{doc.title}&quot; and its file. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try { await onDelete(); toast.success("Document deleted"); }
                          catch (e: any) { toast.error("Failed to delete", { description: e?.message }); }
                        }}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {doc.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">{doc.description}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <Badge variant="outline">v{doc.version}</Badge>
          <span>{formatSize(doc.file_size)}</span>
          <span>·</span>
          <span>Updated {format(new Date(doc.updated_at), "dd MMM yyyy")}</span>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="flex-1" onClick={onPreview}>
            <Eye className="h-4 w-4 mr-1.5" /> Preview
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={onDownload}>
            <Download className="h-4 w-4 mr-1.5" /> Download
          </Button>
        </div>

        <input
          ref={replaceRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleReplace(f);
            if (replaceRef.current) replaceRef.current.value = "";
          }}
        />
      </CardContent>

      {editOpen && (
        <EditDialog
          doc={doc}
          categories={categories}
          onClose={() => setEditOpen(false)}
          onSave={async (patch) => {
            await onUpdate(patch);
            toast.success("Document updated");
            setEditOpen(false);
          }}
        />
      )}
    </Card>
  );
}

function UploadDialog({
  onClose, onUpload, presetCategories,
}: {
  onClose: () => void;
  onUpload: (input: { title: string; description?: string; category: string; file: File }) => Promise<void>;
  presetCategories: string[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [customCategory, setCustomCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const finalCategory = category === "__custom__" ? customCategory.trim() : category;

  async function handleSubmit() {
    if (!title.trim()) return toast.error("Title is required");
    if (!file) return toast.error("Please choose a file");
    if (!finalCategory) return toast.error("Please pick or enter a category");
    const v = validateFile(file, "documents");
    if (!v.valid) return toast.error(v.error || "Invalid file");

    setBusy(true);
    try {
      await onUpload({ title: title.trim(), description, category: finalCategory, file });
      toast.success("Document uploaded");
      onClose();
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Upload Process Document</DialogTitle>
        <DialogDescription>Share SOPs, policies and guides with the team.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Employee Onboarding SOP" />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {presetCategories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              <SelectItem value="__custom__">+ Add new category…</SelectItem>
            </SelectContent>
          </Select>
          {category === "__custom__" && (
            <Input
              placeholder="New category name"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
            />
          )}
        </div>
        <div className="space-y-2">
          <Label>Description (optional)</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        <div className="space-y-2">
          <Label>File</Label>
          <Input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <p className="text-xs text-muted-foreground">
            PDF, Word, Excel, PowerPoint, images. Max 20MB.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Upload
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EditDialog({
  doc, categories, onClose, onSave,
}: {
  doc: ProcessDocument;
  categories: string[];
  onClose: () => void;
  onSave: (patch: Partial<Pick<ProcessDocument, "title" | "description" | "category">>) => Promise<void>;
}) {
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description || "");
  const [category, setCategory] = useState(doc.category);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      await onSave({ title: title.trim(), description: description.trim() || null as any, category });
    } catch (e: any) {
      toast.error("Failed to save", { description: e?.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}