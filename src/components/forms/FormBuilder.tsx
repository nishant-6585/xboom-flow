import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useFormFields, FormField } from "@/hooks/useForms";
import { Plus, Trash2, X, Pencil, Check, GripVertical, Type, Mail, Phone, Hash, AlignLeft, ChevronDown, CheckSquare, Circle, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

const FIELD_TYPES = [
  { value: 'text', label: 'Text', icon: Type },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'phone', label: 'Phone', icon: Phone },
  { value: 'number', label: 'Number', icon: Hash },
  { value: 'textarea', label: 'Textarea', icon: AlignLeft },
  { value: 'dropdown', label: 'Dropdown', icon: ChevronDown },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { value: 'radio', label: 'Radio', icon: Circle },
  { value: 'date', label: 'Date', icon: Calendar },
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

// Sortable Field Item Component
function SortableFieldItem({ 
  field, 
  canEdit, 
  onEdit, 
  onDelete 
}: { 
  field: FormField; 
  canEdit: boolean;
  onEdit: (field: FormField) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fieldType = FIELD_TYPES.find(t => t.value === field.field_type);
  const FieldIcon = fieldType?.icon || Type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex items-center gap-3 p-4 bg-card border rounded-xl transition-all",
        isDragging && "opacity-50 shadow-lg ring-2 ring-primary/20 z-50",
        !isDragging && "hover:shadow-md hover:border-primary/30"
      )}
    >
      {canEdit && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted transition-colors"
        >
          <GripVertical className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      
      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary shrink-0">
        <FieldIcon className="h-5 w-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{field.label}</span>
          {field.is_required && (
            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs font-normal">
              Required
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground capitalize">{field.field_type}</span>
        {field.options && field.options.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {field.options.map((opt, i) => (
              <Badge key={i} variant="secondary" className="text-xs font-normal">
                {opt.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(field)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(field.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
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

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const needsOptions = ['dropdown', 'checkbox', 'radio'].includes(newField.field_type);
  const editNeedsOptions = editFieldState ? ['dropdown', 'checkbox', 'radio'].includes(editFieldState.field_type) : false;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      
      const newFields = arrayMove(fields, oldIndex, newIndex);
      
      // Update all affected fields with new order
      newFields.forEach((field, index) => {
        if (field.field_order !== index) {
          updateField({ id: field.id, field_order: index });
        }
      });
    }
  };

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

  const selectedFieldType = FIELD_TYPES.find(t => t.value === newField.field_type);

  return (
    <div className="space-y-6">
      {/* Existing Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Form Fields</h3>
          {fields.length > 0 && canEdit && (
            <span className="text-xs text-muted-foreground">
              Drag to reorder
            </span>
          )}
        </div>
        
        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-xl bg-muted/30">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No fields added yet
            </p>
            {canEdit && (
              <p className="text-xs text-muted-foreground mt-1">
                Add your first field below
              </p>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={fields.map(f => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {fields.map((field) => (
                  <SortableFieldItem
                    key={field.id}
                    field={field}
                    canEdit={canEdit}
                    onEdit={handleStartEdit}
                    onDelete={deleteField}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add New Field */}
      {canEdit && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
          <CardHeader className="py-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add New Field
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {/* Field Type Selection */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Field Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {FIELD_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = newField.field_type === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setNewField(prev => ({ ...prev, field_type: type.value as FormField['field_type'], options: [] }))}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-center",
                        isSelected 
                          ? "border-primary bg-primary/10 text-primary" 
                          : "border-transparent bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Label and Placeholder */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Label *</Label>
                <Input
                  value={newField.label}
                  onChange={(e) => setNewField(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g., Full Name"
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Placeholder</Label>
                <Input
                  value={newField.placeholder}
                  onChange={(e) => setNewField(prev => ({ ...prev, placeholder: e.target.value }))}
                  placeholder="e.g., Enter your name"
                  className="h-9"
                />
              </div>
            </div>

            {/* Required Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label htmlFor="required" className="text-sm font-medium cursor-pointer">Required field</Label>
                <p className="text-xs text-muted-foreground">Users must fill this field</p>
              </div>
              <Switch
                id="required"
                checked={newField.is_required}
                onCheckedChange={(checked) => setNewField(prev => ({ ...prev, is_required: checked }))}
              />
            </div>

            {/* Options for dropdown/checkbox/radio */}
            {needsOptions && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Options</Label>
                <div className="flex gap-2">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option and press Enter"
                    className="h-9"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddOption())}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-9 px-3" onClick={handleAddOption}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {newField.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50">
                    {newField.options.map((opt, index) => (
                      <Badge key={index} variant="secondary" className="gap-1.5 pr-1">
                        {opt.label}
                        <button 
                          onClick={() => handleRemoveOption(index)}
                          className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
                        >
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
              size="lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add {selectedFieldType?.label} Field
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
                        <div className="flex items-center gap-2">
                          <type.icon className="h-4 w-4" />
                          {type.label}
                        </div>
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
