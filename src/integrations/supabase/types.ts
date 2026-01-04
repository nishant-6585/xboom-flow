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
          created_at: string
          customer_company: string
          customer_name: string
          escalated_at: string | null
          escalated_by: string | null
          escalation_reason: string | null
          id: string
          is_escalated: boolean
          notes: string | null
          product_category: string
          product_code: string
          product_name: string
          quantity: number
          requested_timeline: string | null
          responded_at: string | null
          responded_by: string | null
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
          created_at?: string
          customer_company: string
          customer_name: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_reason?: string | null
          id?: string
          is_escalated?: boolean
          notes?: string | null
          product_category?: string
          product_code: string
          product_name: string
          quantity: number
          requested_timeline?: string | null
          responded_at?: string | null
          responded_by?: string | null
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
          created_at?: string
          customer_company?: string
          customer_name?: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_reason?: string | null
          id?: string
          is_escalated?: boolean
          notes?: string | null
          product_category?: string
          product_code?: string
          product_name?: string
          quantity?: number
          requested_timeline?: string | null
          responded_at?: string | null
          responded_by?: string | null
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
      orders: {
        Row: {
          actual_delivery: string | null
          committed_timeline: string | null
          created_at: string
          created_by: string
          customer_company: string
          customer_name: string
          customer_notes: string | null
          enquiry_id: string | null
          estimated_delivery: string | null
          id: string
          internal_notes: string | null
          procurement_currency: string | null
          procurement_rate: number | null
          product_category: string | null
          product_code: string
          product_name: string
          quantity: number
          sales_person_id: string
          sales_person_name: string
          selling_price: number | null
          status: Database["public"]["Enums"]["order_status"]
          supplier_contact: string | null
          supplier_name: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          actual_delivery?: string | null
          committed_timeline?: string | null
          created_at?: string
          created_by: string
          customer_company: string
          customer_name: string
          customer_notes?: string | null
          enquiry_id?: string | null
          estimated_delivery?: string | null
          id?: string
          internal_notes?: string | null
          procurement_currency?: string | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code: string
          product_name: string
          quantity: number
          sales_person_id: string
          sales_person_name: string
          selling_price?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          supplier_contact?: string | null
          supplier_name?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          actual_delivery?: string | null
          committed_timeline?: string | null
          created_at?: string
          created_by?: string
          customer_company?: string
          customer_name?: string
          customer_notes?: string | null
          enquiry_id?: string | null
          estimated_delivery?: string | null
          id?: string
          internal_notes?: string | null
          procurement_currency?: string | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code?: string
          product_name?: string
          quantity?: number
          sales_person_id?: string
          sales_person_name?: string
          selling_price?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          supplier_contact?: string | null
          supplier_name?: string | null
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
      pending_registrations: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          is_approved: boolean | null
          name: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_create_admin: { Args: never; Returns: boolean }
      count_admins: { Args: never; Returns: number }
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
        | "pending"
        | "confirmed"
        | "procuring"
        | "in_transit"
        | "customs"
        | "delivered"
        | "cancelled"
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
        "pending",
        "confirmed",
        "procuring",
        "in_transit",
        "customs",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
