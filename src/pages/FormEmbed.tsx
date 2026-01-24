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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
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

  const renderField = (field: FormField) => {
    const value = formValues[field.id];
    const label = (
      <Label className="text-sm font-medium">
        {field.label}
        {field.is_required && <span className="text-destructive ml-1">*</span>}
      </Label>
    );

    switch (field.field_type) {
      case "text":
      case "email":
      case "phone":
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Input
              type={field.field_type === "email" ? "email" : field.field_type === "phone" ? "tel" : "text"}
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
            />
          </div>
        );

      case "number":
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Input
              type="number"
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
            />
          </div>
        );

      case "textarea":
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Textarea
              placeholder={field.placeholder}
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
            />
          </div>
        );

      case "date":
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Input
              type="date"
              value={(value as string) || ""}
              onChange={(e) => updateValue(field.id, e.target.value)}
              required={field.is_required}
            />
          </div>
        );

      case "dropdown":
        return (
          <div className="space-y-2" key={field.id}>
            {label}
            <Select
              value={(value as string) || ""}
              onValueChange={(v) => updateValue(field.id, v)}
            >
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

      case "checkbox":
        return (
          <div className="space-y-3" key={field.id}>
            {label}
            <div className="space-y-2">
              {(field.options || []).map((opt) => (
                <div className="flex items-center space-x-2" key={opt.value}>
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
                  />
                  <Label htmlFor={`${field.id}-${opt.value}`} className="font-normal">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );

      case "radio":
        return (
          <div className="space-y-3" key={field.id}>
            {label}
            <RadioGroup
              value={(value as string) || ""}
              onValueChange={(v) => updateValue(field.id, v)}
            >
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

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
            <h2 className="text-xl font-semibold">Thank you!</h2>
            <p className="text-muted-foreground">Your response has been submitted successfully.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 bg-background">
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>{form?.name}</CardTitle>
          {form?.description && <CardDescription>{form.description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {fields.map(renderField)}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
