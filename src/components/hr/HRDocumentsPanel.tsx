import { useState, useMemo } from "react";
import { useHRDocuments, HRFolder, HRDocument } from "@/hooks/useHRDocuments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FolderPlus,
  Upload,
  Folder,
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  ArrowLeft,
  FolderOpen,
  Eye,
  ArrowRightLeft,
  Search,
  FileIcon,
  ShieldCheck,
  Users,
  Building,
} from "lucide-react";
import { DocumentViewer } from "./DocumentViewer";
import { format } from "date-fns";

const FOLDER_TYPES = [
  { value: "hr_policies", label: "HR Policies", icon: ShieldCheck },
  { value: "employee_documents", label: "Employee Documents", icon: Users },
  { value: "internal_hr", label: "Internal HR Docs", icon: Building },
  { value: "employee_personal", label: "Employee Folder", icon: Folder },
];

export function HRDocumentsPanel() {
  const {
    folders,
    documents,
    loading,
    isHROrAdmin,
    createFolder,
    renameFolder,
    deleteFolder,
    uploadDocument,
    deleteDocument,
    renameDocument,
    moveDocument,
    getSignedUrl,
    fetchDocuments,
  } = useHRDocuments();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderType, setNewFolderType] = useState("hr_policies");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState("");

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; type: "folder" | "document" } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string>("");

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState("");

  // Navigation
  const currentFolders = useMemo(() => {
    let filtered = folders.filter((f) =>
      currentFolderId ? f.parent_id === currentFolderId : !f.parent_id
    );
    if (searchQuery) {
      filtered = filtered.filter((f) =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  }, [folders, currentFolderId, searchQuery]);

  const currentDocuments = useMemo(() => {
    if (!currentFolderId) return [];
    let filtered = documents.filter((d) => d.folder_id === currentFolderId);
    if (searchQuery) {
      filtered = filtered.filter((d) =>
        d.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  }, [documents, currentFolderId, searchQuery]);

  const currentFolder = folders.find((f) => f.id === currentFolderId);

  const breadcrumbs = useMemo(() => {
    const crumbs: HRFolder[] = [];
    let folder = currentFolder;
    while (folder) {
      crumbs.unshift(folder);
      folder = folders.find((f) => f.id === folder!.parent_id);
    }
    return crumbs;
  }, [currentFolder, folders]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim(), currentFolderId, newFolderType);
    setNewFolderName("");
    setNewFolderType("hr_policies");
    setCreateFolderOpen(false);
  };

  const handleUpload = async () => {
    if (!uploadFile || !currentFolderId) return;
    await uploadDocument(currentFolderId, uploadFile, uploadDescription);
    setUploadFile(null);
    setUploadDescription("");
    setUploadOpen(false);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    if (renameTarget.type === "folder") {
      await renameFolder(renameTarget.id, renameValue.trim());
    } else {
      await renameDocument(renameTarget.id, renameValue.trim());
    }
    setRenameTarget(null);
    setRenameValue("");
    setRenameOpen(false);
  };

  const handleMove = async () => {
    if (!moveDocId || !moveFolderId) return;
    await moveDocument(moveDocId, moveFolderId);
    setMoveDocId(null);
    setMoveFolderId("");
    setMoveOpen(false);
  };

  const handleViewDocument = async (doc: HRDocument) => {
    const url = await getSignedUrl(doc.file_url);
    if (url) {
      setViewerUrl(url);
      setViewerName(doc.name);
      setViewerOpen(true);
    }
  };

  const getFolderTypeIcon = (type: string) => {
    const ft = FOLDER_TYPES.find((t) => t.value === type);
    return ft ? ft.icon : Folder;
  };

  const getFolderTypeLabel = (type: string) => {
    const ft = FOLDER_TYPES.find((t) => t.value === type);
    return ft ? ft.label : type;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-muted rounded animate-pulse" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {currentFolderId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCurrentFolderId(currentFolder?.parent_id || null);
                setSearchQuery("");
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <button
              className="hover:text-foreground transition-colors font-medium"
              onClick={() => {
                setCurrentFolderId(null);
                setSearchQuery("");
              }}
            >
              Root
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.id} className="flex items-center gap-1">
                <span>/</span>
                <button
                  className="hover:text-foreground transition-colors"
                  onClick={() => setCurrentFolderId(crumb.id)}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {isHROrAdmin && (
            <>
              <Button size="sm" variant="outline" onClick={() => setCreateFolderOpen(true)}>
                <FolderPlus className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Folder</span>
              </Button>
              {currentFolderId && (
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Upload</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Folders Grid */}
      {currentFolders.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Folders</h3>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {currentFolders.map((folder) => {
              const Icon = getFolderTypeIcon(folder.folder_type);
              return (
                <Card
                  key={folder.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors group"
                  onClick={() => {
                    setCurrentFolderId(folder.id);
                    fetchDocuments(folder.id);
                    setSearchQuery("");
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{folder.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {getFolderTypeLabel(folder.folder_type)}
                      </p>
                    </div>
                    {isHROrAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameTarget({ id: folder.id, name: folder.name, type: "folder" });
                              setRenameValue(folder.name);
                              setRenameOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(`Delete folder "${folder.name}" and all its contents?`)) {
                                deleteFolder(folder.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents List */}
      {currentFolderId && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">
            Documents ({currentDocuments.length})
          </h3>
          {currentDocuments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No documents in this folder</p>
              {isHROrAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-1" /> Upload Document
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {currentDocuments.map((doc) => (
                <Card key={doc.id} className="group">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="p-2 rounded bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-sm">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.file_size)} · {doc.uploaded_by_name} · {format(new Date(doc.created_at), "dd MMM yyyy")}
                      </p>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleViewDocument(doc)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isHROrAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setRenameTarget({ id: doc.id, name: doc.name, type: "document" });
                                setRenameValue(doc.name);
                                setRenameOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setMoveDocId(doc.id);
                                setMoveFolderId("");
                                setMoveOpen(true);
                              }}
                            >
                              <ArrowRightLeft className="h-4 w-4 mr-2" /> Move
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                if (confirm(`Delete "${doc.name}"?`)) {
                                  deleteDocument(doc.id, doc.file_url);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state for root */}
      {!currentFolderId && currentFolders.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium mb-1">No folders yet</p>
          {isHROrAdmin ? (
            <p className="text-sm">Create your first folder to start organizing HR documents.</p>
          ) : (
            <p className="text-sm">No documents have been shared with you yet.</p>
          )}
        </div>
      )}

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Folder Name</label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="e.g., Leave Policy"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Folder Type</label>
              <Select value={newFolderType} onValueChange={setNewFolderType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOLDER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">File</label>
              <Input
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="Brief description of this document..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!uploadFile}>
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {renameTarget?.type === "folder" ? "Folder" : "Document"}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Document</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium">Select destination folder</label>
            <Select value={moveFolderId} onValueChange={setMoveFolderId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose folder..." />
              </SelectTrigger>
              <SelectContent>
                {folders.map((folder) => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMove} disabled={!moveFolderId}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer */}
      <DocumentViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        url={viewerUrl}
        name={viewerName}
      />
    </div>
  );
}
