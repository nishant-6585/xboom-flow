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

interface FormData {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

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

  useEffect(() => {
    async function fetchForm() {
      if (!formId) return;

      try {
        const { data: formData, error: formError } = await supabase
          .from("forms")
          .select("*")
          .eq("id", formId)
          .eq("is_active", true)
          .single();

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

    for (const field of fields) {
      if (field.is_required) {
        const value = formValues[field.id];
        if (!value || (Array.isArray(value) && value.length === 0)) {
          toast({
            title: "Required field missing",
            description: `Please fill in "${field.label}"`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("form_submissions").insert([{
        form_id: form.id,
        submission_data: JSON.parse(JSON.stringify(formValues)),
        user_agent: navigator.userAgent,
      }]);

      if (error) throw error;

      setSubmitted(true);
    } catch (err) {
      toast({
        title: "Submission failed",
        description: "Please try again later",
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

    const labelElement = (
      <Label className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
        {field.label}
        {field.is_required && <span className="text-destructive text-xs">*</span>}
      </Label>
    );

    const inputBaseClass = "h-11 bg-background border-border/60 rounded-lg transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-border placeholder:text-muted-foreground/50";

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
              className={inputBaseClass}
            />
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
              className={inputBaseClass}
            />
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
              className={`${inputBaseClass} min-h-[120px] resize-none py-3`}
            />
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
