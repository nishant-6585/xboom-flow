import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle, AlertCircle, Wrench, Send } from "lucide-react";
import { z } from "zod";
import { validateEmail, validatePhone } from "@/lib/contactValidation";

const DRONE_CATEGORIES = [
  { value: "Consumer", label: "Consumer Drone" },
  { value: "Enterprise", label: "Enterprise Drone" },
  { value: "Agriculture", label: "Agriculture Drone" },
  { value: "FPV", label: "FPV Drone" },
  { value: "Mapping & Survey", label: "Mapping & Survey Drone" },
  { value: "Delivery", label: "Delivery Drone" },
  { value: "Other", label: "Other" },
];

const ISSUE_TYPES = [
  { value: "motor_failure", label: "Motor Failure" },
  { value: "gimbal_issue", label: "Gimbal Issue" },
  { value: "camera_damage", label: "Camera Damage" },
  { value: "battery_problem", label: "Battery Problem" },
  { value: "gps_issue", label: "GPS Issue" },
  { value: "remote_controller", label: "Remote Controller Issue" },
  { value: "propeller_damage", label: "Propeller Damage" },
  { value: "frame_damage", label: "Frame / Body Damage" },
  { value: "flight_controller", label: "Flight Controller Issue" },
  { value: "esc_issue", label: "ESC Issue" },
  { value: "software_issue", label: "Software / Firmware Issue" },
  { value: "water_damage", label: "Water Damage" },
  { value: "crash_damage", label: "Crash Damage" },
  { value: "other", label: "Other" },
];

const formSchema = z.object({
  customer_name: z.string().trim().min(1, "Name is required").max(100),
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || validateEmail(v).valid === true, {
      message: "Enter a valid email (e.g. name@example.com)",
    }),
  phone: z
    .string()
    .trim()
    .min(1, "Phone number is required")
    .max(20)
    .refine((v) => validatePhone(v, { required: true }).valid === true, {
      message:
        "Enter a 10-digit Indian mobile (6-9…) or international number with country code",
    }),
  drone_model: z.string().trim().min(1, "Drone model is required").max(200),
  drone_category: z.string().min(1, "Category is required"),
  serial_number: z.string().trim().max(100).optional().or(z.literal("")),
  issue_type: z.string().min(1, "Issue type is required"),
  issue_description: z.string().trim().min(10, "Please describe the issue in at least 10 characters").max(2000),
  purchase_date: z.string().optional().or(z.literal("")),
  is_under_warranty: z.boolean().default(false),
  preferred_date: z.string().optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

export default function PublicDroneRepairEnquiry() {
  const [formData, setFormData] = useState<FormValues>({
    customer_name: "",
    email: "",
    phone: "",
    drone_model: "",
    drone_category: "",
    serial_number: "",
    issue_type: "",
    issue_description: "",
    purchase_date: "",
    is_under_warranty: false,
    preferred_date: "",
    city: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = (field: keyof FormValues, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    const result = formSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customer_name: result.data.customer_name,
        email: result.data.email || null,
        phone: result.data.phone,
        drone_model: result.data.drone_model,
        drone_category: result.data.drone_category,
        serial_number: result.data.serial_number || null,
        issue_type: result.data.issue_type,
        issue_description: result.data.issue_description,
        purchase_date: result.data.purchase_date || null,
        is_under_warranty: result.data.is_under_warranty,
        preferred_date: result.data.preferred_date || null,
        city: result.data.city || null,
      };

      const { error } = await supabase
        .from("drone_repair_enquiries" as any)
        .insert(payload);

      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      console.error("Submission error:", err);
      setSubmitError("Something went wrong. Please try again or call us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  // Thank you screen
  if (submitted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 p-4">
        <Helmet>
          <title>Enquiry Submitted | Xboom Drone Repair</title>
          <meta name="description" content="Thank you — your drone repair enquiry has been received. Our team will respond within 24 hours." />
          <link rel="canonical" href="https://xboomflow.com/public/drone-repair-enquiry" />
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="max-w-md w-full animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-lg p-8 text-center space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">Thank You!</h2>
              <p className="text-slate-600 text-sm leading-relaxed">
                Your drone repair enquiry has been submitted successfully. Our team will review it and get back to you within 24 hours.
              </p>
            </div>
            <div className="pt-2">
              <Button
                onClick={() => {
                  setSubmitted(false);
                  setFormData({
                    customer_name: "",
                    email: "",
                    phone: "",
                    drone_model: "",
                    drone_category: "",
                    serial_number: "",
                    issue_type: "",
                    issue_description: "",
                    purchase_date: "",
                    is_under_warranty: false,
                    preferred_date: "",
                    city: "",
                  });
                }}
                variant="outline"
                className="text-sm"
              >
                Submit Another Enquiry
              </Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const inputClass = "h-11 bg-white border-slate-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <Helmet>
        <title>Drone Repair Enquiry | Xboom — Submit a Repair Request</title>
        <meta name="description" content="Submit a drone repair enquiry to Xboom. Share your drone model, issue type and contact details — our expert team responds within 24 hours." />
        <link rel="canonical" href="https://xboomflow.com/public/drone-repair-enquiry" />
        <meta property="og:title" content="Drone Repair Enquiry | Xboom" />
        <meta property="og:description" content="Submit a drone repair enquiry to Xboom — our expert team responds within 24 hours." />
        <meta property="og:url" content="https://xboomflow.com/public/drone-repair-enquiry" />
      </Helmet>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full mb-4">
            <Wrench className="h-5 w-5" />
            <span className="text-sm font-semibold tracking-wide">XBOOM DRONE REPAIR</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Drone Repair Enquiry
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            Fill in the details below and our expert team will get back to you shortly.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Contact Info */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Contact Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.customer_name}
                  onChange={(e) => update("customer_name", e.target.value)}
                  placeholder="Your full name"
                  maxLength={100}
                  className={inputClass}
                />
                {errors.customer_name && <p className="text-xs text-red-500">{errors.customer_name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Phone Number <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="+91 98765 43210"
                  maxLength={20}
                  className={inputClass}
                />
                {errors.phone && <p className="text-xs text-red-500">{errors.phone}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => update("email", e.target.value)}
                  placeholder="you@email.com"
                  maxLength={255}
                  className={inputClass}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => update("city", e.target.value)}
                  placeholder="Your city"
                  maxLength={100}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Drone Info */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Drone Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Drone Model <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.drone_model}
                  onChange={(e) => update("drone_model", e.target.value)}
                  placeholder="e.g. DJI Mavic 3, Mini 4 Pro"
                  maxLength={200}
                  className={inputClass}
                />
                {errors.drone_model && <p className="text-xs text-red-500">{errors.drone_model}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Category <span className="text-red-500">*</span></Label>
                <Select value={formData.drone_category} onValueChange={(v) => update("drone_category", v)}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {DRONE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.drone_category && <p className="text-xs text-red-500">{errors.drone_category}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Serial Number</Label>
                <Input
                  value={formData.serial_number}
                  onChange={(e) => update("serial_number", e.target.value)}
                  placeholder="Optional"
                  maxLength={100}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Purchase Date</Label>
                <Input
                  type="date"
                  value={formData.purchase_date}
                  onChange={(e) => update("purchase_date", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                  <Checkbox
                    checked={formData.is_under_warranty}
                    onCheckedChange={(checked) => update("is_under_warranty", !!checked)}
                  />
                  <span className="text-sm text-slate-700">This drone is under warranty</span>
                </label>
              </div>
            </div>
          </div>

          {/* Issue Details */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Issue Details</h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Issue Type <span className="text-red-500">*</span></Label>
                <Select value={formData.issue_type} onValueChange={(v) => update("issue_type", v)}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Select issue type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ISSUE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.issue_type && <p className="text-xs text-red-500">{errors.issue_type}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Describe the Issue <span className="text-red-500">*</span></Label>
                <Textarea
                  value={formData.issue_description}
                  onChange={(e) => update("issue_description", e.target.value)}
                  placeholder="Please describe what happened, any error messages, and when the issue started..."
                  maxLength={2000}
                  rows={4}
                  className={`${inputClass} min-h-[100px] resize-none`}
                />
                <div className="flex justify-between">
                  {errors.issue_description && <p className="text-xs text-red-500">{errors.issue_description}</p>}
                  <p className="text-xs text-slate-400 ml-auto">{formData.issue_description.length}/2000</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-slate-700">Preferred Service Date</Label>
                <Input
                  type="date"
                  value={formData.preferred_date}
                  onChange={(e) => update("preferred_date", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          {submitError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {submitError}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md text-base"
          >
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                Submit Repair Enquiry
              </>
            )}
          </Button>

          <p className="text-center text-xs text-slate-400">
            Powered by Xboom · Your data is secure and encrypted
          </p>
        </form>
      </div>
    </main>
  );
}
