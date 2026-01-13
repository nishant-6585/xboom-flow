export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      enquiries: {
        Row: {
          admin_response: string | null
          admin_response_at: string | null
          admin_response_by: string | null
          admin_response_by_name: string | null
          created_at: string
          customer_company: string
          customer_name: string
          escalated_at: string | null
          escalated_by: string | null
          escalated_by_name: string | null
          escalation_reason: string | null
          id: string
          is_escalated: boolean
          lost_reason: string | null
          lost_reason_notes: string | null
          notes: string | null
          order_outcome: string | null
          outcome_updated_at: string | null
          outcome_updated_by: string | null
          product_category: string
          product_code: string
          product_name: string
          quantity: number
          requested_timeline: string | null
          responded_at: string | null
          responded_by: string | null
          responded_by_name: string | null
          response_availability: string | null
          response_lead_time: string | null
          response_notes: string | null
          response_pricing: string | null
          sales_person_id: string | null
          sales_person_name: string
          status: string
          updated_at: string
          urgency: string
        }
        Insert: {
          admin_response?: string | null
          admin_response_at?: string | null
          admin_response_by?: string | null
          admin_response_by_name?: string | null
          created_at?: string
          customer_company: string
          customer_name: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_by_name?: string | null
          escalation_reason?: string | null
          id?: string
          is_escalated?: boolean
          lost_reason?: string | null
          lost_reason_notes?: string | null
          notes?: string | null
          order_outcome?: string | null
          outcome_updated_at?: string | null
          outcome_updated_by?: string | null
          product_category?: string
          product_code: string
          product_name: string
          quantity: number
          requested_timeline?: string | null
          responded_at?: string | null
          responded_by?: string | null
          responded_by_name?: string | null
          response_availability?: string | null
          response_lead_time?: string | null
          response_notes?: string | null
          response_pricing?: string | null
          sales_person_id?: string | null
          sales_person_name: string
          status?: string
          updated_at?: string
          urgency: string
        }
        Update: {
          admin_response?: string | null
          admin_response_at?: string | null
          admin_response_by?: string | null
          admin_response_by_name?: string | null
          created_at?: string
          customer_company?: string
          customer_name?: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_by_name?: string | null
          escalation_reason?: string | null
          id?: string
          is_escalated?: boolean
          lost_reason?: string | null
          lost_reason_notes?: string | null
          notes?: string | null
          order_outcome?: string | null
          outcome_updated_at?: string | null
          outcome_updated_by?: string | null
          product_category?: string
          product_code?: string
          product_name?: string
          quantity?: number
          requested_timeline?: string | null
          responded_at?: string | null
          responded_by?: string | null
          responded_by_name?: string | null
          response_availability?: string | null
          response_lead_time?: string | null
          response_notes?: string | null
          response_pricing?: string | null
          sales_person_id?: string | null
          sales_person_name?: string
          status?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string
          current_stock: number
          id: string
          min_stock_level: number | null
          notes: string | null
          product_category: string
          product_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stock?: number
          id?: string
          min_stock_level?: number | null
          notes?: string | null
          product_category?: string
          product_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stock?: number
          id?: string
          min_stock_level?: number | null
          notes?: string | null
          product_category?: string
          product_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_procurements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inventory_id: string | null
          notes: string | null
          payment_due_date: string | null
          payment_status: string
          payment_terms: string | null
          procurement_date: string
          product_category: string
          product_code: string | null
          product_name: string
          quantity: number
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_id?: string | null
          notes?: string | null
          payment_due_date?: string | null
          payment_status?: string
          payment_terms?: string | null
          procurement_date?: string
          product_category?: string
          product_code?: string | null
          product_name: string
          quantity?: number
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_id?: string | null
          notes?: string | null
          payment_due_date?: string | null
          payment_status?: string
          payment_terms?: string | null
          procurement_date?: string
          product_category?: string
          product_code?: string | null
          product_name?: string
          quantity?: number
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_procurements_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_procurements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inventory_id: string
          inventory_procurement_id: string | null
          notes: string | null
          order_id: string | null
          order_item_id: string | null
          quantity: number
          reference_number: string | null
          transaction_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_id: string
          inventory_procurement_id?: string | null
          notes?: string | null
          order_id?: string | null
          order_item_id?: string | null
          quantity: number
          reference_number?: string | null
          transaction_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_id?: string
          inventory_procurement_id?: string | null
          notes?: string | null
          order_id?: string | null
          order_item_id?: string | null
          quantity?: number
          reference_number?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_inventory_procurement_id_fkey"
            columns: ["inventory_procurement_id"]
            isOneToOne: false
            referencedRelation: "inventory_procurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          order_id: string | null
          target_role: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          order_id?: string | null
          target_role?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          order_id?: string | null
          target_role?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          fulfilled_from_stock: boolean | null
          id: string
          notes: string | null
          order_id: string
          procurement_date: string | null
          procurement_rate: number | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          quantity_procured: number | null
          status: string
          supplier_id: string | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          fulfilled_from_stock?: boolean | null
          id?: string
          notes?: string | null
          order_id: string
          procurement_date?: string | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code?: string | null
          product_name: string
          quantity?: number
          quantity_procured?: number | null
          status?: string
          supplier_id?: string | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          fulfilled_from_stock?: boolean | null
          id?: string
          notes?: string | null
          order_id?: string
          procurement_date?: string | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          quantity_procured?: number | null
          status?: string
          supplier_id?: string | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          actual_delivery: string | null
          amount_paid: number | null
          committed_timeline: string | null
          created_at: string
          created_by: string
          customer_company: string
          customer_email: string | null
          customer_name: string
          customer_notes: string | null
          customer_type: string | null
          delivery_charges: number | null
          enquiry_id: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalation_reason: string | null
          estimated_delivery: string | null
          id: string
          internal_notes: string | null
          invoice_url: string | null
          is_escalated: boolean
          is_refund_requested: boolean
          last_reminder_sent_at: string | null
          lead_source: string | null
          lost_reason: string | null
          lost_reason_notes: string | null
          order_number: string | null
          order_outcome: string | null
          order_type: string | null
          outcome_updated_at: string | null
          outcome_updated_by: string | null
          payment_due_date: string | null
          payment_status: string | null
          payment_terms: string | null
          po_url: string | null
          priority: number | null
          procurement_currency: string | null
          procurement_rate: number | null
          product_category: string | null
          product_code: string
          product_name: string
          quantity: number
          refund_reason: string | null
          refund_requested_at: string | null
          refund_requested_by: string | null
          refund_status: string | null
          sales_notes: string | null
          sales_person_id: string
          sales_person_name: string
          selling_price: number | null
          shipping_address: string | null
          status: Database["public"]["Enums"]["order_status"]
          supplier_contact: string | null
          supplier_id: string | null
          supplier_name: string | null
          supplier_payment_due_date: string | null
          supplier_payment_terms: string | null
          total_sales_amount: number | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          actual_delivery?: string | null
          amount_paid?: number | null
          committed_timeline?: string | null
          created_at?: string
          created_by: string
          customer_company: string
          customer_email?: string | null
          customer_name: string
          customer_notes?: string | null
          customer_type?: string | null
          delivery_charges?: number | null
          enquiry_id?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_reason?: string | null
          estimated_delivery?: string | null
          id?: string
          internal_notes?: string | null
          invoice_url?: string | null
          is_escalated?: boolean
          is_refund_requested?: boolean
          last_reminder_sent_at?: string | null
          lead_source?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          order_number?: string | null
          order_outcome?: string | null
          order_type?: string | null
          outcome_updated_at?: string | null
          outcome_updated_by?: string | null
          payment_due_date?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          po_url?: string | null
          priority?: number | null
          procurement_currency?: string | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code: string
          product_name: string
          quantity: number
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_requested_by?: string | null
          refund_status?: string | null
          sales_notes?: string | null
          sales_person_id: string
          sales_person_name: string
          selling_price?: number | null
          shipping_address?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          supplier_contact?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_payment_due_date?: string | null
          supplier_payment_terms?: string | null
          total_sales_amount?: number | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          actual_delivery?: string | null
          amount_paid?: number | null
          committed_timeline?: string | null
          created_at?: string
          created_by?: string
          customer_company?: string
          customer_email?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_type?: string | null
          delivery_charges?: number | null
          enquiry_id?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_reason?: string | null
          estimated_delivery?: string | null
          id?: string
          internal_notes?: string | null
          invoice_url?: string | null
          is_escalated?: boolean
          is_refund_requested?: boolean
          last_reminder_sent_at?: string | null
          lead_source?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          order_number?: string | null
          order_outcome?: string | null
          order_type?: string | null
          outcome_updated_at?: string | null
          outcome_updated_by?: string | null
          payment_due_date?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          po_url?: string | null
          priority?: number | null
          procurement_currency?: string | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code?: string
          product_name?: string
          quantity?: number
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_requested_by?: string | null
          refund_status?: string | null
          sales_notes?: string | null
          sales_person_id?: string
          sales_person_name?: string
          selling_price?: number | null
          shipping_address?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          supplier_contact?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          supplier_payment_due_date?: string | null
          supplier_payment_terms?: string | null
          total_sales_amount?: number | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          order_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_url: string
          status: string
          submitted_at: string
          submitted_by: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_url: string
          status?: string
          submitted_at?: string
          submitted_by: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_url?: string
          status?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_orders: {
        Row: {
          created_at: string
          created_by: string
          customer_company: string
          customer_email: string | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          enquiry_id: string | null
          expected_closure_date: string | null
          expected_price: number | null
          id: string
          internal_notes: string | null
          lead_source: string | null
          priority: number | null
          probability: number | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          sales_person_id: string
          sales_person_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          customer_company: string
          customer_email?: string | null
          customer_name: string
          customer_notes?: string | null
          customer_phone?: string | null
          enquiry_id?: string | null
          expected_closure_date?: string | null
          expected_price?: number | null
          id?: string
          internal_notes?: string | null
          lead_source?: string | null
          priority?: number | null
          probability?: number | null
          product_category?: string | null
          product_code?: string | null
          product_name: string
          quantity?: number
          sales_person_id: string
          sales_person_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_company?: string
          customer_email?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string | null
          enquiry_id?: string | null
          expected_closure_date?: string | null
          expected_price?: number | null
          id?: string
          internal_notes?: string | null
          lead_source?: string | null
          priority?: number | null
          probability?: number | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          sales_person_id?: string
          sales_person_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_orders_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelist: {
        Row: {
          availability: string | null
          brand: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          dealer_price: number | null
          description: string | null
          id: string
          lead_time: string | null
          min_order_quantity: number | null
          notes: string | null
          product_category: string
          product_name: string
          unit_price: number | null
          updated_at: string
          updated_by: string | null
          website_price: number | null
        }
        Insert: {
          availability?: string | null
          brand?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          dealer_price?: number | null
          description?: string | null
          id?: string
          lead_time?: string | null
          min_order_quantity?: number | null
          notes?: string | null
          product_category?: string
          product_name: string
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          website_price?: number | null
        }
        Update: {
          availability?: string | null
          brand?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          dealer_price?: number | null
          description?: string | null
          id?: string
          lead_time?: string | null
          min_order_quantity?: number | null
          notes?: string | null
          product_category?: string
          product_name?: string
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          website_price?: number | null
        }
        Relationships: []
      }
      procurement_payment_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          id: string
          order_id: string
          rejection_reason: string | null
          request_notes: string | null
          requested_by: string
          requested_by_name: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          id?: string
          order_id: string
          rejection_reason?: string | null
          request_notes?: string | null
          requested_by: string
          requested_by_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          id?: string
          order_id?: string
          rejection_reason?: string | null
          request_notes?: string | null
          requested_by?: string
          requested_by_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procurement_payment_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_approved: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_approved?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_approved?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          inventory_procurement_id: string | null
          notes: string | null
          order_id: string | null
          payment_date: string
          payment_mode: string | null
          payment_type: string
          reference_number: string | null
          screenshot_urls: string[] | null
          supplier_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_procurement_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_date?: string
          payment_mode?: string | null
          payment_type?: string
          reference_number?: string | null
          screenshot_urls?: string[] | null
          supplier_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_procurement_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_date?: string
          payment_mode?: string | null
          payment_type?: string
          reference_number?: string | null
          screenshot_urls?: string[] | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_inventory_procurement_id_fkey"
            columns: ["inventory_procurement_id"]
            isOneToOne: false
            referencedRelation: "inventory_procurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          brand_name: string | null
          city: string | null
          contact_name: string
          created_at: string
          created_by: string | null
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          mobile: string | null
          name: string
          notes: string | null
          phone: string | null
          preference: Database["public"]["Enums"]["supplier_preference"]
          product_category: string
          products: string[] | null
          status: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          brand_name?: string | null
          city?: string | null
          contact_name: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          preference?: Database["public"]["Enums"]["supplier_preference"]
          product_category?: string
          products?: string[] | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          brand_name?: string | null
          city?: string | null
          contact_name?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          mobile?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          preference?: Database["public"]["Enums"]["supplier_preference"]
          product_category?: string
          products?: string[] | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_create_admin: { Args: never; Returns: boolean }
      count_admins: { Args: never; Returns: number }
      generate_payment_reminders: { Args: never; Returns: undefined }
      get_pending_registrations: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          is_approved: boolean
          name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      get_sales_team: {
        Args: never
        Returns: {
          name: string
          user_id: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "sales" | "supply_chain" | "admin"
      order_status:
        | "po_received"
        | "payment_received"
        | "partial_payment_received"
        | "procurement_to_plan"
        | "procurement_in_process"
        | "procurement_done"
        | "delivery_done"
        | "cancelled"
      supplier_preference: "low" | "medium" | "high"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["sales", "supply_chain", "admin"],
      order_status: [
        "po_received",
        "payment_received",
        "partial_payment_received",
        "procurement_to_plan",
        "procurement_in_process",
        "procurement_done",
        "delivery_done",
        "cancelled",
      ],
      supplier_preference: ["low", "medium", "high"],
    },
  },
} as const
