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
import { Loader2, CheckCircle, AlertCircle, Send, Sparkles } from "lucide-react";
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

    // Validate required fields
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
    const label = (
      <Label className="text-sm font-medium text-foreground/90 flex items-center gap-1">
        {field.label}
        {field.is_required && <span className="text-destructive">*</span>}
      </Label>
    );

    const baseInputClass = "transition-all duration-200 border-border/50 bg-background/50 backdrop-blur-sm focus:border-primary focus:ring-2 focus:ring-primary/20 hover:border-border";
    const animationDelay = { animationDelay: `${index * 50}ms` };

    switch (field.field_type) {
      case "text":
      case "email":
      case "phone":
        return (
          <div 
            className="space-y-2 animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {label}
            <Input
              type={field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text"}
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
              className={baseInputClass}
            />
          </div>
        );

      case "number":
        return (
          <div 
            className="space-y-2 animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {label}
            <Input
              type="number"
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
              className={baseInputClass}
            />
          </div>
        );

      case "textarea":
        return (
          <div 
            className="space-y-2 animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {label}
            <Textarea
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
              className={`${baseInputClass} min-h-[100px] resize-none`}
            />
          </div>
        );

      case "date":
        return (
          <div 
            className="space-y-2 animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {label}
            <Input
              type="date"
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
              className={baseInputClass}
            />
          </div>
        );

      case "dropdown":
        return (
          <div 
            className="space-y-2 animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {label}
            <Select
              value={(value as string) || ""}
              onValueChange={(v) => updateValue(field.id, v)}
            >
              <SelectTrigger className={baseInputClass}>
                <SelectValue placeholder={field.placeholder || "Select an option"} />
              </SelectTrigger>
              <SelectContent className="bg-background/95 backdrop-blur-md border-border/50">
                {(field.options || []).map((opt) => (
                  <SelectItem 
                    key={opt.value} 
                    value={opt.value}
                    className="cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
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
            className="space-y-3 animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {label}
            <div className="space-y-2 pl-1">
              {(field.options || []).map((opt) => (
                <div 
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group" 
                  key={opt.value}
                  onClick={() => {
                    const current = (value as string[]) || [];
                    if (current.includes(opt.value)) {
                      updateValue(field.id, current.filter((v) => v !== opt.value));
                    } else {
                      updateValue(field.id, [...current, opt.value]);
                    }
                  }}
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
                    className="border-border/60 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <Label 
                    htmlFor={`${field.id}-${opt.value}`} 
                    className="font-normal cursor-pointer group-hover:text-foreground transition-colors"
                  >
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );

      case "radio":
        return (
          <div 
            className="space-y-3 animate-fade-in opacity-0" 
            key={field.id}
            style={animationDelay}
          >
            {label}
            <RadioGroup
              value={(value as string) || ""}
              onValueChange={(v) => updateValue(field.id, v)}
              className="pl-1"
            >
              {(field.options || []).map((opt) => (
                <div 
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group" 
                  key={opt.value}
                  onClick={() => updateValue(field.id, opt.value)}
                >
                  <RadioGroupItem 
                    value={opt.value} 
                    id={`${field.id}-${opt.value}`}
                    className="border-border/60 text-primary"
                  />
                  <Label 
                    htmlFor={`${field.id}-${opt.value}`} 
                    className="font-normal cursor-pointer group-hover:text-foreground transition-colors"
                  >
                    {opt.label}
                  </Label>
                </div>
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
            <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
          </div>
          <p className="text-sm text-muted-foreground">Loading form...</p>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
        <div className="max-w-md w-full animate-fade-in">
          <div className="bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl shadow-xl p-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Form Unavailable</h2>
            <p className="text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Success State
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
        <div className="max-w-md w-full animate-fade-in">
          <div className="bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl shadow-xl p-8 text-center space-y-6">
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 bg-green-500/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Thank You!</h2>
              <p className="text-muted-foreground">Your response has been submitted successfully.</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground/60">
              <Sparkles className="h-4 w-4" />
              <span>We appreciate your time</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Form State
  return (
    <div className="min-h-screen py-8 px-4 bg-gradient-to-br from-background via-background to-muted/30">
      <div className="max-w-lg mx-auto animate-fade-in">
        {/* Form Card */}
        <div className="bg-card/80 backdrop-blur-md border border-border/50 rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-border/30 p-6 space-y-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {form?.name}
            </h1>
            {form?.description && (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {form.description}
              </p>
            )}
          </div>

          {/* Form Body */}
          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {fields.map((field, index) => renderField(field, index))}
              
              {/* Submit Button */}
              <div className="pt-4 animate-fade-in opacity-0" style={{ animationDelay: `${fields.length * 50 + 100}ms` }}>
                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-medium bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl hover:shadow-primary/20 transition-all duration-300 group"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2 transition-transform group-hover:translate-x-0.5" />
                      Submit Response
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="border-t border-border/30 px-6 py-4 bg-muted/20">
            <p className="text-xs text-muted-foreground/60 text-center">
              Your information is secure and encrypted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
