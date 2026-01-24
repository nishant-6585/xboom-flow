import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useFormFields, FormField } from "@/hooks/useForms";
import { Plus, Trash2, ChevronUp, ChevronDown, X, Pencil, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'number', label: 'Number' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio' },
  { value: 'date', label: 'Date' },
];

interface FormBuilderProps {
  formId: string;
  canEdit?: boolean;
}

interface EditFieldState {
  field_type: FormField['field_type'];
  label: string;
  placeholder: string;
  is_required: boolean;
  options: { label: string; value: string }[];
}

export function FormBuilder({ formId, canEdit = true }: FormBuilderProps) {
  const { fields, createField, updateField, deleteField, isCreating } = useFormFields(formId);
  const [newField, setNewField] = useState({
    field_type: 'text' as FormField['field_type'],
    label: '',
    placeholder: '',
    is_required: false,
    options: [] as { label: string; value: string }[],
  });
  const [newOption, setNewOption] = useState('');
  
  // Edit state
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [editFieldState, setEditFieldState] = useState<EditFieldState | null>(null);
  const [editOption, setEditOption] = useState('');

  const needsOptions = ['dropdown', 'checkbox', 'radio'].includes(newField.field_type);
  const editNeedsOptions = editFieldState ? ['dropdown', 'checkbox', 'radio'].includes(editFieldState.field_type) : false;

  const handleAddField = () => {
    if (!newField.label.trim()) return;
    
    createField({
      form_id: formId,
      field_type: newField.field_type,
      label: newField.label,
      placeholder: newField.placeholder || undefined,
      is_required: newField.is_required,
      options: needsOptions ? newField.options : undefined,
      field_order: fields.length,
    });

    setNewField({
      field_type: 'text',
      label: '',
      placeholder: '',
      is_required: false,
      options: [],
    });
  };

  const handleAddOption = () => {
    if (!newOption.trim()) return;
    setNewField(prev => ({
      ...prev,
      options: [...prev.options, { label: newOption, value: newOption.toLowerCase().replace(/\s+/g, '_') }],
    }));
    setNewOption('');
  };

  const handleRemoveOption = (index: number) => {
    setNewField(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  };

  // Edit handlers
  const handleStartEdit = (field: FormField) => {
    setEditingField(field);
    setEditFieldState({
      field_type: field.field_type,
      label: field.label,
      placeholder: field.placeholder || '',
      is_required: field.is_required,
      options: field.options || [],
    });
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditFieldState(null);
    setEditOption('');
  };

  const handleSaveEdit = () => {
    if (!editingField || !editFieldState || !editFieldState.label.trim()) return;
    
    updateField({
      id: editingField.id,
      field_type: editFieldState.field_type,
      label: editFieldState.label,
      placeholder: editFieldState.placeholder || undefined,
      is_required: editFieldState.is_required,
      options: editNeedsOptions ? editFieldState.options : undefined,
    });
    
    handleCancelEdit();
  };

  const handleAddEditOption = () => {
    if (!editOption.trim() || !editFieldState) return;
    setEditFieldState(prev => prev ? ({
      ...prev,
      options: [...prev.options, { label: editOption, value: editOption.toLowerCase().replace(/\s+/g, '_') }],
    }) : prev);
    setEditOption('');
  };

  const handleRemoveEditOption = (index: number) => {
    setEditFieldState(prev => prev ? ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }) : prev);
  };

  // Reorder handlers
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const field = fields[index];
    const prevField = fields[index - 1];
    
    // Swap field_order values
    updateField({ id: field.id, field_order: prevField.field_order });
    updateField({ id: prevField.id, field_order: field.field_order });
  };

  const handleMoveDown = (index: number) => {
    if (index === fields.length - 1) return;
    const field = fields[index];
    const nextField = fields[index + 1];
    
    // Swap field_order values
    updateField({ id: field.id, field_order: nextField.field_order });
    updateField({ id: nextField.id, field_order: field.field_order });
  };

  return (
    <div className="space-y-6">
      {/* Existing Fields */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground">Form Fields</h3>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
            No fields added yet. {canEdit ? "Add your first field below." : ""}
          </p>
        ) : (
          <div className="space-y-2">
            {fields.map((field, index) => (
              <Card key={field.id} className="py-3">
                <CardContent className="flex items-center gap-3 py-0">
                  {canEdit && (
                    <div className="flex flex-col gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === fields.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{field.label}</span>
                      {field.is_required && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{field.field_type}</span>
                    {field.options && field.options.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {field.options.map((opt, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{opt.label}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(field)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteField(field.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add New Field - only show if user can edit */}
      {canEdit && (
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">Add New Field</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select
                  value={newField.field_type}
                  onValueChange={(value: FormField['field_type']) => 
                    setNewField(prev => ({ ...prev, field_type: value, options: [] }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Label *</Label>
                <Input
                  value={newField.label}
                  onChange={(e) => setNewField(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Full Name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Placeholder</Label>
                <Input
                  value={newField.placeholder}
                  onChange={(e) => setNewField(prev => ({ ...prev, placeholder: e.target.value }))}
                  placeholder="e.g., Enter your name"
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="required"
                  checked={newField.is_required}
                  onCheckedChange={(checked) => setNewField(prev => ({ ...prev, is_required: checked }))}
                />
                <Label htmlFor="required">Required field</Label>
              </div>
            </div>

            {needsOptions && (
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="flex gap-2">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
                  />
                  <Button type="button" variant="outline" onClick={handleAddOption}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {newField.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {newField.options.map((opt, index) => (
                      <Badge key={index} variant="secondary" className="gap-1">
                        {opt.label}
                        <button onClick={() => handleRemoveOption(index)}>
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={handleAddField}
              disabled={!newField.label.trim() || isCreating || (needsOptions && newField.options.length === 0)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit Field Dialog */}
      <Dialog open={!!editingField} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Field</DialogTitle>
          </DialogHeader>
          {editFieldState && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select
                  value={editFieldState.field_type}
                  onValueChange={(value: FormField['field_type']) => 
                    setEditFieldState(prev => prev ? ({ ...prev, field_type: value, options: [] }) : prev)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Label *</Label>
                <Input
                  value={editFieldState.label}
                  onChange={(e) => setEditFieldState(prev => prev ? ({ ...prev, label: e.target.value }) : prev)}
                  placeholder="e.g., Full Name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Placeholder</Label>
                <Input
                  value={editFieldState.placeholder}
                  onChange={(e) => setEditFieldState(prev => prev ? ({ ...prev, placeholder: e.target.value }) : prev)}
                  placeholder="e.g., Enter your name"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-required"
                  checked={editFieldState.is_required}
                  onCheckedChange={(checked) => setEditFieldState(prev => prev ? ({ ...prev, is_required: checked }) : prev)}
                />
                <Label htmlFor="edit-required">Required field</Label>
              </div>

              {editNeedsOptions && (
                <div className="space-y-2">
                  <Label>Options</Label>
                  <div className="flex gap-2">
                    <Input
                      value={editOption}
                      onChange={(e) => setEditOption(e.target.value)}
                      placeholder="Add option"
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEditOption())}
                    />
                    <Button type="button" variant="outline" onClick={handleAddEditOption}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {editFieldState.options.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {editFieldState.options.map((opt, index) => (
                        <Badge key={index} variant="secondary" className="gap-1">
                          {opt.label}
                          <button onClick={() => handleRemoveEditOption(index)}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveEdit} 
                  className="flex-1"
                  disabled={!editFieldState.label.trim() || (editNeedsOptions && editFieldState.options.length === 0)}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
