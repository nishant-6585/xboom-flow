import { FormField } from "@/hooks/useForms";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Paperclip } from "lucide-react";

interface FormPreviewProps {
  formName: string;
  formDescription?: string;
  fields: FormField[];
  isPreview?: boolean;
}

export function FormPreview({ formName, formDescription, fields, isPreview = true }: FormPreviewProps) {
  const renderField = (field: FormField) => {
    const label = (
      <Label className="text-sm font-medium">
        {field.label}
        {field.is_required && <span className="text-destructive ml-1">*</span>}
      </Label>
    );

    switch (field.field_type) {
      case 'text':
      case 'email':
      case 'phone':
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Input
              type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
              placeholder={field.placeholder}
              disabled={isPreview}
            />
          </div>
        );
      
      case 'number':
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Input type="number" placeholder={field.placeholder} disabled={isPreview} />
          </div>
        );
      
      case 'textarea':
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Textarea placeholder={field.placeholder} disabled={isPreview} />
          </div>
        );
      
      case 'date':
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Input type="date" disabled={isPreview} />
          </div>
        );
      
      case 'dropdown':
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Select disabled={isPreview}>
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder || "Select an option"} />
              </SelectTrigger>
              <SelectContent>
                {(field.options || []).map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      
      case 'checkbox':
        return (
          <div className="space-y-3" key={field.id}>
            {label}
            <div className="space-y-2">
              {(field.options || []).map((opt) => (
                <div className="flex items-center space-x-2" key={opt.value}>
                  <Checkbox id={`${field.id}-${opt.value}`} disabled={isPreview} />
                  <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'radio':
        return (
          <div className="space-y-3" key={field.id}>
            {label}
            <RadioGroup disabled={isPreview}>
              {(field.options || []).map((opt) => (
                <div className="flex items-center space-x-2" key={opt.value}>
                  <RadioGroupItem value={opt.value} id={`${field.id}-${opt.value}`} />
                  <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        );
      
      case 'attachment': {
        const maxSize = field.options?.[0]?.value || '5';
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <div className="flex items-center gap-2 p-4 border-2 border-dashed rounded-lg bg-muted/30">
              <Paperclip className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                <p>Upload file (Max {maxSize}MB)</p>
                <p className="text-xs">PDF, Word, JPG, PNG, WebP</p>
              </div>
            </div>
          </div>
        );
      }
      
      default:
        return null;
    }
  };

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>{formName}</CardTitle>
        {formDescription && <CardDescription>{formDescription}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Add fields to see the form preview
          </p>
        ) : (
          <>
            {fields.map(renderField)}
            <Button className="w-full" disabled={isPreview}>
              Submit
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
