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

    // Sanitize all user-provided string inputs before inserting into HTML
    const ticket_number = sanitizeInput(payload.ticket_number, 50);
    const subject = sanitizeInput(payload.subject, 200);
    const old_status = sanitizeInput(payload.old_status, 50);
    const new_status = sanitizeInput(payload.new_status, 50);
    const priority = sanitizeInput(payload.priority, 20);
    const resolution_notes = sanitizeInput(payload.resolution_notes, 2000);
    const assigned_to_name = sanitizeInput(payload.assigned_to_name, 100);
    const raised_by_name = sanitizeInput(payload.raised_by_name, 100);
    const updated_by_name = sanitizeInput(payload.updated_by_name, 100);
    const recipient_user_id = payload.recipient_user_id;
    const sla_due_at = payload.sla_due_at;
    const category = sanitizeInput(payload.category, 100);

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
    const recipientName = escapeHtml(recipientProfile.name || "Team Member");
    const priorityColor = getPriorityColor(priority);
    const priorityEmoji = getPriorityEmoji(priority);

    let emailSubject: string;
    let emailHtml: string;

    if (payload.type === "assignment") {
      emailSubject = `🎫 Ticket Assigned: ${ticket_number} - ${subject}`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎫 New Ticket Assigned</h1>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${recipientName}</strong>,</p>
            <p style="font-size: 16px; margin-bottom: 20px;">A ticket has been assigned to you:</p>
            
            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid ${priorityColor};">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Ticket Number</td>
                  <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${ticket_number}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Subject</td>
                  <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${subject}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Category</td>
                  <td style="padding: 8px 0; font-size: 14px;">${category || 'N/A'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Priority</td>
                  <td style="padding: 8px 0; font-size: 14px;">
                    <span style="background: ${priorityColor}20; color: ${priorityColor}; padding: 4px 12px; border-radius: 20px; font-weight: 600;">
                      ${priorityEmoji} ${priority?.toUpperCase()}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Raised By</td>
                  <td style="padding: 8px 0; font-size: 14px;">${raised_by_name || 'Unknown'}</td>
                </tr>
                ${sla_due_at ? `
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">SLA Due</td>
                  <td style="padding: 8px 0; font-size: 14px; color: #dc2626; font-weight: 600;">${new Date(sla_due_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <p style="font-size: 14px; color: #64748b; margin-top: 20px;">Please review and take action as needed.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated notification from XBOOM Flow</p>
            </div>
          </div>
        </body>
        </html>
      `;
    } else {
      // Status update email
      emailSubject = `📋 Ticket ${ticket_number} - Status Updated to ${formatStatus(new_status || '')}`;
      emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📋 Ticket Status Updated</h1>
          </div>
          
          <div style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="font-size: 16px; margin-bottom: 20px;">Hi <strong>${recipientName}</strong>,</p>
            <p style="font-size: 16px; margin-bottom: 20px;">Your ticket has been updated:</p>
            
            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #10b981;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Ticket Number</td>
                  <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${ticket_number}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Subject</td>
                  <td style="padding: 8px 0; font-weight: 600; font-size: 14px;">${subject}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Status Change</td>
                  <td style="padding: 8px 0; font-size: 14px;">
                    <span style="text-decoration: line-through; color: #94a3b8;">${formatStatus(old_status || '')}</span>
                    <span style="margin: 0 8px;">→</span>
                    <span style="background: #10b98120; color: #059669; padding: 4px 12px; border-radius: 20px; font-weight: 600;">${formatStatus(new_status || '')}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Updated By</td>
                  <td style="padding: 8px 0; font-size: 14px;">${updated_by_name || 'Unknown'}</td>
                </tr>
                ${resolution_notes ? `
                <tr>
                  <td style="padding: 8px 0; color: #64748b; font-size: 14px; vertical-align: top;">Resolution Notes</td>
                  <td style="padding: 8px 0; font-size: 14px;">${resolution_notes}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            ${new_status === 'resolved' || new_status === 'closed' ? `
            <div style="background: #ecfdf5; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
              <p style="color: #059669; font-weight: 600; margin: 0;">✅ This ticket has been ${new_status}!</p>
            </div>
            ` : ''}
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">This is an automated notification from XBOOM Flow</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    const emailResponse = await sendMailSeam({
      to: recipientEmail,
      subject: emailSubject,
      html: emailHtml,
    });
    if (!emailResponse.ok) throw new Error(emailResponse.error || `Email failed (${emailResponse.status})`);
    console.log("Ticket email sent successfully:", emailResponse.id);

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
