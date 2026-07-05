import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail as sendMailSeam } from "../_shared/email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TicketEmailRequest {
  type: "status_update" | "assignment";
  ticket_number: string;
  subject: string;
  old_status?: string;
  new_status?: string;
  priority: string;
  resolution_notes?: string;
  assigned_to_name?: string;
  raised_by_name?: string;
  updated_by_name?: string;
  recipient_user_id: string;
  sla_due_at?: string;
  category?: string;
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

const getPriorityColor = (priority: string): string => {
  switch (priority?.toLowerCase()) {
    case "critical": return "#dc2626";
    case "high": return "#ea580c";
    case "medium": return "#ca8a04";
    case "low": return "#16a34a";
    default: return "#6b7280";
  }
};

const getPriorityEmoji = (priority: string): string => {
  switch (priority?.toLowerCase()) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "medium": return "🟡";
    case "low": return "🟢";
    default: return "⚪";
  }
};

const formatStatus = (status: string): string => {
  return status?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) || status;
};

const handler = async (req: Request): Promise<Response> => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    // Create client with user's auth token to verify JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: TicketEmailRequest = await req.json();

    // Validate required fields
    if (!payload.type || !payload.ticket_number || !payload.subject || !payload.recipient_user_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate type is one of expected values
    if (!["status_update", "assignment"].includes(payload.type)) {
      return new Response(JSON.stringify({ error: "Invalid email type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: prevent internal phishing. Only admin/hr/support, or
    // a participant on the referenced ticket (raised_by / assigned_to),
    // may trigger a ticket notification email. Additionally, fetch the
    // real ticket row and use its own subject/ticket_number rather than
    // trusting attacker-supplied text.
    const { data: callerRoles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id);
    const privilegedRoles = new Set(["admin", "hr", "support"]);
    const callerIsPrivileged = (callerRoles ?? []).some(
      (r: { role: string }) => privilegedRoles.has(r.role),
    );

    const { data: realTicket } = await supabase
      .from("tickets")
      .select("id, ticket_number, subject, raised_by, assigned_to, priority, category")
      .eq("ticket_number", payload.ticket_number)
      .maybeSingle();

    if (!realTicket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerIsParticipant =
      realTicket.raised_by === user.id || realTicket.assigned_to === user.id;
    if (!callerIsPrivileged && !callerIsParticipant) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Length-clamp text inputs. React escapes props, so HTML-escaping here
    // would double-encode inside the template — clamp only.
    const clamp = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
    // Ticket identity + subject come from the DB row, not the request body,
    // so a caller can't fabricate them.
    const ticket_number = clamp(realTicket.ticket_number, 50);
    const subject = clamp(realTicket.subject, 200);
    const old_status = clamp(payload.old_status, 50);
    const new_status = clamp(payload.new_status, 50);
    const priority = clamp(realTicket.priority ?? payload.priority, 20);
    const resolution_notes = clamp(payload.resolution_notes, 2000);
    const raised_by_name = clamp(payload.raised_by_name, 100);
    const updated_by_name = clamp(payload.updated_by_name, 100);
    const recipient_user_id = payload.recipient_user_id;
    const sla_due_at = payload.sla_due_at;
    const category = clamp(realTicket.category ?? payload.category, 100);

    // Fetch recipient's email from profiles
    const { data: recipientProfile, error: profileError } = await supabase
      .from("profiles")
      .select("email, name")
      .eq("user_id", recipient_user_id)
      .single();

    if (profileError || !recipientProfile?.email) {
      console.log("Could not find recipient email:", profileError);
      return new Response(
        JSON.stringify({ success: false, message: "Recipient email not found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const recipientEmail = recipientProfile.email;
    const recipientName = recipientProfile.name || "Team Member";

    // Per-transition component: fetch the ticket's current updated_at so
    // re-entering the same status (resolved -> reopened -> resolved) produces
    // a distinct idempotency key. True duplicate dispatches within the same
    // transition still collapse because updated_at is stable until the next
    // write.
    let transitionMarker = "";
    {
      const { data: ticketRow } = await supabase
        .from("tickets")
        .select("updated_at")
        .eq("ticket_number", ticket_number)
        .maybeSingle();
      transitionMarker = ticketRow?.updated_at
        ? new Date(ticketRow.updated_at).getTime().toString()
        : Date.now().toString();
    }

    // Route through platform (queued) provider. Templates render React Email;
    // subject/html are ignored on the platform branch.
    const templateName =
      payload.type === "assignment" ? "ticket-assigned" : "ticket-status-update";
    const templateData: Record<string, unknown> =
      payload.type === "assignment"
        ? {
            recipient_name: recipientName,
            ticket_number,
            subject,
            category,
            priority,
            raised_by_name,
            sla_due_at,
          }
        : {
            recipient_name: recipientName,
            ticket_number,
            subject,
            old_status,
            new_status,
            updated_by_name,
            resolution_notes,
          };

    // Stable idempotency: identity is (type, ticket_number, recipient, status,
    // transitionMarker). transitionMarker = tickets.updated_at epoch so a
    // status re-entry (e.g. resolved -> reopened -> resolved) notifies again,
    // while duplicate dispatches within the same transition still dedup.
    const idempotencyKey =
      payload.type === "assignment"
        ? `send-ticket-email:assignment:${ticket_number}:${recipient_user_id}:${transitionMarker}`
        : `send-ticket-email:status_update:${ticket_number}:${recipient_user_id}:${new_status}:${transitionMarker}`;

    const emailResponse = await sendMailSeam({
      provider: "platform",
      to: recipientEmail,
      subject: "",
      html: "",
      templateName,
      templateData,
      idempotencyKey,
    });
    if (!emailResponse.ok) throw new Error(emailResponse.error || `Email failed (${emailResponse.status})`);
    console.log("Ticket email enqueued:", { templateName, recipientEmail });

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending ticket email:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send notification" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
