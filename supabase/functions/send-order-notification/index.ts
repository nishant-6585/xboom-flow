import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface OrderNotificationRequest {
  orderNumber: string;
  customerName: string;
  customerCompany: string;
  customerEmail?: string;
  productName: string;
  productCode: string;
  quantity: number;
  sellingPrice?: number;
  totalAmount?: number;
  salesPersonName: string;
  estimatedDelivery?: string;
  shippingAddress?: string;
  paymentTerms?: string;
  notes?: string;
}

// Input sanitization: escape HTML to prevent injection in email templates
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Validate and sanitize string input with length limit
const sanitizeInput = (value: unknown, maxLength = 500): string => {
  if (typeof value !== "string") return "";
  return escapeHtml(value.slice(0, maxLength));
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Supabase configuration missing");
    }

    // Create client with user's auth token to verify JWT
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the JWT by getting the user - this validates the token server-side
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    
    if (userError || !user) {
      console.error("JWT verification failed:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawData: OrderNotificationRequest = await req.json();
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // Validate required fields
    if (!rawData.orderNumber || !rawData.customerName || !rawData.productName) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Trim only — React renders text nodes and escapes automatically,
    // so no HTML-escaping is needed once the platform template owns rendering.
    const clip = (v: unknown, n: number) =>
      typeof v === "string" ? v.slice(0, n) : "";
    const orderData = {
      orderNumber: clip(rawData.orderNumber, 50),
      customerName: clip(rawData.customerName, 200),
      customerCompany: clip(rawData.customerCompany, 200),
      customerEmail: clip(rawData.customerEmail, 255),
      productName: clip(rawData.productName, 200),
      productCode: clip(rawData.productCode, 100),
      quantity: typeof rawData.quantity === "number" ? rawData.quantity : 0,
      sellingPrice: typeof rawData.sellingPrice === "number" ? rawData.sellingPrice : undefined,
      totalAmount: typeof rawData.totalAmount === "number" ? rawData.totalAmount : undefined,
      salesPersonName: clip(rawData.salesPersonName, 200),
      estimatedDelivery: clip(rawData.estimatedDelivery, 100),
      shippingAddress: clip(rawData.shippingAddress, 500),
      paymentTerms: clip(rawData.paymentTerms, 200),
      notes: clip(rawData.notes, 1000),
      createdAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    };

    const { sendEmail: sendMailSeam } = await import("../_shared/email.ts");
    // Migrated to the platform queue via a registered React Email template.
    // Copy/subject/recipient are byte-for-byte reproductions handled inside
    // the `order-notification` template (fixed `to: nishant.k@xboom.in`).
    // Idempotency key mirrors the stable identity of the notified order.
    const emailResponse = await sendMailSeam({
      to: "nishant.k@xboom.in",
      subject: "", // template owns the subject
      html: "",   // template owns rendering
      provider: "platform",
      templateName: "order-notification",
      templateData: orderData,
      idempotencyKey: `order-notification:${orderData.orderNumber}`,
    });
    const result = emailResponse.raw;
    if (!emailResponse.ok) {
      console.error("Email send error:", emailResponse.error, result);
      throw new Error("Failed to send email");
    }

    console.log("Order notification email sent successfully:", result);

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending order notification email:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send notification" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
