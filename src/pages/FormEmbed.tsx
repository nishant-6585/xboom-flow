import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, AlertCircle, Send, Shield } from "lucide-react";
import { FormField } from "@/hooks/useForms";
import { z } from "zod";

interface FormData {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

// Field validation limits
const FIELD_LIMITS = {
  text: 500,
  email: 255,
  phone: 20,
  number: 1000000000,
  textarea: 5000,
  date: 100,
  dropdown: 500,
  checkbox: 500,
  radio: 500,
} as const;

// Validate a single field value based on its type
const validateFieldValue = (field: FormField, value: unknown): { valid: boolean; error?: string } => {
  if (!value && !field.is_required) return { valid: true };
  
  const stringValue = typeof value === 'string' ? value : '';
  const arrayValue = Array.isArray(value) ? value : [];
  
  switch (field.field_type) {
    case 'text':
      if (stringValue.length > FIELD_LIMITS.text) {
        return { valid: false, error: `Maximum ${FIELD_LIMITS.text} characters allowed` };
      }
      break;
    case 'email':
      if (stringValue.length > FIELD_LIMITS.email) {
        return { valid: false, error: `Maximum ${FIELD_LIMITS.email} characters allowed` };
      }
      const emailSchema = z.string().email();
      if (stringValue && !emailSchema.safeParse(stringValue).success) {
        return { valid: false, error: 'Please enter a valid email address' };
      }
      break;
    case 'phone':
      if (stringValue.length > FIELD_LIMITS.phone) {
        return { valid: false, error: `Maximum ${FIELD_LIMITS.phone} characters allowed` };
      }
      // Allow common phone number formats
      const phoneRegex = /^[\d\s+\-().]{0,20}$/;
      if (stringValue && !phoneRegex.test(stringValue)) {
        return { valid: false, error: 'Please enter a valid phone number' };
      }
      break;
    case 'number':
      const numValue = Number(value);
      if (isNaN(numValue) || numValue < 0 || numValue > FIELD_LIMITS.number) {
        return { valid: false, error: `Please enter a valid number (0 - ${FIELD_LIMITS.number})` };
      }
      break;
    case 'textarea':
      if (stringValue.length > FIELD_LIMITS.textarea) {
        return { valid: false, error: `Maximum ${FIELD_LIMITS.textarea} characters allowed` };
      }
      break;
    case 'checkbox':
      // Validate each selected value
      for (const item of arrayValue) {
        if (typeof item !== 'string' || item.length > FIELD_LIMITS.checkbox) {
          return { valid: false, error: 'Invalid selection' };
        }
      }
      break;
    case 'dropdown':
    case 'radio':
      if (stringValue.length > FIELD_LIMITS.dropdown) {
        return { valid: false, error: 'Invalid selection' };
      }
      break;
  }
  
  return { valid: true };
};

// Sanitize submission data to prevent oversized payloads
const sanitizeSubmissionData = (formValues: Record<string, unknown>, fields: FormField[]): Record<string, unknown> => {
  const sanitized: Record<string, unknown> = {};
  
  for (const field of fields) {
    const value = formValues[field.id];
    if (value === undefined || value === null) continue;
    
    // Only include known field IDs
    if (typeof value === 'string') {
      // Truncate strings to prevent oversized data
      const limit = FIELD_LIMITS[field.field_type as keyof typeof FIELD_LIMITS] || 500;
      sanitized[field.id] = value.slice(0, limit);
    } else if (Array.isArray(value)) {
      // For checkbox arrays, sanitize each item
      sanitized[field.id] = value.slice(0, 50).map(v => 
        typeof v === 'string' ? v.slice(0, 500) : String(v).slice(0, 500)
      );
    } else {
      sanitized[field.id] = value;
    }
  }
  
  return sanitized;
};

export default function FormEmbed() {
  const { formId } = useParams<{ formId: string }>();
  const { toast } = useToast();
  const [form, setForm] = useState<FormData | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchForm() {
      if (!formId) return;

      try {
        // Use the public view that excludes sensitive columns (created_by, created_by_name)
        const { data: formData, error: formError } = await supabase
          .from("forms_public" as any)
          .select("id, name, description, is_active")
          .eq("id", formId)
          .single() as { data: FormData | null; error: any };

        if (formError || !formData) {
          setError("Form not found or is no longer active");
          setLoading(false);
          return;
        }

        const { data: fieldsData, error: fieldsError } = await supabase
          .from("form_fields")
          .select("*")
          .eq("form_id", formId)
          .order("field_order", { ascending: true });

        if (fieldsError) throw fieldsError;

        setForm(formData);
        setFields(fieldsData as FormField[]);

        // Track page view
        await supabase.from("form_views").insert({
          form_id: formId,
          user_agent: navigator.userAgent,
        });
      } catch (err) {
        setError("Failed to load form");
      } finally {
        setLoading(false);
      }
    }

    fetchForm();
  }, [formId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    // Clear previous errors
    setFieldErrors({});
    const newErrors: Record<string, string> = {};

    // Validate all fields
    for (const field of fields) {
      const value = formValues[field.id];
      
      // Check required fields
      if (field.is_required) {
        if (!value || (Array.isArray(value) && value.length === 0) || 
            (typeof value === 'string' && value.trim() === '')) {
          newErrors[field.id] = `${field.label} is required`;
          continue;
        }
      }
      
      // Validate field value if present
      if (value) {
        const validation = validateFieldValue(field, value);
        if (!validation.valid && validation.error) {
          newErrors[field.id] = validation.error;
        }
      }
    }

    // If there are validation errors, show them and stop
    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      toast({
        title: "Validation errors",
        description: "Please fix the highlighted fields",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Sanitize data before submission
      const sanitizedData = sanitizeSubmissionData(formValues, fields);
      
      // Check total payload size (max 100KB)
      const payloadSize = JSON.stringify(sanitizedData).length;
      if (payloadSize > 100000) {
        throw new Error('Submission data is too large');
      }
      
      const { error } = await supabase.from("form_submissions").insert([{
        form_id: form.id,
        submission_data: sanitizedData as unknown as Record<string, string | number | boolean | string[]>,
        user_agent: navigator.userAgent?.slice(0, 500) || 'Unknown',
      }]);

      if (error) throw error;

      setSubmitted(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Please try again later';
      toast({
        title: "Submission failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const updateValue = (fieldId: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const renderField = (field: FormField, index: number) => {
    const value = formValues[field.id];
    const animationDelay = { animationDelay: `${index * 60}ms` };
    const fieldError = fieldErrors[field.id];

    const labelElement = (
      <Label className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
        {field.label}
        {field.is_required && <span className="text-destructive text-xs">*</span>}
      </Label>
    );

    const errorElement = fieldError ? (
      <p className="text-xs text-destructive mt-1">{fieldError}</p>
    ) : null;

    const inputBaseClass = `h-11 bg-background border-border/60 rounded-lg transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-border placeholder:text-muted-foreground/50 ${fieldError ? 'border-destructive' : ''}`;

    switch (field.field_type) {
      case "text":
      case "email":
      case "phone":
        return (
          <div 
            className="animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {labelElement}
            <Input
              type={field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text"}
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
              maxLength={FIELD_LIMITS[field.field_type]}
              className={inputBaseClass}
            />
            {errorElement}
          </div>
        );

      case "number":
        return (
          <div 
            className="animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {labelElement}
            <Input
              type="number"
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
              max={FIELD_LIMITS.number}
              className={inputBaseClass}
            />
            {errorElement}
          </div>
        );

      case "textarea":
        return (
          <div 
            className="animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {labelElement}
            <Textarea
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
              maxLength={FIELD_LIMITS.textarea}
              className={`${inputBaseClass} min-h-[120px] resize-none py-3`}
            />
            {errorElement}
          </div>
        );

      case "date":
        return (
          <div 
            className="animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {labelElement}
            <Input
              type="date"
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
              className={inputBaseClass}
            />
            {errorElement}
          </div>
        );

      case "dropdown":
        return (
          <div 
            className="animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {labelElement}
            <Select
              value={(value as string) || ""}
              onValueChange={(v) => updateValue(field.id, v)}
            >
              <SelectTrigger className={inputBaseClass}>
                <SelectValue placeholder={field.placeholder || "Select an option"} />
              </SelectTrigger>
              <SelectContent className="bg-background border-border rounded-lg shadow-lg">
                {(field.options || []).map((opt) => (
                  <SelectItem 
                    key={opt.value} 
                    value={opt.value}
                    className="cursor-pointer rounded-md hover:bg-muted focus:bg-muted"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorElement}
          </div>
        );

      case "checkbox":
        return (
          <div 
            className="animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {labelElement}
            <div className="space-y-2 mt-1">
              {(field.options || []).map((opt) => (
                <label 
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-muted/30 transition-all cursor-pointer group" 
                  key={opt.value}
                >
                  <Checkbox
                    id={`${field.id}-${opt.value}`}
                    checked={((value as string[]) || []).includes(opt.value)}
                    onCheckedChange={(checked) => {
                      const current = (value as string[]) || [];
                      if (checked) {
                        updateValue(field.id, [...current, opt.value]);
                      } else {
                        updateValue(field.id, current.filter((v) => v !== opt.value));
                      }
                    }}
                    className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <span className="text-sm text-foreground/90 group-hover:text-foreground transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
            {errorElement}
          </div>
        );

      case "radio":
        return (
          <div 
            className="animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {labelElement}
            <RadioGroup
              value={(value as string) || ""}
              onValueChange={(v) => updateValue(field.id, v)}
              className="space-y-2 mt-1"
            >
              {(field.options || []).map((opt) => (
                <label 
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-muted/30 transition-all cursor-pointer group" 
                  key={opt.value}
                >
                  <RadioGroupItem 
                    value={opt.value} 
                    id={`${field.id}-${opt.value}`}
                    className="border-border text-primary"
                  />
                  <span className="text-sm text-foreground/90 group-hover:text-foreground transition-colors">
                    {opt.label}
                  </span>
                </label>
              ))}
            </RadioGroup>
            {errorElement}
          </div>
        );

      default:
        return null;
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground font-medium">Loading form...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-sm p-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">Form Unavailable</h2>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success State
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-sm p-8 text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Thank You!</h2>
              <p className="text-muted-foreground">Your response has been submitted successfully.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Form State
  return (
    <div className="min-h-screen py-8 px-4 bg-muted/30">
      <div className="max-w-xl mx-auto animate-fade-in">
        {/* Form Card */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="border-b border-border bg-muted/30 px-6 py-5">
            <h1 className="text-xl font-semibold text-foreground">
              {form?.name}
            </h1>
            {form?.description && (
              <p className="text-muted-foreground text-sm mt-1.5 leading-relaxed">
                {form.description}
              </p>
            )}
          </div>

          {/* Form Body */}
          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {fields.map((field, index) => renderField(field, index))}
              
              {/* Submit Button */}
              <div 
                className="pt-4 animate-fade-in opacity-0" 
                style={{ animationDelay: `${fields.length * 60 + 100}ms` }}
              >
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-medium shadow-sm hover:shadow transition-all duration-200"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      Submit
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-6 py-4 bg-muted/20">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>Your information is secure and encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
