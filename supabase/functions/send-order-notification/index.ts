import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

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

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const orderData: OrderNotificationRequest = await req.json();
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const formatCurrency = (amount?: number) => {
      if (!amount) return "N/A";
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(amount);
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Order Created</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎉 New Order Created!</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Order #${orderData.orderNumber}</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
          <h2 style="color: #333; margin-top: 0; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Customer Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 140px;">Customer Name:</td>
              <td style="padding: 8px 0;">${orderData.customerName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Company:</td>
              <td style="padding: 8px 0;">${orderData.customerCompany}</td>
            </tr>
            ${orderData.customerEmail ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Email:</td>
              <td style="padding: 8px 0;">${orderData.customerEmail}</td>
            </tr>
            ` : ""}
            ${orderData.shippingAddress ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Shipping Address:</td>
              <td style="padding: 8px 0;">${orderData.shippingAddress}</td>
            </tr>
            ` : ""}
          </table>

          <h2 style="color: #333; margin-top: 25px; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Order Details</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 140px;">Product:</td>
              <td style="padding: 8px 0;">${orderData.productName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Product Code:</td>
              <td style="padding: 8px 0;">${orderData.productCode}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Quantity:</td>
              <td style="padding: 8px 0;">${orderData.quantity}</td>
            </tr>
            ${orderData.sellingPrice ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Unit Price:</td>
              <td style="padding: 8px 0;">${formatCurrency(orderData.sellingPrice)}</td>
            </tr>
            ` : ""}
            ${orderData.totalAmount ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Total Amount:</td>
              <td style="padding: 8px 0; font-size: 18px; color: #667eea; font-weight: bold;">${formatCurrency(orderData.totalAmount)}</td>
            </tr>
            ` : ""}
          </table>

          <h2 style="color: #333; margin-top: 25px; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Additional Information</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 140px;">Sales Person:</td>
              <td style="padding: 8px 0;">${orderData.salesPersonName}</td>
            </tr>
            ${orderData.estimatedDelivery ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Est. Delivery:</td>
              <td style="padding: 8px 0;">${orderData.estimatedDelivery}</td>
            </tr>
            ` : ""}
            ${orderData.paymentTerms ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Payment Terms:</td>
              <td style="padding: 8px 0;">${orderData.paymentTerms}</td>
            </tr>
            ` : ""}
            ${orderData.notes ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold;">Notes:</td>
              <td style="padding: 8px 0;">${orderData.notes}</td>
            </tr>
            ` : ""}
          </table>
        </div>

        <div style="background: #333; color: white; padding: 20px; border-radius: 0 0 10px 10px; text-align: center;">
          <p style="margin: 0; font-size: 14px;">This is an automated notification from XBOOM Flow</p>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.7);">Created at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "XBOOM Flow <onboarding@resend.dev>",
        to: ["nishant.k@xboom.in"],
        subject: `New Order Created: ${orderData.orderNumber} - ${orderData.customerName}`,
        html: emailHtml,
      }),
    });

    const result = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", result);
      throw new Error(result.message || "Failed to send email");
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
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
