import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  Home,
  ArrowRight,
  Loader2,
  Search,
} from "lucide-react";
import { HRFolder } from "@/hooks/useHRDocuments";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface MoveItem {
  id: string;
  type: "folder" | "document";
  name: string;
  parentId: string | null; // current parent folder id (or null for root folders)
}

interface MoveItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MoveItem[];
  folders: HRFolder[];
  /** Move handler — destinationId null means root (only valid when all items are folders). */
  onMove: (destinationId: string | null) => Promise<void>;
  /** Create a new folder, returns the new folder id when successful. */
  onCreateFolder: (name: string, parentId: string | null) => Promise<string | null>;
}

/**
 * Build a set of folder IDs that are descendants of (or equal to) any of the
 * given source folder IDs. Used to forbid moving a folder into itself or a child.
 */
function buildForbiddenSet(sourceFolderIds: string[], folders: HRFolder[]): Set<string> {
  const forbidden = new Set<string>(sourceFolderIds);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parent_id && forbidden.has(f.parent_id) && !forbidden.has(f.id)) {
        forbidden.add(f.id);
        added = true;
      }
    }
  }
  return forbidden;
}

function buildPath(folderId: string | null, folders: HRFolder[]): string {
  if (!folderId) return "Root";
  const segments: string[] = [];
  let current = folders.find((f) => f.id === folderId);
  let safety = 0;
  while (current && safety < 50) {
    segments.unshift(current.name);
    current = current.parent_id ? folders.find((f) => f.id === current!.parent_id) : undefined;
    safety++;
  }
  return "Root / " + segments.join(" / ");
}

interface FolderNodeProps {
  folder: HRFolder;
  folders: HRFolder[];
  forbidden: Set<string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  depth: number;
  searchQuery: string;
}

function FolderNode({
  folder,
  folders,
  forbidden,
  selectedId,
  onSelect,
  expanded,
  toggleExpand,
  depth,
  searchQuery,
}: FolderNodeProps) {
  const children = folders.filter((f) => f.parent_id === folder.id);
  const isExpanded = expanded.has(folder.id);
  const isForbidden = forbidden.has(folder.id);
  const isSelected = selectedId === folder.id;

  const matchesSearch = !searchQuery
    ? true
    : folder.name.toLowerCase().includes(searchQuery.toLowerCase());

  // If searching, show this node only if it matches OR has matching descendants
  const hasMatchingDescendant = useMemo(() => {
    if (!searchQuery) return false;
    const stack = [...children];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.name.toLowerCase().includes(searchQuery.toLowerCase())) return true;
      stack.push(...folders.filter((f) => f.parent_id === node.id));
    }
    return false;
  }, [searchQuery, children, folders]);

  if (searchQuery && !matchesSearch && !hasMatchingDescendant) return null;

  // Auto-expand when searching with descendant matches
  const effectivelyExpanded = isExpanded || (Boolean(searchQuery) && hasMatchingDescendant);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors",
          isForbidden
            ? "opacity-40 cursor-not-allowed"
            : isSelected
            ? "bg-primary/15 text-primary font-medium"
            : "hover:bg-muted"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isForbidden) return;
          onSelect(folder.id);
        }}
      >
        {children.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(folder.id);
            }}
            className="p-0.5 hover:bg-muted-foreground/10 rounded"
          >
            {effectivelyExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-[18px]" />
        )}
        {effectivelyExpanded ? (
          <FolderOpen className="h-4 w-4 text-primary/70 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-primary/70 shrink-0" />
        )}
        <span className="truncate">{folder.name}</span>
        {isForbidden && (
          <span className="ml-auto text-[10px] text-muted-foreground italic">unavailable</span>
        )}
      </div>
      {effectivelyExpanded && children.length > 0 && (
        <div>
          {children
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((child) => (
              <FolderNode
                key={child.id}
                folder={child}
                folders={folders}
                forbidden={forbidden}
                selectedId={selectedId}
                onSelect={onSelect}
                expanded={expanded}
                toggleExpand={toggleExpand}
                depth={depth + 1}
                searchQuery={searchQuery}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export function MoveItemsDialog({
  open,
  onOpenChange,
  items,
  folders,
  onMove,
  onCreateFolder,
}: MoveItemsDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [moving, setMoving] = useState(false);

  // New folder inline UI
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setExpanded(new Set());
      setSearchQuery("");
      setShowNewFolderInput(false);
      setNewFolderName("");
    }
  }, [open]);

  const sourceFolderIds = useMemo(
    () => items.filter((i) => i.type === "folder").map((i) => i.id),
    [items]
  );

  const forbidden = useMemo(
    () => buildForbiddenSet(sourceFolderIds, folders),
    [sourceFolderIds, folders]
  );

  const sourceParentIds = useMemo(
    () => new Set(items.map((i) => i.parentId)),
    [items]
  );

  const allItemsAreFolders = items.length > 0 && items.every((i) => i.type === "folder");
  const hasDocuments = items.some((i) => i.type === "document");

  // Root folders for tree
  const rootFolders = useMemo(
    () =>
      folders
        .filter((f) => !f.parent_id)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders]
  );

  const sourcePath = useMemo(() => {
    if (items.length === 0) return "";
    if (items.length === 1) return buildPath(items[0].parentId, folders);
    // Multiple — show common parent if all share the same parent
    const parents = new Set(items.map((i) => i.parentId));
    if (parents.size === 1) return buildPath(items[0].parentId, folders);
    return "Multiple locations";
  }, [items, folders]);

  const destinationPath = useMemo(
    () => buildPath(selectedId, folders),
    [selectedId, folders]
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSelectRoot = allItemsAreFolders;

  const isSameLocation =
    sourceParentIds.size === 1 && sourceParentIds.has(selectedId);

  const canConfirm =
    !moving &&
    items.length > 0 &&
    (selectedId !== null || canSelectRoot) &&
    !(hasDocuments && selectedId === null) &&
    !isSameLocation;

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    try {
      const newId = await onCreateFolder(name, selectedId);
      if (newId) {
        setSelectedId(newId);
        // Expand parent so the new folder is visible
        if (selectedId) {
          setExpanded((prev) => new Set(prev).add(selectedId));
        }
        setShowNewFolderInput(false);
        setNewFolderName("");
      }
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    if (hasDocuments && selectedId === null) {
      toast.error("Documents must be moved into a folder");
      return;
    }
    setMoving(true);
    try {
      await onMove(selectedId);
      onOpenChange(false);
    } catch {
      // toast handled by hook
    } finally {
      setMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !moving && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Move {items.length} item{items.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Choose a destination folder, or create a new one.
          </DialogDescription>
        </DialogHeader>

        {/* Items being moved */}
        <div className="rounded-md border bg-muted/30 px-3 py-2 max-h-24 overflow-y-auto">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Moving
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.slice(0, 8).map((it) => (
              <span
                key={`${it.type}-${it.id}`}
                className="text-xs bg-background border rounded px-2 py-0.5 inline-flex items-center gap-1 max-w-[200px]"
              >
                {it.type === "folder" ? (
                  <Folder className="h-3 w-3 text-primary/70 shrink-0" />
                ) : (
                  <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className="truncate">{it.name}</span>
              </span>
            ))}
            {items.length > 8 && (
              <span className="text-xs text-muted-foreground self-center">
                +{items.length - 8} more
              </span>
            )}
          </div>
        </div>

        {/* Source / destination preview */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-center text-xs bg-muted/30 rounded-md px-3 py-2 border">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">From</p>
            <p className="truncate font-medium" title={sourcePath}>{sourcePath}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">To</p>
            <p className="truncate font-medium text-primary" title={destinationPath}>
              {destinationPath}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {/* Folder tree */}
        <ScrollArea className="h-64 border rounded-md p-1">
          {/* Root option (for folders only) */}
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 rounded-md text-sm transition-colors",
              !canSelectRoot
                ? "opacity-40 cursor-not-allowed"
                : selectedId === null
                ? "bg-primary/15 text-primary font-medium cursor-pointer"
                : "hover:bg-muted cursor-pointer"
            )}
            onClick={() => canSelectRoot && setSelectedId(null)}
            title={!canSelectRoot ? "Documents cannot be placed at the root" : undefined}
          >
            <span className="w-[18px]" />
            <Home className="h-4 w-4 text-primary/70 shrink-0" />
            <span>Root</span>
            {!canSelectRoot && (
              <span className="ml-auto text-[10px] text-muted-foreground italic">
                folders only
              </span>
            )}
          </div>
          {rootFolders.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-6">
              No folders available
            </p>
          ) : (
            rootFolders.map((f) => (
              <FolderNode
                key={f.id}
                folder={f}
                folders={folders}
                forbidden={forbidden}
                selectedId={selectedId}
                onSelect={setSelectedId}
                expanded={expanded}
                toggleExpand={toggleExpand}
                depth={0}
                searchQuery={searchQuery}
              />
            ))
          )}
        </ScrollArea>

        {/* Create new folder */}
        {showNewFolderInput ? (
          <div className="flex items-center gap-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") {
                  setShowNewFolderInput(false);
                  setNewFolderName("");
                }
              }}
              className="h-9"
            />
            <Button
              size="sm"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || creatingFolder}
            >
              {creatingFolder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowNewFolderInput(false);
                setNewFolderName("");
              }}
              disabled={creatingFolder}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowNewFolderInput(true)}
            className="self-start"
          >
            <FolderPlus className="h-4 w-4 mr-1.5" />
            New folder {selectedId ? "in selection" : "at root"}
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={moving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            {moving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Moving...
              </>
            ) : (
              "Move here"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}