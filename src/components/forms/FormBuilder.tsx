import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useFormFields, FormField } from "@/hooks/useForms";
import { Plus, Trash2, GripVertical, X } from "lucide-react";

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
}

export function FormBuilder({ formId }: FormBuilderProps) {
  const { fields, createField, deleteField, isCreating } = useFormFields(formId);
  const [newField, setNewField] = useState({
    field_type: 'text' as FormField['field_type'],
    label: '',
    placeholder: '',
    is_required: false,
    options: [] as { label: string; value: string }[],
  });
  const [newOption, setNewOption] = useState('');

  const needsOptions = ['dropdown', 'checkbox', 'radio'].includes(newField.field_type);

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

  return (
    <div className="space-y-6">
      {/* Existing Fields */}
      <div className="space-y-3">
        <h3 className="font-medium text-sm text-muted-foreground">Form Fields</h3>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg border-dashed">
            No fields added yet. Add your first field below.
          </p>
        ) : (
          <div className="space-y-2">
            {fields.map((field) => (
              <Card key={field.id} className="py-3">
                <CardContent className="flex items-center gap-3 py-0">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{field.label}</span>
                      {field.is_required && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{field.field_type}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteField(field.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add New Field */}
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
    </div>
  );
}
