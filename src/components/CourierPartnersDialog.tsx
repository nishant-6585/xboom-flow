import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, Pencil, X, Check, Truck } from 'lucide-react';
import { useCourierPartners, CourierPartner } from '@/hooks/useCourierPartners';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}

export function CourierPartnersDialog({ open, onOpenChange, canManage }: Props) {
  const { partners, loading, createPartner, updatePartner, deletePartner } = useCourierPartners();
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const startEdit = (p: CourierPartner) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditUrl(p.tracking_url || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditUrl('');
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const ok = await createPartner({ name: newName, tracking_url: newUrl });
    setCreating(false);
    if (ok) {
      setNewName('');
      setNewUrl('');
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const ok = await updatePartner(editingId, { name: editName, tracking_url: editUrl });
    if (ok) cancelEdit();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Courier Partners
          </DialogTitle>
          <DialogDescription>
            Courier providers available in the order tracking dropdown. Add or update couriers here so changes
            reflect everywhere in the workflow.
          </DialogDescription>
        </DialogHeader>

        {canManage && (
          <div className="border rounded-md p-4 space-y-3 bg-muted/30">
            <h4 className="text-sm font-medium">Add Courier</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="courier-name">Name *</Label>
                <Input
                  id="courier-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Blue Dart"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="courier-url">Tracking Page URL</Label>
                <Input
                  id="courier-url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://courier.com/track"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleCreate} disabled={creating || !newName.trim()} size="sm">
                {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                Add Courier
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {partners.length} courier{partners.length === 1 ? '' : 's'}
          </h4>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="border rounded-md divide-y">
              {partners.map((p) => {
                const isEditing = editingId === p.id;
                return (
                  <div key={p.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    {isEditing ? (
                      <>
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="sm:w-48" />
                        <Input
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          placeholder="Tracking URL"
                          className="flex-1"
                        />
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={handleSaveEdit} title="Save">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={cancelEdit} title="Cancel">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          {p.tracking_url ? (
                            <a
                              href={p.tracking_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted-foreground hover:underline truncate block"
                            >
                              {p.tracking_url}
                            </a>
                          ) : (
                            <div className="text-xs text-muted-foreground italic">No tracking URL</div>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 text-xs">
                              <Switch
                                checked={p.is_active}
                                onCheckedChange={(v) => updatePartner(p.id, { is_active: v })}
                              />
                              <span className="text-muted-foreground">{p.is_active ? 'Active' : 'Inactive'}</span>
                            </div>
                            <Button size="icon" variant="ghost" onClick={() => startEdit(p)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(`Remove courier "${p.name}"?`)) deletePartner(p.id);
                              }}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              {partners.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No courier partners yet.</div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}