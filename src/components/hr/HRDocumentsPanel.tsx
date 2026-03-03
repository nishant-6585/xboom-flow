import { useState, useMemo, useEffect } from "react";
import { useHRDocuments, HRFolder, HRDocument, ShareRule } from "@/hooks/useHRDocuments";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
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
  Share2,
  Lock,
  Globe,
} from "lucide-react";
import { DocumentViewer } from "./DocumentViewer";
import { SharingPanel, getVisibilityLabel } from "./SharingPanel";
import { format } from "date-fns";

const FOLDER_TYPES = [
  { value: "hr_policies", label: "HR Policies", icon: ShieldCheck },
  { value: "employee_documents", label: "Employee Documents", icon: Users },
  { value: "internal_hr", label: "Internal HR Docs", icon: Building },
  { value: "employee_personal", label: "Employee Folder", icon: Folder },
];

type ShareTarget = { type: "folder" | "document"; id: string; name: string };

export function HRDocumentsPanel() {
  const { user, roles } = useAuth();
  const currentUserId = user?.id;
  const isAdmin = roles.includes('admin');
  const {
    folders,
    documents,
    loading,
    isHROrAdmin,
    employees,
    departments,
    createFolder,
    renameFolder,
    deleteFolder,
    uploadDocument,
    deleteDocument,
    renameDocument,
    moveDocument,
    getSignedUrl,
    fetchDocuments,
    fetchFolderShares,
    fetchDocumentShares,
    updateFolderShares,
    updateDocumentShares,
  } = useHRDocuments();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Dialog states
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderType, setNewFolderType] = useState("hr_policies");
  const [newFolderShares, setNewFolderShares] = useState<Omit<ShareRule, "id" | "created_by" | "created_at">[]>([]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadShares, setUploadShares] = useState<Omit<ShareRule, "id" | "created_by" | "created_at">[]>([]);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; type: "folder" | "document" } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string>("");

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerName, setViewerName] = useState("");
  const [viewerFileType, setViewerFileType] = useState<string | null>(null);

  // Sharing dialog
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [shareRules, setShareRules] = useState<Omit<ShareRule, "id" | "created_by" | "created_at">[]>([]);
  const [shareLoading, setShareLoading] = useState(false);

  // Folder share cache for display
  const [folderSharesCache, setFolderSharesCache] = useState<Record<string, Omit<ShareRule, "id" | "created_by" | "created_at">[]>>({});
  const [docSharesCache, setDocSharesCache] = useState<Record<string, Omit<ShareRule, "id" | "created_by" | "created_at">[]>>({});

  // Load shares for visible folders/docs
  useEffect(() => {
    if (!isHROrAdmin) return;
    const loadFolderShares = async () => {
      const cache: typeof folderSharesCache = {};
      for (const folder of folders) {
        const shares = await fetchFolderShares(folder.id);
        cache[folder.id] = shares;
      }
      setFolderSharesCache(cache);
    };
    if (folders.length > 0) loadFolderShares();
  }, [folders, isHROrAdmin]);

  useEffect(() => {
    if (!isHROrAdmin || !currentFolderId) return;
    const loadDocShares = async () => {
      const docsInFolder = documents.filter(d => d.folder_id === currentFolderId);
      const cache: typeof docSharesCache = {};
      for (const doc of docsInFolder) {
        const shares = await fetchDocumentShares(doc.id);
        cache[doc.id] = shares;
      }
      setDocSharesCache(prev => ({ ...prev, ...cache }));
    };
    loadDocShares();
  }, [documents, currentFolderId, isHROrAdmin]);

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
    // If shares were set, apply them after folder creation
    // We need the folder ID which we don't have yet, so we apply after refresh
    setNewFolderName("");
    setNewFolderType("hr_policies");
    setNewFolderShares([]);
    setCreateFolderOpen(false);
  };

  const handleUpload = async () => {
    if (!uploadFile || !currentFolderId) return;
    await uploadDocument(currentFolderId, uploadFile, uploadDescription);
    setUploadFile(null);
    setUploadDescription("");
    setUploadShares([]);
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
      setViewerFileType(doc.file_type);
      setViewerOpen(true);
    }
  };

  const openShareDialog = async (target: ShareTarget) => {
    setShareTarget(target);
    setShareLoading(true);
    setShareOpen(true);
    try {
      const shares = target.type === "folder"
        ? await fetchFolderShares(target.id)
        : await fetchDocumentShares(target.id);
      setShareRules(shares.map(({ share_type, department, employee_id }) => ({
        share_type, department, employee_id,
      })));
    } catch {
      setShareRules([]);
    }
    setShareLoading(false);
  };

  const handleSaveSharing = async () => {
    if (!shareTarget) return;
    setShareLoading(true);
    if (shareTarget.type === "folder") {
      await updateFolderShares(shareTarget.id, shareRules);
      // Refresh cache
      const shares = await fetchFolderShares(shareTarget.id);
      setFolderSharesCache(prev => ({ ...prev, [shareTarget.id]: shares }));
    } else {
      await updateDocumentShares(shareTarget.id, shareRules);
      const shares = await fetchDocumentShares(shareTarget.id);
      setDocSharesCache(prev => ({ ...prev, [shareTarget.id]: shares }));
    }
    setShareLoading(false);
    setShareOpen(false);
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

  const renderVisibilityBadge = (id: string, type: "folder" | "document", visibility: string) => {
    if (!isHROrAdmin) return null;
    const shares = type === "folder" ? folderSharesCache[id] : docSharesCache[id];
    const label = getVisibilityLabel(shares || [], visibility);
    const isPrivate = visibility === "private" || !shares || shares.length === 0;
    return (
      <Badge
        variant="outline"
        className={`text-[10px] gap-0.5 ${isPrivate ? "text-muted-foreground" : "text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-400 dark:border-emerald-700 dark:bg-emerald-950"}`}
      >
        {isPrivate ? <Lock className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
        {label}
      </Badge>
    );
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {getFolderTypeLabel(folder.folder_type)}
                        </p>
                        {renderVisibilityBadge(folder.id, "folder", folder.visibility)}
                      </div>
                    </div>
                    {isHROrAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {(currentUserId === folder.created_by || isAdmin) && (
                            <DropdownMenuItem
                              onClick={() => openShareDialog({ type: "folder", id: folder.id, name: folder.name })}
                            >
                              <Share2 className="h-4 w-4 mr-2" /> Sharing
                            </DropdownMenuItem>
                          )}
                          {(currentUserId === folder.created_by || isAdmin) && <DropdownMenuSeparator />}
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(doc.file_size)} · {doc.uploaded_by_name} · {format(new Date(doc.created_at), "dd MMM yyyy")}
                        </p>
                        {renderVisibilityBadge(doc.id, "document", doc.visibility)}
                      </div>
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
                            {(currentUserId === doc.uploaded_by || isAdmin) && (
                              <DropdownMenuItem
                                onClick={() => openShareDialog({ type: "document", id: doc.id, name: doc.name })}
                              >
                                <Share2 className="h-4 w-4 mr-2" /> Sharing
                              </DropdownMenuItem>
                            )}
                            {(currentUserId === doc.uploaded_by || isAdmin) && <DropdownMenuSeparator />}
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
        <DialogContent className="max-w-lg">
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
            <SharingPanel
              shares={newFolderShares}
              onChange={setNewFolderShares}
              employees={employees}
              departments={departments}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={async () => {
              if (!newFolderName.trim()) return;
              await createFolder(newFolderName.trim(), currentFolderId, newFolderType);
              // Apply shares to newly created folder (latest folder with that name)
              if (newFolderShares.length > 0) {
                // Small delay then refresh to get the new folder
                setTimeout(async () => {
                  const { data } = await (await import('@/integrations/supabase/client')).supabase
                    .from('hr_folders')
                    .select('id')
                    .eq('name', newFolderName.trim())
                    .order('created_at', { ascending: false })
                    .limit(1);
                  if (data?.[0]) {
                    await updateFolderShares(data[0].id, newFolderShares);
                  }
                }, 500);
              }
              setNewFolderName("");
              setNewFolderType("hr_policies");
              setNewFolderShares([]);
              setCreateFolderOpen(false);
            }} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
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
            <SharingPanel
              shares={uploadShares}
              onChange={setUploadShares}
              employees={employees}
              departments={departments}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button onClick={async () => {
              if (!uploadFile || !currentFolderId) return;
              await uploadDocument(currentFolderId, uploadFile, uploadDescription);
              // Apply shares to newly uploaded document
              if (uploadShares.length > 0) {
                setTimeout(async () => {
                  const { data } = await (await import('@/integrations/supabase/client')).supabase
                    .from('hr_documents')
                    .select('id')
                    .eq('folder_id', currentFolderId)
                    .eq('name', uploadFile.name)
                    .order('created_at', { ascending: false })
                    .limit(1);
                  if (data?.[0]) {
                    await updateDocumentShares(data[0].id, uploadShares);
                  }
                }, 500);
              }
              setUploadFile(null);
              setUploadDescription("");
              setUploadShares([]);
              setUploadOpen(false);
            }} disabled={!uploadFile}>
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sharing Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Sharing: {shareTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {shareLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : (
            <SharingPanel
              shares={shareRules}
              onChange={setShareRules}
              employees={employees}
              departments={departments}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSharing} disabled={shareLoading}>
              Save Sharing
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
        fileType={viewerFileType}
      />
    </div>
  );
}
