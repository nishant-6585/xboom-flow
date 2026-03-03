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
      admin_signatures: {
        Row: {
          admin_id: string
          id: string
          signature_url: string
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          admin_id: string
          id?: string
          signature_url: string
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          admin_id?: string
          id?: string
          signature_url?: string
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      admin_whitelist: {
        Row: {
          added_at: string | null
          added_by: string | null
          email: string
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          email: string
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          email?: string
        }
        Relationships: []
      }
      ai_scoring_logs: {
        Row: {
          confidence: number | null
          created_at: string
          enquiry_id: string
          error_message: string | null
          id: string
          priority_level: string | null
          probability: number | null
          raw_response: Json | null
          score: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          enquiry_id: string
          error_message?: string | null
          id?: string
          priority_level?: string | null
          probability?: number | null
          raw_response?: Json | null
          score?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          enquiry_id?: string
          error_message?: string | null
          id?: string
          priority_level?: string | null
          probability?: number | null
          raw_response?: Json | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_scoring_logs_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_audit_log: {
        Row: {
          attendance_log_id: string
          employee_id: string
          event_time: string
          event_type: string
          id: string
          metadata: Json | null
          new_checkout_time: string | null
          notes: string | null
          old_checkout_time: string | null
          performed_by: string | null
          performed_by_name: string | null
        }
        Insert: {
          attendance_log_id: string
          employee_id: string
          event_time?: string
          event_type: string
          id?: string
          metadata?: Json | null
          new_checkout_time?: string | null
          notes?: string | null
          old_checkout_time?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Update: {
          attendance_log_id?: string
          employee_id?: string
          event_time?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          new_checkout_time?: string | null
          notes?: string | null
          old_checkout_time?: string | null
          performed_by?: string | null
          performed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_audit_log_attendance_log_id_fkey"
            columns: ["attendance_log_id"]
            isOneToOne: false
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_audit_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_breaks: {
        Row: {
          attendance_id: string
          break_duration_minutes: number | null
          break_end_time: string | null
          break_start_time: string
          created_at: string
          id: string
        }
        Insert: {
          attendance_id: string
          break_duration_minutes?: number | null
          break_end_time?: string | null
          break_start_time: string
          created_at?: string
          id?: string
        }
        Update: {
          attendance_id?: string
          break_duration_minutes?: number | null
          break_end_time?: string | null
          break_start_time?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_breaks_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_correction_requests: {
        Row: {
          attendance_log_id: string
          created_at: string
          current_check_in_time: string | null
          current_check_out_time: string | null
          employee_id: string
          id: string
          reason: string
          requested_by: string
          requested_by_name: string
          requested_check_in_time: string | null
          requested_check_out_time: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attendance_log_id: string
          created_at?: string
          current_check_in_time?: string | null
          current_check_out_time?: string | null
          employee_id: string
          id?: string
          reason: string
          requested_by: string
          requested_by_name: string
          requested_check_in_time?: string | null
          requested_check_out_time?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attendance_log_id?: string
          created_at?: string
          current_check_in_time?: string | null
          current_check_out_time?: string | null
          employee_id?: string
          id?: string
          reason?: string
          requested_by?: string
          requested_by_name?: string
          requested_check_in_time?: string | null
          requested_check_out_time?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_correction_requests_attendance_log_id_fkey"
            columns: ["attendance_log_id"]
            isOneToOne: false
            referencedRelation: "attendance_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_logs: {
        Row: {
          approved_by: string | null
          approved_by_name: string | null
          auto_checkout_applied: boolean | null
          auto_checkout_time: string | null
          break_end_time: string | null
          break_start_time: string | null
          check_in_time: string | null
          check_out_time: string | null
          checkout_missing: boolean | null
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          date: string
          employee_id: string
          id: string
          is_provisional_checkout: boolean | null
          location: string | null
          notes: string | null
          reconciliation_status: string
          source: string
          status: string | null
          total_break_minutes: number | null
          updated_at: string
          working_hours: number | null
        }
        Insert: {
          approved_by?: string | null
          approved_by_name?: string | null
          auto_checkout_applied?: boolean | null
          auto_checkout_time?: string | null
          break_end_time?: string | null
          break_start_time?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          checkout_missing?: boolean | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          date?: string
          employee_id: string
          id?: string
          is_provisional_checkout?: boolean | null
          location?: string | null
          notes?: string | null
          reconciliation_status?: string
          source?: string
          status?: string | null
          total_break_minutes?: number | null
          updated_at?: string
          working_hours?: number | null
        }
        Update: {
          approved_by?: string | null
          approved_by_name?: string | null
          auto_checkout_applied?: boolean | null
          auto_checkout_time?: string | null
          break_end_time?: string | null
          break_start_time?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          checkout_missing?: boolean | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          is_provisional_checkout?: boolean | null
          location?: string | null
          notes?: string | null
          reconciliation_status?: string
          source?: string
          status?: string | null
          total_break_minutes?: number | null
          updated_at?: string
          working_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_notifications_log: {
        Row: {
          date: string
          id: string
          reference_id: string | null
          triggered_at: string
          type: string
          user_id: string
        }
        Insert: {
          date?: string
          id?: string
          reference_id?: string | null
          triggered_at?: string
          type: string
          user_id: string
        }
        Update: {
          date?: string
          id?: string
          reference_id?: string | null
          triggered_at?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance_policy_settings: {
        Row: {
          auto_checkout_hours: number
          break_severe_minutes: number
          break_warning_minutes: number
          created_at: string
          employee_nudge_enabled: boolean
          grace_period_minutes: number
          hr_severe_alert_enabled: boolean
          id: string
          late_alert_enabled: boolean
          no_checkout_warning_enabled: boolean
          updated_at: string
          work_start_time: string
        }
        Insert: {
          auto_checkout_hours?: number
          break_severe_minutes?: number
          break_warning_minutes?: number
          created_at?: string
          employee_nudge_enabled?: boolean
          grace_period_minutes?: number
          hr_severe_alert_enabled?: boolean
          id?: string
          late_alert_enabled?: boolean
          no_checkout_warning_enabled?: boolean
          updated_at?: string
          work_start_time?: string
        }
        Update: {
          auto_checkout_hours?: number
          break_severe_minutes?: number
          break_warning_minutes?: number
          created_at?: string
          employee_nudge_enabled?: boolean
          grace_period_minutes?: number
          hr_severe_alert_enabled?: boolean
          id?: string
          late_alert_enabled?: boolean
          no_checkout_warning_enabled?: boolean
          updated_at?: string
          work_start_time?: string
        }
        Relationships: []
      }
      buyback_drones: {
        Row: {
          buyback_date: string
          buyback_price: number
          buyer_contact: string | null
          buyer_name: string | null
          condition: string
          created_at: string
          created_by: string | null
          drone_category: string
          drone_model: string
          id: string
          profit_loss: number | null
          seller_contact: string
          seller_name: string
          selling_date: string | null
          selling_price: number | null
          serial_number: string
          stock_status: string
          updated_at: string
        }
        Insert: {
          buyback_date?: string
          buyback_price: number
          buyer_contact?: string | null
          buyer_name?: string | null
          condition: string
          created_at?: string
          created_by?: string | null
          drone_category: string
          drone_model: string
          id?: string
          profit_loss?: number | null
          seller_contact: string
          seller_name: string
          selling_date?: string | null
          selling_price?: number | null
          serial_number: string
          stock_status?: string
          updated_at?: string
        }
        Update: {
          buyback_date?: string
          buyback_price?: number
          buyer_contact?: string | null
          buyer_name?: string | null
          condition?: string
          created_at?: string
          created_by?: string | null
          drone_category?: string
          drone_model?: string
          id?: string
          profit_loss?: number | null
          seller_contact?: string
          seller_name?: string
          selling_date?: string | null
          selling_price?: number | null
          serial_number?: string
          stock_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidate_documents: {
        Row: {
          candidate_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          candidate_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          candidate_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidate_documents_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          application_source:
            | Database["public"]["Enums"]["application_source"]
            | null
          candidate_number: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          current_company: string | null
          current_ctc: number | null
          current_designation: string | null
          department: string | null
          email: string
          employment_type: Database["public"]["Enums"]["employment_type"] | null
          expected_ctc: number | null
          final_status: Database["public"]["Enums"]["final_status"] | null
          follow_up_date: string | null
          full_name: string
          id: string
          interview_stage: Database["public"]["Enums"]["interview_stage"] | null
          job_role_applied: string | null
          joining_date: string | null
          lifecycle_status: Database["public"]["Enums"]["candidate_lifecycle_status"]
          location: string | null
          location_city: string | null
          location_state: string | null
          notes: string | null
          notice_period_days: number | null
          offer_letter_issued: boolean | null
          phone: string | null
          primary_skills: string[] | null
          recruiter_id: string | null
          recruiter_name: string | null
          rejection_reason: string | null
          relevant_experience_years: number | null
          remarks: string | null
          resume_url: string | null
          screening_status:
            | Database["public"]["Enums"]["screening_status"]
            | null
          source: string | null
          status: Database["public"]["Enums"]["candidate_status"]
          updated_at: string
          years_of_experience: number | null
        }
        Insert: {
          application_source?:
            | Database["public"]["Enums"]["application_source"]
            | null
          candidate_number?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          current_company?: string | null
          current_ctc?: number | null
          current_designation?: string | null
          department?: string | null
          email: string
          employment_type?:
            | Database["public"]["Enums"]["employment_type"]
            | null
          expected_ctc?: number | null
          final_status?: Database["public"]["Enums"]["final_status"] | null
          follow_up_date?: string | null
          full_name: string
          id?: string
          interview_stage?:
            | Database["public"]["Enums"]["interview_stage"]
            | null
          job_role_applied?: string | null
          joining_date?: string | null
          lifecycle_status?: Database["public"]["Enums"]["candidate_lifecycle_status"]
          location?: string | null
          location_city?: string | null
          location_state?: string | null
          notes?: string | null
          notice_period_days?: number | null
          offer_letter_issued?: boolean | null
          phone?: string | null
          primary_skills?: string[] | null
          recruiter_id?: string | null
          recruiter_name?: string | null
          rejection_reason?: string | null
          relevant_experience_years?: number | null
          remarks?: string | null
          resume_url?: string | null
          screening_status?:
            | Database["public"]["Enums"]["screening_status"]
            | null
          source?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          updated_at?: string
          years_of_experience?: number | null
        }
        Update: {
          application_source?:
            | Database["public"]["Enums"]["application_source"]
            | null
          candidate_number?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          current_company?: string | null
          current_ctc?: number | null
          current_designation?: string | null
          department?: string | null
          email?: string
          employment_type?:
            | Database["public"]["Enums"]["employment_type"]
            | null
          expected_ctc?: number | null
          final_status?: Database["public"]["Enums"]["final_status"] | null
          follow_up_date?: string | null
          full_name?: string
          id?: string
          interview_stage?:
            | Database["public"]["Enums"]["interview_stage"]
            | null
          job_role_applied?: string | null
          joining_date?: string | null
          lifecycle_status?: Database["public"]["Enums"]["candidate_lifecycle_status"]
          location?: string | null
          location_city?: string | null
          location_state?: string | null
          notes?: string | null
          notice_period_days?: number | null
          offer_letter_issued?: boolean | null
          phone?: string | null
          primary_skills?: string[] | null
          recruiter_id?: string | null
          recruiter_name?: string | null
          rejection_reason?: string | null
          relevant_experience_years?: number | null
          remarks?: string | null
          resume_url?: string | null
          screening_status?:
            | Database["public"]["Enums"]["screening_status"]
            | null
          source?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          updated_at?: string
          years_of_experience?: number | null
        }
        Relationships: []
      }
      customer_testimonials: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          customer_company: string | null
          customer_name: string
          id: string
          is_approved: boolean | null
          order_id: string | null
          rating: number | null
          submitted_by: string
          submitted_by_name: string
          testimonial: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          customer_company?: string | null
          customer_name: string
          id?: string
          is_approved?: boolean | null
          order_id?: string | null
          rating?: number | null
          submitted_by: string
          submitted_by_name: string
          testimonial: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          customer_company?: string | null
          customer_name?: string
          id?: string
          is_approved?: boolean | null
          order_id?: string | null
          rating?: number | null
          submitted_by?: string
          submitted_by_name?: string
          testimonial?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_testimonials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      demand_forecasts: {
        Row: {
          avg_consumption_30d: number | null
          avg_consumption_60d: number | null
          avg_consumption_90d: number | null
          confidence: string
          created_at: string
          current_stock: number | null
          days_to_stockout: number | null
          forecast_date: string
          historical_data_days: number
          id: string
          model_version: string
          predicted_daily_demand: number
          product_category: string | null
          product_id: string
          product_name: string
          recommended_reorder_qty: number | null
        }
        Insert: {
          avg_consumption_30d?: number | null
          avg_consumption_60d?: number | null
          avg_consumption_90d?: number | null
          confidence?: string
          created_at?: string
          current_stock?: number | null
          days_to_stockout?: number | null
          forecast_date?: string
          historical_data_days?: number
          id?: string
          model_version?: string
          predicted_daily_demand?: number
          product_category?: string | null
          product_id: string
          product_name: string
          recommended_reorder_qty?: number | null
        }
        Update: {
          avg_consumption_30d?: number | null
          avg_consumption_60d?: number | null
          avg_consumption_90d?: number | null
          confidence?: string
          created_at?: string
          current_stock?: number | null
          days_to_stockout?: number | null
          forecast_date?: string
          historical_data_days?: number
          id?: string
          model_version?: string
          predicted_daily_demand?: number
          product_category?: string | null
          product_id?: string
          product_name?: string
          recommended_reorder_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_forecasts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
        }
        Relationships: []
      }
      drone_repair_enquiries: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          city: string | null
          created_at: string
          customer_name: string
          drone_category: string
          drone_model: string
          email: string | null
          id: string
          is_under_warranty: boolean | null
          issue_description: string
          issue_type: string
          phone: string
          preferred_date: string | null
          purchase_date: string | null
          serial_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          city?: string | null
          created_at?: string
          customer_name: string
          drone_category?: string
          drone_model: string
          email?: string | null
          id?: string
          is_under_warranty?: boolean | null
          issue_description: string
          issue_type?: string
          phone: string
          preferred_date?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          city?: string | null
          created_at?: string
          customer_name?: string
          drone_category?: string
          drone_model?: string
          email?: string | null
          id?: string
          is_under_warranty?: boolean | null
          issue_description?: string
          issue_type?: string
          phone?: string
          preferred_date?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      duplicate_alerts: {
        Row: {
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          enquiry_id: string
          id: string
          is_dismissed: boolean
          match_type: string
          matched_enquiry_id: string
          similarity_score: number
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          enquiry_id: string
          id?: string
          is_dismissed?: boolean
          match_type: string
          matched_enquiry_id: string
          similarity_score?: number
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          enquiry_id?: string
          id?: string
          is_dismissed?: boolean
          match_type?: string
          matched_enquiry_id?: string
          similarity_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "duplicate_alerts_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplicate_alerts_matched_enquiry_id_fkey"
            columns: ["matched_enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_history: {
        Row: {
          edited_at: string
          edited_by: string
          edited_by_name: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          edited_at?: string
          edited_by: string
          edited_by_name: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          edited_at?: string
          edited_by?: string
          edited_by_name?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      employee_assets: {
        Row: {
          asset_name: string
          asset_type: Database["public"]["Enums"]["asset_type"]
          assigned_by: string | null
          assigned_by_name: string | null
          assigned_date: string
          brand: string | null
          condition_on_assign: string | null
          condition_on_return: string | null
          created_at: string
          employee_id: string | null
          id: string
          imei_number: string | null
          model: string | null
          notes: string | null
          phone_number: string | null
          purchase_date: string | null
          purchase_price: number | null
          return_date: string | null
          serial_number: string | null
          sim_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
        }
        Insert: {
          asset_name: string
          asset_type: Database["public"]["Enums"]["asset_type"]
          assigned_by?: string | null
          assigned_by_name?: string | null
          assigned_date?: string
          brand?: string | null
          condition_on_assign?: string | null
          condition_on_return?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          imei_number?: string | null
          model?: string | null
          notes?: string | null
          phone_number?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          return_date?: string | null
          serial_number?: string | null
          sim_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Update: {
          asset_name?: string
          asset_type?: Database["public"]["Enums"]["asset_type"]
          assigned_by?: string | null
          assigned_by_name?: string | null
          assigned_date?: string
          brand?: string | null
          condition_on_assign?: string | null
          condition_on_return?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          imei_number?: string | null
          model?: string | null
          notes?: string | null
          phone_number?: string | null
          purchase_date?: string | null
          purchase_price?: number | null
          return_date?: string | null
          serial_number?: string | null
          sim_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_assets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kpi_progress: {
        Row: {
          achieved_value: number
          attachment_url: string | null
          created_at: string
          id: string
          kpi_id: string
          progress_notes: string | null
          updated_by: string
          updated_by_name: string
        }
        Insert: {
          achieved_value: number
          attachment_url?: string | null
          created_at?: string
          id?: string
          kpi_id: string
          progress_notes?: string | null
          updated_by: string
          updated_by_name: string
        }
        Update: {
          achieved_value?: number
          attachment_url?: string | null
          created_at?: string
          id?: string
          kpi_id?: string
          progress_notes?: string | null
          updated_by?: string
          updated_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_kpi_progress_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "employee_kpis"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kpis: {
        Row: {
          achieved_value: number | null
          achievement_percentage: number | null
          amber_threshold: number
          created_at: string
          created_by: string
          created_by_name: string
          department: string | null
          description: string | null
          due_date: string
          employee_id: string
          green_threshold: number
          id: string
          measurement_unit: Database["public"]["Enums"]["kpi_measurement_unit"]
          month: number
          priority: Database["public"]["Enums"]["kpi_priority"]
          status: Database["public"]["Enums"]["kpi_rag_status"]
          target_value: number
          title: string
          updated_at: string
          weightage: number
          year: number
        }
        Insert: {
          achieved_value?: number | null
          achievement_percentage?: number | null
          amber_threshold?: number
          created_at?: string
          created_by: string
          created_by_name: string
          department?: string | null
          description?: string | null
          due_date: string
          employee_id: string
          green_threshold?: number
          id?: string
          measurement_unit?: Database["public"]["Enums"]["kpi_measurement_unit"]
          month: number
          priority?: Database["public"]["Enums"]["kpi_priority"]
          status?: Database["public"]["Enums"]["kpi_rag_status"]
          target_value: number
          title: string
          updated_at?: string
          weightage?: number
          year: number
        }
        Update: {
          achieved_value?: number | null
          achievement_percentage?: number | null
          amber_threshold?: number
          created_at?: string
          created_by?: string
          created_by_name?: string
          department?: string | null
          description?: string | null
          due_date?: string
          employee_id?: string
          green_threshold?: number
          id?: string
          measurement_unit?: Database["public"]["Enums"]["kpi_measurement_unit"]
          month?: number
          priority?: Database["public"]["Enums"]["kpi_priority"]
          status?: Database["public"]["Enums"]["kpi_rag_status"]
          target_value?: number
          title?: string
          updated_at?: string
          weightage?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_kpis_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_roles_responsibilities: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string
          effective_date: string
          employee_id: string
          id: string
          responsibilities: string
          role_title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name: string
          effective_date?: string
          employee_id: string
          id?: string
          responsibilities: string
          role_title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string
          effective_date?: string
          employee_id?: string
          id?: string
          responsibilities?: string
          role_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_roles_responsibilities_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department: string
          id: string
          is_active: boolean | null
          manager_id: string | null
          monthly_attendance_target: number | null
          name: string
          role: string | null
          shift_end_time: string | null
          shift_start_time: string | null
          shift_type: string | null
          updated_at: string
          user_id: string | null
          weekly_hours_target: number | null
          work_location: string | null
        }
        Insert: {
          created_at?: string
          department?: string
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          monthly_attendance_target?: number | null
          name: string
          role?: string | null
          shift_end_time?: string | null
          shift_start_time?: string | null
          shift_type?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_hours_target?: number | null
          work_location?: string | null
        }
        Update: {
          created_at?: string
          department?: string
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          monthly_attendance_target?: number | null
          name?: string
          role?: string | null
          shift_end_time?: string | null
          shift_start_time?: string | null
          shift_type?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_hours_target?: number | null
          work_location?: string | null
        }
        Relationships: []
      }
      enquiries: {
        Row: {
          admin_response: string | null
          admin_response_at: string | null
          admin_response_by: string | null
          admin_response_by_name: string | null
          ai_confidence: number | null
          ai_last_scored_at: string | null
          ai_priority_level: string | null
          ai_score: number | null
          created_at: string
          customer_company: string
          customer_name: string
          customer_state: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalated_by_name: string | null
          escalation_reason: string | null
          id: string
          is_escalated: boolean
          is_mega_deal: boolean | null
          lead_temperature: string | null
          lost_reason: string | null
          lost_reason_notes: string | null
          notes: string | null
          order_outcome: string | null
          outcome_updated_at: string | null
          outcome_updated_by: string | null
          probability_to_close: number | null
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
          ai_confidence?: number | null
          ai_last_scored_at?: string | null
          ai_priority_level?: string | null
          ai_score?: number | null
          created_at?: string
          customer_company: string
          customer_name: string
          customer_state?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_by_name?: string | null
          escalation_reason?: string | null
          id?: string
          is_escalated?: boolean
          is_mega_deal?: boolean | null
          lead_temperature?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          notes?: string | null
          order_outcome?: string | null
          outcome_updated_at?: string | null
          outcome_updated_by?: string | null
          probability_to_close?: number | null
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
          ai_confidence?: number | null
          ai_last_scored_at?: string | null
          ai_priority_level?: string | null
          ai_score?: number | null
          created_at?: string
          customer_company?: string
          customer_name?: string
          customer_state?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_by_name?: string | null
          escalation_reason?: string | null
          id?: string
          is_escalated?: boolean
          is_mega_deal?: boolean | null
          lead_temperature?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          notes?: string | null
          order_outcome?: string | null
          outcome_updated_at?: string | null
          outcome_updated_by?: string | null
          probability_to_close?: number | null
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
      enquiry_items: {
        Row: {
          created_at: string
          enquiry_id: string
          gst_amount: number | null
          gst_percent: number | null
          id: string
          notes: string | null
          price_includes_gst: boolean | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          total_amount: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          enquiry_id: string
          gst_amount?: number | null
          gst_percent?: number | null
          id?: string
          notes?: string | null
          price_includes_gst?: boolean | null
          product_category?: string | null
          product_code?: string | null
          product_name: string
          quantity?: number
          total_amount?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          enquiry_id?: string
          gst_amount?: number | null
          gst_percent?: number | null
          id?: string
          notes?: string | null
          price_includes_gst?: boolean | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          total_amount?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_items_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_tags: {
        Row: {
          added_at: string | null
          added_by: string | null
          custom_tag: string | null
          enquiry_id: string
          id: string
          tag_id: string | null
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          custom_tag?: string | null
          enquiry_id: string
          id?: string
          tag_id?: string | null
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          custom_tag?: string | null
          enquiry_id?: string
          id?: string
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_tags_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      expected_payments: {
        Row: {
          actual_received_date: string | null
          amount: number
          created_at: string
          created_by: string
          created_by_name: string
          customer_company: string | null
          customer_name: string
          expected_date: string
          id: string
          notes: string | null
          order_number: string | null
          source_id: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_received_date?: string | null
          amount: number
          created_at?: string
          created_by: string
          created_by_name: string
          customer_company?: string | null
          customer_name: string
          expected_date: string
          id?: string
          notes?: string | null
          order_number?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_received_date?: string | null
          amount?: number
          created_at?: string
          created_by?: string
          created_by_name?: string
          customer_company?: string | null
          customer_name?: string
          expected_date?: string
          id?: string
          notes?: string | null
          order_number?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      expense_order_links: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          order_id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          order_id: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_order_links_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_order_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_procurement_links: {
        Row: {
          created_at: string
          expense_id: string
          id: string
          procurement_id: string
        }
        Insert: {
          created_at?: string
          expense_id: string
          id?: string
          procurement_id: string
        }
        Update: {
          created_at?: string
          expense_id?: string
          id?: string
          procurement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_procurement_links_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_procurement_links_procurement_id_fkey"
            columns: ["procurement_id"]
            isOneToOne: false
            referencedRelation: "inventory_procurements"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          amount_paid: number | null
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          created_by: string
          created_by_name: string
          description: string | null
          expense_date: string
          expense_type: string
          id: string
          notes: string | null
          paid_from_petty_cash: number | null
          payment_mode: string | null
          payment_notes: string | null
          receipt_url: string | null
          status: string
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          amount: number
          amount_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          created_by: string
          created_by_name: string
          description?: string | null
          expense_date?: string
          expense_type: string
          id?: string
          notes?: string | null
          paid_from_petty_cash?: number | null
          payment_mode?: string | null
          payment_notes?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          amount_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          description?: string | null
          expense_date?: string
          expense_type?: string
          id?: string
          notes?: string | null
          paid_from_petty_cash?: number | null
          payment_mode?: string | null
          payment_notes?: string | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: []
      }
      forecast_accuracy_log: {
        Row: {
          actual_demand: number
          forecast_id: string | null
          id: string
          logged_at: string
          mape_percent: number | null
          measurement_period_days: number
          model_version: string
          predicted_demand: number
          product_id: string
          product_name: string
        }
        Insert: {
          actual_demand: number
          forecast_id?: string | null
          id?: string
          logged_at?: string
          mape_percent?: number | null
          measurement_period_days?: number
          model_version?: string
          predicted_demand: number
          product_id: string
          product_name: string
        }
        Update: {
          actual_demand?: number
          forecast_id?: string | null
          id?: string
          logged_at?: string
          mape_percent?: number | null
          measurement_period_days?: number
          model_version?: string
          predicted_demand?: number
          product_id?: string
          product_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_accuracy_log_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "demand_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_accuracy_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          created_at: string
          field_order: number
          field_type: string
          form_id: string
          id: string
          is_required: boolean
          label: string
          options: Json | null
          placeholder: string | null
        }
        Insert: {
          created_at?: string
          field_order?: number
          field_type: string
          form_id: string
          id?: string
          is_required?: boolean
          label: string
          options?: Json | null
          placeholder?: string | null
        }
        Update: {
          created_at?: string
          field_order?: number
          field_type?: string
          form_id?: string
          id?: string
          is_required?: boolean
          label?: string
          options?: Json | null
          placeholder?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms_public"
            referencedColumns: ["id"]
          },
        ]
      }
      form_permissions: {
        Row: {
          can_create_forms: boolean
          can_delete_submissions: boolean
          can_edit_forms: boolean
          can_view_forms: boolean
          can_view_submissions: boolean
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create_forms?: boolean
          can_delete_submissions?: boolean
          can_edit_forms?: boolean
          can_view_forms?: boolean
          can_view_submissions?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create_forms?: boolean
          can_delete_submissions?: boolean
          can_edit_forms?: boolean
          can_view_forms?: boolean
          can_view_submissions?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          form_id: string
          id: string
          ip_address: string | null
          submission_data: Json
          submitted_at: string
          user_agent: string | null
        }
        Insert: {
          form_id: string
          id?: string
          ip_address?: string | null
          submission_data: Json
          submitted_at?: string
          user_agent?: string | null
        }
        Update: {
          form_id?: string
          id?: string
          ip_address?: string | null
          submission_data?: Json
          submitted_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms_public"
            referencedColumns: ["id"]
          },
        ]
      }
      form_views: {
        Row: {
          form_id: string
          id: string
          ip_address: string | null
          user_agent: string | null
          viewed_at: string
        }
        Insert: {
          form_id: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          viewed_at?: string
        }
        Update: {
          form_id?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_views_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_views_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms_public"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      hr_document_shares: {
        Row: {
          created_at: string
          created_by: string
          department: string | null
          document_id: string
          employee_id: string | null
          id: string
          share_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          department?: string | null
          document_id: string
          employee_id?: string | null
          id?: string
          share_type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          department?: string | null
          document_id?: string
          employee_id?: string | null
          id?: string
          share_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "hr_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_shares_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          created_at: string
          description: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          folder_id: string
          id: string
          name: string
          updated_at: string
          uploaded_by: string
          uploaded_by_name: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          folder_id: string
          id?: string
          name: string
          updated_at?: string
          uploaded_by: string
          uploaded_by_name: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          folder_id?: string
          id?: string
          name?: string
          updated_at?: string
          uploaded_by?: string
          uploaded_by_name?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "hr_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_folder_shares: {
        Row: {
          created_at: string
          created_by: string
          department: string | null
          employee_id: string | null
          folder_id: string
          id: string
          share_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          department?: string | null
          employee_id?: string | null
          folder_id: string
          id?: string
          share_type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          department?: string | null
          employee_id?: string | null
          folder_id?: string
          id?: string
          share_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_folder_shares_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_folder_shares_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "hr_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_folders: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string
          employee_id: string | null
          folder_type: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name: string
          employee_id?: string | null
          folder_type?: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string
          employee_id?: string | null
          folder_type?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_folders_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "hr_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      import_items: {
        Row: {
          created_at: string
          hsn_code: string | null
          id: string
          import_id: string
          notes: string | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number | null
          total_amount: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string
          hsn_code?: string | null
          id?: string
          import_id: string
          notes?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name: string
          quantity?: number | null
          total_amount?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string
          hsn_code?: string | null
          id?: string
          import_id?: string
          notes?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number | null
          total_amount?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          actual_arrival: string | null
          bill_of_entry_url: string | null
          bl_number: string | null
          clearance_date: string | null
          commercial_invoice_url: string | null
          container_number: string | null
          courier_document_url: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          currency: string | null
          expected_arrival: string | null
          id: string
          import_number: string | null
          notes: string | null
          order_date: string | null
          origin_country: string | null
          other_documents_urls: string[] | null
          packing_list_url: string | null
          payment_amount: number | null
          payment_date: string | null
          payment_proof_url: string | null
          payment_status: string | null
          po_document_url: string | null
          port_of_destination: string | null
          port_of_origin: string | null
          product_category: string | null
          product_name: string
          quantity: number | null
          shipping_line: string | null
          shipping_method: string | null
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          actual_arrival?: string | null
          bill_of_entry_url?: string | null
          bl_number?: string | null
          clearance_date?: string | null
          commercial_invoice_url?: string | null
          container_number?: string | null
          courier_document_url?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          currency?: string | null
          expected_arrival?: string | null
          id?: string
          import_number?: string | null
          notes?: string | null
          order_date?: string | null
          origin_country?: string | null
          other_documents_urls?: string[] | null
          packing_list_url?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          po_document_url?: string | null
          port_of_destination?: string | null
          port_of_origin?: string | null
          product_category?: string | null
          product_name: string
          quantity?: number | null
          shipping_line?: string | null
          shipping_method?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          actual_arrival?: string | null
          bill_of_entry_url?: string | null
          bl_number?: string | null
          clearance_date?: string | null
          commercial_invoice_url?: string | null
          container_number?: string | null
          courier_document_url?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          currency?: string | null
          expected_arrival?: string | null
          id?: string
          import_number?: string | null
          notes?: string | null
          order_date?: string | null
          origin_country?: string | null
          other_documents_urls?: string[] | null
          packing_list_url?: string | null
          payment_amount?: number | null
          payment_date?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          po_document_url?: string | null
          port_of_destination?: string | null
          port_of_origin?: string | null
          product_category?: string | null
          product_name?: string
          quantity?: number | null
          shipping_line?: string | null
          shipping_method?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imports_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_records: {
        Row: {
          candidate_id: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          decision: Database["public"]["Enums"]["interview_decision"]
          feedback: string | null
          id: string
          interview_date: string
          interviewer_id: string | null
          interviewer_name: string
          rating: number | null
          result: string | null
          round_type: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          decision?: Database["public"]["Enums"]["interview_decision"]
          feedback?: string | null
          id?: string
          interview_date: string
          interviewer_id?: string | null
          interviewer_name: string
          rating?: number | null
          result?: string | null
          round_type: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          decision?: Database["public"]["Enums"]["interview_decision"]
          feedback?: string | null
          id?: string
          interview_date?: string
          interviewer_id?: string | null
          interviewer_name?: string
          rating?: number | null
          result?: string | null
          round_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_records_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          created_at: string
          current_stock: number
          id: string
          last_alert_sent_at: string | null
          min_stock_level: number | null
          notes: string | null
          product_category: string
          product_name: string
          reorder_point: number | null
          safety_stock: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stock?: number
          id?: string
          last_alert_sent_at?: string | null
          min_stock_level?: number | null
          notes?: string | null
          product_category?: string
          product_name: string
          reorder_point?: number | null
          safety_stock?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stock?: number
          id?: string
          last_alert_sent_at?: string | null
          min_stock_level?: number | null
          notes?: string | null
          product_category?: string
          product_name?: string
          reorder_point?: number | null
          safety_stock?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_alert_logs: {
        Row: {
          alert_type: string
          created_at: string
          current_stock: number
          id: string
          inventory_id: string
          notification_sent: boolean
          product_category: string | null
          product_name: string
          reorder_point: number
          task_created_id: string | null
        }
        Insert: {
          alert_type?: string
          created_at?: string
          current_stock: number
          id?: string
          inventory_id: string
          notification_sent?: boolean
          product_category?: string | null
          product_name: string
          reorder_point: number
          task_created_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          current_stock?: number
          id?: string
          inventory_id?: string
          notification_sent?: boolean
          product_category?: string | null
          product_name?: string
          reorder_point?: number
          task_created_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_alert_logs_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_procurements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inventory_id: string | null
          notes: string | null
          order_id: string | null
          payment_due_date: string | null
          payment_status: string
          payment_terms: string | null
          procurement_date: string
          procurement_number: string | null
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
          order_id?: string | null
          payment_due_date?: string | null
          payment_status?: string
          payment_terms?: string | null
          procurement_date?: string
          procurement_number?: string | null
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
          order_id?: string | null
          payment_due_date?: string | null
          payment_status?: string
          payment_terms?: string | null
          procurement_date?: string
          procurement_number?: string | null
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
            foreignKeyName: "inventory_procurements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      inventory_sync_settings: {
        Row: {
          created_at: string
          enable_shopify_sync: boolean
          id: string
          last_sync_at: string | null
          sync_direction: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enable_shopify_sync?: boolean
          id?: string
          last_sync_at?: string | null
          sync_direction?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enable_shopify_sync?: boolean
          id?: string
          last_sync_at?: string | null
          sync_direction?: string
          updated_at?: string
        }
        Relationships: []
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
      invoice_audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          invoice_hash: string | null
          invoice_id: string
          invoice_number: string
          invoice_version: number
          metadata: Json | null
          pdf_url: string | null
          signed_at: string | null
          signed_by: string | null
          signed_by_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          invoice_hash?: string | null
          invoice_id: string
          invoice_number: string
          invoice_version?: number
          metadata?: Json | null
          pdf_url?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_by_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          invoice_hash?: string | null
          invoice_id?: string
          invoice_number?: string
          invoice_version?: number
          metadata?: Json | null
          pdf_url?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_audit_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_audit_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          gst_amount: number
          gst_percent: number
          hsn_sac_code: string | null
          id: string
          invoice_id: string
          price_includes_gst: boolean
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          total_amount: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          gst_amount?: number
          gst_percent?: number
          hsn_sac_code?: string | null
          id?: string
          invoice_id: string
          price_includes_gst?: boolean
          product_category?: string | null
          product_code?: string | null
          product_name: string
          quantity?: number
          total_amount?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          gst_amount?: number
          gst_percent?: number
          hsn_sac_code?: string | null
          id?: string
          invoice_id?: string
          price_includes_gst?: boolean
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          total_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          recorded_by: string
          recorded_by_name: string
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          recorded_by: string
          recorded_by_name: string
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          recorded_by?: string
          recorded_by_name?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          attachment_urls: string[] | null
          authorized_signatory: string | null
          balance_due: number
          created_at: string
          created_by: string
          created_by_name: string
          customer_address: string | null
          customer_company: string | null
          customer_email: string | null
          customer_gst: string | null
          customer_name: string
          customer_phone: string | null
          customer_state: string | null
          discount_amount: number
          discount_percent: number
          due_date: string | null
          id: string
          include_bank_details: boolean | null
          internal_notes: string | null
          invoice_date: string
          invoice_hash: string | null
          invoice_number: string
          is_archived: boolean | null
          notes: string | null
          order_id: string | null
          paid_date: string | null
          payment_terms: string | null
          pdf_url: string | null
          quote_id: string | null
          shipping_address: string | null
          shipping_company: string | null
          shipping_name: string | null
          shipping_phone: string | null
          shipping_state: string | null
          signature_url: string | null
          signed_at: string | null
          signed_by: string | null
          signed_by_name: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          submitted_by: string | null
          submitted_by_name: string | null
          submitted_for_signature_at: string | null
          subtotal: number
          terms_and_conditions: string | null
          total_amount: number
          total_gst: number
          updated_at: string
          version: number
        }
        Insert: {
          amount_paid?: number
          attachment_urls?: string[] | null
          authorized_signatory?: string | null
          balance_due?: number
          created_at?: string
          created_by: string
          created_by_name: string
          customer_address?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_gst?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_state?: string | null
          discount_amount?: number
          discount_percent?: number
          due_date?: string | null
          id?: string
          include_bank_details?: boolean | null
          internal_notes?: string | null
          invoice_date?: string
          invoice_hash?: string | null
          invoice_number: string
          is_archived?: boolean | null
          notes?: string | null
          order_id?: string | null
          paid_date?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          quote_id?: string | null
          shipping_address?: string | null
          shipping_company?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_state?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_by_name?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          submitted_by?: string | null
          submitted_by_name?: string | null
          submitted_for_signature_at?: string | null
          subtotal?: number
          terms_and_conditions?: string | null
          total_amount?: number
          total_gst?: number
          updated_at?: string
          version?: number
        }
        Update: {
          amount_paid?: number
          attachment_urls?: string[] | null
          authorized_signatory?: string | null
          balance_due?: number
          created_at?: string
          created_by?: string
          created_by_name?: string
          customer_address?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_gst?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_state?: string | null
          discount_amount?: number
          discount_percent?: number
          due_date?: string | null
          id?: string
          include_bank_details?: boolean | null
          internal_notes?: string | null
          invoice_date?: string
          invoice_hash?: string | null
          invoice_number?: string
          is_archived?: boolean | null
          notes?: string | null
          order_id?: string | null
          paid_date?: string | null
          payment_terms?: string | null
          pdf_url?: string | null
          quote_id?: string | null
          shipping_address?: string | null
          shipping_company?: string | null
          shipping_name?: string | null
          shipping_phone?: string | null
          shipping_state?: string | null
          signature_url?: string | null
          signed_at?: string | null
          signed_by?: string | null
          signed_by_name?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          submitted_by?: string | null
          submitted_by_name?: string | null
          submitted_for_signature_at?: string | null
          subtotal?: number
          terms_and_conditions?: string | null
          total_amount?: number
          total_gst?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          approved_rejected_at: string | null
          approver_id: string | null
          approver_name: string | null
          comments: string | null
          created_at: string
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          start_date: string
          status: string | null
          total_days: number | null
          updated_at: string
        }
        Insert: {
          approved_rejected_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          comments?: string | null
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          start_date: string
          status?: string | null
          total_days?: number | null
          updated_at?: string
        }
        Update: {
          approved_rejected_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          comments?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          start_date?: string
          status?: string | null
          total_days?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      login_history: {
        Row: {
          attempted_at: string
          browser: string | null
          device_info: string | null
          email: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          location: string | null
          os: string | null
          status: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          browser?: string | null
          device_info?: string | null
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          os?: string | null
          status: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          browser?: string | null
          device_info?: string | null
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          location?: string | null
          os?: string | null
          status?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      margin_thresholds: {
        Row: {
          category: string
          created_at: string
          id: string
          minimum_margin_percent: number
          updated_at: string
          warning_margin_percent: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          minimum_margin_percent?: number
          updated_at?: string
          warning_margin_percent?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          minimum_margin_percent?: number
          updated_at?: string
          warning_margin_percent?: number
        }
        Relationships: []
      }
      meetings: {
        Row: {
          agenda: string | null
          background: string | null
          created_at: string
          enquiry_id: string | null
          host_id: string | null
          host_name: string | null
          id: string
          meeting_date: string
          meeting_link: string | null
          meeting_outcome: string | null
          meeting_type: string
          next_followup_date: string | null
          next_steps: string | null
          order_id: string | null
          outcome: string | null
          owner_id: string
          owner_name: string
          participants: string[] | null
          pipeline_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          background?: string | null
          created_at?: string
          enquiry_id?: string | null
          host_id?: string | null
          host_name?: string | null
          id?: string
          meeting_date: string
          meeting_link?: string | null
          meeting_outcome?: string | null
          meeting_type: string
          next_followup_date?: string | null
          next_steps?: string | null
          order_id?: string | null
          outcome?: string | null
          owner_id: string
          owner_name: string
          participants?: string[] | null
          pipeline_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          background?: string | null
          created_at?: string
          enquiry_id?: string | null
          host_id?: string | null
          host_name?: string | null
          id?: string
          meeting_date?: string
          meeting_link?: string | null
          meeting_outcome?: string | null
          meeting_type?: string
          next_followup_date?: string | null
          next_steps?: string | null
          order_id?: string | null
          outcome?: string | null
          owner_id?: string
          owner_name?: string
          participants?: string[] | null
          pipeline_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "sales_weighted_forecast_view"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_reads: {
        Row: {
          id: string
          notice_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notice_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notice_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_reads_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "notices"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          content: string
          created_at: string
          created_by: string
          created_by_name: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          priority: string | null
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["notice_visibility"][]
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          created_by_name: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: string | null
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["notice_visibility"][]
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          created_by_name?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          priority?: string | null
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["notice_visibility"][]
        }
        Relationships: []
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
      nudge_health_log: {
        Row: {
          break_nudges_sent: number
          employees_checked: number
          error_message: string | null
          id: string
          late_nudges_sent: number
          log_detail: Json | null
          ran_at: string
        }
        Insert: {
          break_nudges_sent?: number
          employees_checked?: number
          error_message?: string | null
          id?: string
          late_nudges_sent?: number
          log_detail?: Json | null
          ran_at?: string
        }
        Update: {
          break_nudges_sent?: number
          employees_checked?: number
          error_message?: string | null
          id?: string
          late_nudges_sent?: number
          log_detail?: Json | null
          ran_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          fulfilled_from_stock: boolean | null
          id: string
          notes: string | null
          order_id: string
          procurement_date: string | null
          procurement_gst_amount: number | null
          procurement_gst_percent: number | null
          procurement_price_includes_gst: boolean | null
          procurement_rate: number | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          quantity_procured: number | null
          sales_gst_amount: number | null
          sales_gst_percent: number | null
          sales_price_includes_gst: boolean | null
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
          procurement_gst_amount?: number | null
          procurement_gst_percent?: number | null
          procurement_price_includes_gst?: boolean | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code?: string | null
          product_name: string
          quantity?: number
          quantity_procured?: number | null
          sales_gst_amount?: number | null
          sales_gst_percent?: number | null
          sales_price_includes_gst?: boolean | null
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
          procurement_gst_amount?: number | null
          procurement_gst_percent?: number | null
          procurement_price_includes_gst?: boolean | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          quantity_procured?: number | null
          sales_gst_amount?: number | null
          sales_gst_percent?: number | null
          sales_price_includes_gst?: boolean | null
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
      order_procurement_links: {
        Row: {
          created_at: string
          id: string
          inventory_procurement_id: string
          linked_at: string
          linked_by: string | null
          notes: string | null
          order_id: string
          order_item_id: string | null
          quantity_used: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_procurement_id: string
          linked_at?: string
          linked_by?: string | null
          notes?: string | null
          order_id: string
          order_item_id?: string | null
          quantity_used?: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_procurement_id?: string
          linked_at?: string
          linked_by?: string | null
          notes?: string | null
          order_id?: string
          order_item_id?: string | null
          quantity_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_procurement_links_inventory_procurement_id_fkey"
            columns: ["inventory_procurement_id"]
            isOneToOne: false
            referencedRelation: "inventory_procurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_procurement_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_procurement_links_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          actual_delivery: string | null
          amount_paid: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          committed_timeline: string | null
          created_at: string
          created_by: string
          customer_company: string
          customer_email: string | null
          customer_name: string
          customer_notes: string | null
          customer_type: string | null
          delivery_charges: number | null
          discount_amount: number | null
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
          is_rto: boolean
          last_reminder_sent_at: string | null
          lead_source: string | null
          lost_reason: string | null
          lost_reason_notes: string | null
          order_date: string | null
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
          procurement_date: string | null
          procurement_rate: number | null
          product_category: string | null
          product_code: string
          product_name: string
          quantity: number
          refund_reason: string | null
          refund_requested_at: string | null
          refund_requested_by: string | null
          refund_status: string | null
          rto_marked_at: string | null
          rto_marked_by: string | null
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
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          committed_timeline?: string | null
          created_at?: string
          created_by: string
          customer_company: string
          customer_email?: string | null
          customer_name: string
          customer_notes?: string | null
          customer_type?: string | null
          delivery_charges?: number | null
          discount_amount?: number | null
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
          is_rto?: boolean
          last_reminder_sent_at?: string | null
          lead_source?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          order_date?: string | null
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
          procurement_date?: string | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code: string
          product_name: string
          quantity: number
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_requested_by?: string | null
          refund_status?: string | null
          rto_marked_at?: string | null
          rto_marked_by?: string | null
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
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          committed_timeline?: string | null
          created_at?: string
          created_by?: string
          customer_company?: string
          customer_email?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_type?: string | null
          delivery_charges?: number | null
          discount_amount?: number | null
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
          is_rto?: boolean
          last_reminder_sent_at?: string | null
          lead_source?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          order_date?: string | null
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
          procurement_date?: string | null
          procurement_rate?: number | null
          product_category?: string | null
          product_code?: string
          product_name?: string
          quantity?: number
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_requested_by?: string | null
          refund_status?: string | null
          rto_marked_at?: string | null
          rto_marked_by?: string | null
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
      org_departments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_system: boolean
          label: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          label: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          label?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      org_settings: {
        Row: {
          business_hours_end: string
          business_hours_start: string
          created_at: string
          id: string
          logo_url: string | null
          org_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_hours_end?: string
          business_hours_start?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          org_name?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_hours_end?: string
          business_hours_start?: string
          created_at?: string
          id?: string
          logo_url?: string | null
          org_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_activities: {
        Row: {
          activity_date: string
          calls_made: number | null
          created_at: string
          demos_given: number | null
          emails_sent: number | null
          follow_ups: number | null
          id: string
          meetings_scheduled: number | null
          new_contacts: number | null
          notes: string | null
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          activity_date?: string
          calls_made?: number | null
          created_at?: string
          demos_given?: number | null
          emails_sent?: number | null
          follow_ups?: number | null
          id?: string
          meetings_scheduled?: number | null
          new_contacts?: number | null
          notes?: string | null
          updated_at?: string
          user_id: string
          user_name: string
        }
        Update: {
          activity_date?: string
          calls_made?: number | null
          created_at?: string
          demos_given?: number | null
          emails_sent?: number | null
          follow_ups?: number | null
          id?: string
          meetings_scheduled?: number | null
          new_contacts?: number | null
          notes?: string | null
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
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
      payment_risk_accuracy_log: {
        Row: {
          actual_days_to_pay: number
          customer_company: string | null
          id: string
          invoice_id: string
          logged_at: string
          model_version: string
          predicted_days_to_pay: number | null
          predicted_risk_level: string
          score_id: string | null
          was_late: boolean
        }
        Insert: {
          actual_days_to_pay: number
          customer_company?: string | null
          id?: string
          invoice_id: string
          logged_at?: string
          model_version?: string
          predicted_days_to_pay?: number | null
          predicted_risk_level: string
          score_id?: string | null
          was_late?: boolean
        }
        Update: {
          actual_days_to_pay?: number
          customer_company?: string | null
          id?: string
          invoice_id?: string
          logged_at?: string
          model_version?: string
          predicted_days_to_pay?: number | null
          predicted_risk_level?: string
          score_id?: string | null
          was_late?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_risk_accuracy_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_risk_accuracy_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_risk_accuracy_log_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "payment_risk_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_risk_scores: {
        Row: {
          customer_company: string | null
          customer_name: string
          factors: Json
          id: string
          invoice_id: string
          model_version: string
          predicted_days_to_pay: number | null
          risk_level: string
          risk_score: number
          scored_at: string
        }
        Insert: {
          customer_company?: string | null
          customer_name: string
          factors?: Json
          id?: string
          invoice_id: string
          model_version?: string
          predicted_days_to_pay?: number | null
          risk_level?: string
          risk_score?: number
          scored_at?: string
        }
        Update: {
          customer_company?: string | null
          customer_name?: string
          factors?: Json
          id?: string
          invoice_id?: string
          model_version?: string
          predicted_days_to_pay?: number | null
          risk_level?: string
          risk_score?: number
          scored_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_risk_scores_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_aging_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_risk_scores_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          created_by_name: string
          expense_id: string | null
          id: string
          notes: string | null
          transaction_type: string
          user_id: string
          user_name: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          created_by_name: string
          expense_id?: string | null
          id?: string
          notes?: string | null
          transaction_type: string
          user_id: string
          user_name: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          created_by_name?: string
          expense_id?: string | null
          id?: string
          notes?: string | null
          transaction_type?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_transactions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
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
          customer_state: string | null
          enquiry_id: string | null
          expected_closure_date: string | null
          expected_price: number | null
          id: string
          internal_notes: string | null
          is_mega_deal: boolean | null
          lead_source: string | null
          lead_temperature: string | null
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
          customer_state?: string | null
          enquiry_id?: string | null
          expected_closure_date?: string | null
          expected_price?: number | null
          id?: string
          internal_notes?: string | null
          is_mega_deal?: boolean | null
          lead_source?: string | null
          lead_temperature?: string | null
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
          customer_state?: string | null
          enquiry_id?: string | null
          expected_closure_date?: string | null
          expected_price?: number | null
          id?: string
          internal_notes?: string | null
          is_mega_deal?: boolean | null
          lead_source?: string | null
          lead_temperature?: string | null
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
      pipeline_tags: {
        Row: {
          added_at: string | null
          added_by: string | null
          custom_tag: string | null
          id: string
          pipeline_order_id: string
          tag_id: string | null
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          custom_tag?: string | null
          id?: string
          pipeline_order_id: string
          tag_id?: string | null
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          custom_tag?: string | null
          id?: string
          pipeline_order_id?: string
          tag_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_tags_pipeline_order_id_fkey"
            columns: ["pipeline_order_id"]
            isOneToOne: false
            referencedRelation: "pipeline_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_tags_pipeline_order_id_fkey"
            columns: ["pipeline_order_id"]
            isOneToOne: false
            referencedRelation: "sales_weighted_forecast_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "lead_tags"
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
          marketing_collateral_name: string | null
          marketing_collateral_url: string | null
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
          marketing_collateral_name?: string | null
          marketing_collateral_url?: string | null
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
          marketing_collateral_name?: string | null
          marketing_collateral_url?: string | null
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
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          is_approved: boolean
          name: string
          reporting_manager_id: string | null
          slack_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          is_approved?: boolean
          name: string
          reporting_manager_id?: string | null
          slack_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          is_approved?: boolean
          name?: string
          reporting_manager_id?: string | null
          slack_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          gst_amount: number | null
          gst_percent: number | null
          id: string
          price_includes_gst: boolean | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          quote_id: string
          total_amount: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          gst_amount?: number | null
          gst_percent?: number | null
          id?: string
          price_includes_gst?: boolean | null
          product_category?: string | null
          product_code?: string | null
          product_name: string
          quantity?: number
          quote_id: string
          total_amount?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          gst_amount?: number | null
          gst_percent?: number | null
          id?: string
          price_includes_gst?: boolean | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          quote_id?: string
          total_amount?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_risk_flags: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          item_category: string | null
          item_margin_percent: number | null
          item_product_name: string | null
          overall_margin_percent: number | null
          quote_id: string
          requires_approval: boolean
          risk_level: string
          threshold_percent: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          item_category?: string | null
          item_margin_percent?: number | null
          item_product_name?: string | null
          overall_margin_percent?: number | null
          quote_id: string
          requires_approval?: boolean
          risk_level?: string
          threshold_percent?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          item_category?: string | null
          item_margin_percent?: number | null
          item_product_name?: string | null
          overall_margin_percent?: number | null
          quote_id?: string
          requires_approval?: boolean
          risk_level?: string
          threshold_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_risk_flags_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          attachment_urls: string[] | null
          authorized_signatory: string | null
          created_at: string
          created_by: string
          created_by_name: string
          customer_address: string | null
          customer_company: string | null
          customer_email: string | null
          customer_gst: string | null
          customer_name: string
          customer_phone: string | null
          customer_state: string | null
          discount_amount: number | null
          discount_percent: number | null
          id: string
          include_bank_details: boolean | null
          internal_notes: string | null
          notes: string | null
          payment_terms: string | null
          payment_terms_custom: string | null
          quote_number: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number | null
          terms_and_conditions: string | null
          total_amount: number | null
          total_gst: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          attachment_urls?: string[] | null
          authorized_signatory?: string | null
          created_at?: string
          created_by: string
          created_by_name: string
          customer_address?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_gst?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_state?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          include_bank_details?: boolean | null
          internal_notes?: string | null
          notes?: string | null
          payment_terms?: string | null
          payment_terms_custom?: string | null
          quote_number?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number | null
          terms_and_conditions?: string | null
          total_amount?: number | null
          total_gst?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          attachment_urls?: string[] | null
          authorized_signatory?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          customer_address?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_gst?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_state?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          include_bank_details?: boolean | null
          internal_notes?: string | null
          notes?: string | null
          payment_terms?: string | null
          payment_terms_custom?: string | null
          quote_number?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number | null
          terms_and_conditions?: string | null
          total_amount?: number | null
          total_gst?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      repairs: {
        Row: {
          advance_amount: number | null
          balance_amount: number | null
          committed_date: string | null
          components_replaced: Json | null
          contact_no: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          customer_name: string
          date_completed: string | null
          date_of_receipt: string
          days_to_complete: number | null
          id: string
          inspection_charges: number | null
          issue_details: string | null
          issue_type: Database["public"]["Enums"]["repair_issue_type"]
          model_name: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["repair_payment_status"]
          profit: number | null
          repair_cost_charged: number | null
          repair_number: string | null
          total_component_cost: number | null
          total_quote_amount: number | null
          updated_at: string
        }
        Insert: {
          advance_amount?: number | null
          balance_amount?: number | null
          committed_date?: string | null
          components_replaced?: Json | null
          contact_no: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_name: string
          date_completed?: string | null
          date_of_receipt?: string
          days_to_complete?: number | null
          id?: string
          inspection_charges?: number | null
          issue_details?: string | null
          issue_type?: Database["public"]["Enums"]["repair_issue_type"]
          model_name: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["repair_payment_status"]
          profit?: number | null
          repair_cost_charged?: number | null
          repair_number?: string | null
          total_component_cost?: number | null
          total_quote_amount?: number | null
          updated_at?: string
        }
        Update: {
          advance_amount?: number | null
          balance_amount?: number | null
          committed_date?: string | null
          components_replaced?: Json | null
          contact_no?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_name?: string
          date_completed?: string | null
          date_of_receipt?: string
          days_to_complete?: number | null
          id?: string
          inspection_charges?: number | null
          issue_details?: string | null
          issue_type?: Database["public"]["Enums"]["repair_issue_type"]
          model_name?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["repair_payment_status"]
          profit?: number | null
          repair_cost_charged?: number | null
          repair_number?: string | null
          total_component_cost?: number | null
          total_quote_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_daily_activities: {
        Row: {
          activity_date: string
          bonus_earned: number | null
          channel: string | null
          created_at: string
          id: string
          leads_handled: number | null
          monthly_pipeline: number | null
          notes: string | null
          orders_won: number | null
          payment_expected_today: number | null
          pipeline_created: number | null
          sweet_pipeline: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_date?: string
          bonus_earned?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          leads_handled?: number | null
          monthly_pipeline?: number | null
          notes?: string | null
          orders_won?: number | null
          payment_expected_today?: number | null
          pipeline_created?: number | null
          sweet_pipeline?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          bonus_earned?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          leads_handled?: number | null
          monthly_pipeline?: number | null
          notes?: string | null
          orders_won?: number | null
          payment_expected_today?: number | null
          pipeline_created?: number | null
          sweet_pipeline?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_faqs: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          answered_by_name: string | null
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          asked_by: string
          asked_by_name: string
          category: string | null
          created_at: string | null
          id: string
          is_approved: boolean | null
          is_pinned: boolean | null
          question: string
          updated_at: string | null
          views_count: number | null
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          answered_by_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          asked_by: string
          asked_by_name: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_pinned?: boolean | null
          question: string
          updated_at?: string | null
          views_count?: number | null
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          answered_by_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          asked_by?: string
          asked_by_name?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_approved?: boolean | null
          is_pinned?: boolean | null
          question?: string
          updated_at?: string | null
          views_count?: number | null
        }
        Relationships: []
      }
      sales_points: {
        Row: {
          category: string
          created_at: string
          description: string | null
          earned_at: string
          id: string
          points: number
          reference_id: string | null
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          earned_at?: string
          id?: string
          points?: number
          reference_id?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          earned_at?: string
          id?: string
          points?: number
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sales_suggestions: {
        Row: {
          admin_response: string | null
          created_at: string
          description: string
          id: string
          responded_at: string | null
          responded_by: string | null
          responded_by_name: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          description: string
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          responded_by_name?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
          user_name: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          description?: string
          id?: string
          responded_at?: string | null
          responded_by?: string | null
          responded_by_name?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      sales_targets: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          orders_achieved: number | null
          orders_target: number | null
          period_end: string
          period_start: string
          pipeline_achieved: number | null
          pipeline_target: number | null
          revenue_achieved: number | null
          revenue_target: number | null
          target_period: string
          updated_at: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          orders_achieved?: number | null
          orders_target?: number | null
          period_end: string
          period_start: string
          pipeline_achieved?: number | null
          pipeline_target?: number | null
          revenue_achieved?: number | null
          revenue_target?: number | null
          target_period: string
          updated_at?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          orders_achieved?: number | null
          orders_target?: number | null
          period_end?: string
          period_start?: string
          pipeline_achieved?: number | null
          pipeline_target?: number | null
          revenue_achieved?: number | null
          revenue_target?: number | null
          target_period?: string
          updated_at?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          details: Json | null
          id: string
          ip_address: string | null
          performed_at: string
          target_user_id: string | null
          user_agent: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          performed_at?: string
          target_user_id?: string | null
          user_agent?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          performed_at?: string
          target_user_id?: string | null
          user_agent?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      shopify_orders: {
        Row: {
          amount_paid: number | null
          created_at: string
          currency: string | null
          customer_company: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          internal_notes: string | null
          line_items: Json | null
          order_number: string | null
          order_status: string | null
          payment_status: string | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          sales_notes: string | null
          selling_price: number | null
          shipping_address: string | null
          shop_domain: string
          shopify_created_at: string | null
          shopify_order_id: string
          shopify_updated_at: string | null
          tags: string | null
          total_sales_amount: number | null
          updated_at: string
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string
          currency?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          internal_notes?: string | null
          line_items?: Json | null
          order_number?: string | null
          order_status?: string | null
          payment_status?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          sales_notes?: string | null
          selling_price?: number | null
          shipping_address?: string | null
          shop_domain: string
          shopify_created_at?: string | null
          shopify_order_id: string
          shopify_updated_at?: string | null
          tags?: string | null
          total_sales_amount?: number | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number | null
          created_at?: string
          currency?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          internal_notes?: string | null
          line_items?: Json | null
          order_number?: string | null
          order_status?: string | null
          payment_status?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          sales_notes?: string | null
          selling_price?: number | null
          shipping_address?: string | null
          shop_domain?: string
          shopify_created_at?: string | null
          shopify_order_id?: string
          shopify_updated_at?: string | null
          tags?: string | null
          total_sales_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      shopify_orders_raw: {
        Row: {
          created_at: string
          id: string
          last_error: string | null
          order_id: string
          payload: Json
          processed_at: string | null
          processing_status: Database["public"]["Enums"]["shopify_processing_status"]
          retry_count: number
          shop_domain: string
          updated_at: string
          webhook_topic: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_error?: string | null
          order_id: string
          payload: Json
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["shopify_processing_status"]
          retry_count?: number
          shop_domain: string
          updated_at?: string
          webhook_topic?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_error?: string | null
          order_id?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: Database["public"]["Enums"]["shopify_processing_status"]
          retry_count?: number
          shop_domain?: string
          updated_at?: string
          webhook_topic?: string | null
        }
        Relationships: []
      }
      slack_settings: {
        Row: {
          channel_enquiries: string | null
          channel_orders: string | null
          channel_pipeline: string | null
          channel_procurements: string | null
          channel_suppliers: string | null
          channel_tickets: string | null
          created_at: string
          id: string
          is_enabled: boolean
          notify_hot_leads: boolean
          notify_new_enquiries: boolean | null
          notify_new_orders: boolean
          notify_new_pipeline: boolean | null
          notify_new_procurements: boolean | null
          notify_new_suppliers: boolean | null
          notify_payment_reminders: boolean
          notify_status_changes: boolean
          notify_ticket_assigned: boolean | null
          notify_ticket_status_change: boolean | null
          updated_at: string
        }
        Insert: {
          channel_enquiries?: string | null
          channel_orders?: string | null
          channel_pipeline?: string | null
          channel_procurements?: string | null
          channel_suppliers?: string | null
          channel_tickets?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          notify_hot_leads?: boolean
          notify_new_enquiries?: boolean | null
          notify_new_orders?: boolean
          notify_new_pipeline?: boolean | null
          notify_new_procurements?: boolean | null
          notify_new_suppliers?: boolean | null
          notify_payment_reminders?: boolean
          notify_status_changes?: boolean
          notify_ticket_assigned?: boolean | null
          notify_ticket_status_change?: boolean | null
          updated_at?: string
        }
        Update: {
          channel_enquiries?: string | null
          channel_orders?: string | null
          channel_pipeline?: string | null
          channel_procurements?: string | null
          channel_suppliers?: string | null
          channel_tickets?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          notify_hot_leads?: boolean
          notify_new_enquiries?: boolean | null
          notify_new_orders?: boolean
          notify_new_pipeline?: boolean | null
          notify_new_procurements?: boolean | null
          notify_new_suppliers?: boolean | null
          notify_payment_reminders?: boolean
          notify_status_changes?: boolean
          notify_ticket_assigned?: boolean | null
          notify_ticket_status_change?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          created_at: string
          created_by: string | null
          id: string
          inventory_procurement_id: string | null
          notes: string | null
          order_id: string | null
          payment_date: string
          payment_mode: string | null
          payment_request_status: string | null
          payment_type: string
          reference_number: string | null
          request_notes: string | null
          requested_at: string | null
          requested_by: string | null
          requested_by_name: string | null
          screenshot_urls: string[] | null
          supplier_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_procurement_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_date?: string
          payment_mode?: string | null
          payment_request_status?: string | null
          payment_type?: string
          reference_number?: string | null
          request_notes?: string | null
          requested_at?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
          screenshot_urls?: string[] | null
          supplier_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_procurement_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_date?: string
          payment_mode?: string | null
          payment_request_status?: string | null
          payment_type?: string
          reference_number?: string | null
          request_notes?: string | null
          requested_at?: string | null
          requested_by?: string | null
          requested_by_name?: string | null
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
      supplier_quotations: {
        Row: {
          created_at: string
          id: string
          is_selected: boolean | null
          lead_time: string | null
          notes: string | null
          order_id: string | null
          order_item_id: string | null
          payment_terms: string | null
          quantity: number
          quoted_at: string
          quoted_by: string | null
          supplier_id: string
          total_amount: number | null
          unit_price: number
          updated_at: string
          validity_date: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_selected?: boolean | null
          lead_time?: string | null
          notes?: string | null
          order_id?: string | null
          order_item_id?: string | null
          payment_terms?: string | null
          quantity?: number
          quoted_at?: string
          quoted_by?: string | null
          supplier_id: string
          total_amount?: number | null
          unit_price: number
          updated_at?: string
          validity_date?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_selected?: boolean | null
          lead_time?: string | null
          notes?: string | null
          order_id?: string | null
          order_item_id?: string | null
          payment_terms?: string | null
          quantity?: number
          quoted_at?: string
          quoted_by?: string | null
          supplier_id?: string
          total_amount?: number | null
          unit_price?: number
          updated_at?: string
          validity_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quotations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_ratings: {
        Row: {
          communication_rating: number | null
          created_at: string
          delivery_days_actual: number | null
          delivery_days_promised: number | null
          delivery_rating: number | null
          id: string
          inventory_procurement_id: string | null
          notes: string | null
          order_id: string | null
          pricing_rating: number | null
          quality_rating: number | null
          rated_by: string | null
          rated_by_name: string | null
          supplier_id: string
        }
        Insert: {
          communication_rating?: number | null
          created_at?: string
          delivery_days_actual?: number | null
          delivery_days_promised?: number | null
          delivery_rating?: number | null
          id?: string
          inventory_procurement_id?: string | null
          notes?: string | null
          order_id?: string | null
          pricing_rating?: number | null
          quality_rating?: number | null
          rated_by?: string | null
          rated_by_name?: string | null
          supplier_id: string
        }
        Update: {
          communication_rating?: number | null
          created_at?: string
          delivery_days_actual?: number | null
          delivery_days_promised?: number | null
          delivery_rating?: number | null
          id?: string
          inventory_procurement_id?: string | null
          notes?: string | null
          order_id?: string | null
          pricing_rating?: number | null
          quality_rating?: number | null
          rated_by?: string | null
          rated_by_name?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_ratings_inventory_procurement_id_fkey"
            columns: ["inventory_procurement_id"]
            isOneToOne: false
            referencedRelation: "inventory_procurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ratings_supplier_id_fkey"
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
      tasks: {
        Row: {
          assigned_by: string | null
          assigned_by_name: string | null
          assigned_role: Database["public"]["Enums"]["app_role"]
          assigned_to: string
          assigned_to_name: string
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          completion_notes: string | null
          created_at: string
          description: string | null
          due_date: string | null
          enquiry_id: string | null
          flagged_as_new_supplier: boolean | null
          id: string
          meeting_id: string | null
          order_id: string | null
          parent_task_id: string | null
          pipeline_id: string | null
          priority: number | null
          stage: string | null
          status: Database["public"]["Enums"]["task_status"]
          supplier_exists: boolean | null
          task_type: Database["public"]["Enums"]["task_type"]
          time_spent_seconds: number | null
          timer_started_at: string | null
          timer_status: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_by_name?: string | null
          assigned_role: Database["public"]["Enums"]["app_role"]
          assigned_to: string
          assigned_to_name: string
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          completion_notes?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          enquiry_id?: string | null
          flagged_as_new_supplier?: boolean | null
          id?: string
          meeting_id?: string | null
          order_id?: string | null
          parent_task_id?: string | null
          pipeline_id?: string | null
          priority?: number | null
          stage?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          supplier_exists?: boolean | null
          task_type: Database["public"]["Enums"]["task_type"]
          time_spent_seconds?: number | null
          timer_started_at?: string | null
          timer_status?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assigned_by_name?: string | null
          assigned_role?: Database["public"]["Enums"]["app_role"]
          assigned_to?: string
          assigned_to_name?: string
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          completion_notes?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          enquiry_id?: string | null
          flagged_as_new_supplier?: boolean | null
          id?: string
          meeting_id?: string | null
          order_id?: string | null
          parent_task_id?: string | null
          pipeline_id?: string | null
          priority?: number | null
          stage?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          supplier_exists?: boolean | null
          task_type?: Database["public"]["Enums"]["task_type"]
          time_spent_seconds?: number | null
          timer_started_at?: string | null
          timer_status?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "sales_weighted_forecast_view"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          attachment_urls: string[] | null
          comment: string
          commented_by: string
          commented_by_name: string
          created_at: string
          id: string
          is_internal: boolean | null
          ticket_id: string
        }
        Insert: {
          attachment_urls?: string[] | null
          comment: string
          commented_by: string
          commented_by_name: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          ticket_id: string
        }
        Update: {
          attachment_urls?: string[] | null
          comment?: string
          commented_by?: string
          commented_by_name?: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_at: string | null
          assigned_department: Database["public"]["Enums"]["app_role"]
          assigned_to: string | null
          assigned_to_name: string | null
          attachment_urls: string[] | null
          category: Database["public"]["Enums"]["ticket_category"]
          created_at: string
          description: string
          enquiry_id: string | null
          id: string
          order_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          raised_by: string
          raised_by_department: Database["public"]["Enums"]["app_role"]
          raised_by_name: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          sla_due_at: string | null
          sla_response_at: string | null
          sla_status: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_department: Database["public"]["Enums"]["app_role"]
          assigned_to?: string | null
          assigned_to_name?: string | null
          attachment_urls?: string[] | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description: string
          enquiry_id?: string | null
          id?: string
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          raised_by: string
          raised_by_department: Database["public"]["Enums"]["app_role"]
          raised_by_name: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          sla_due_at?: string | null
          sla_response_at?: string | null
          sla_status?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_department?: Database["public"]["Enums"]["app_role"]
          assigned_to?: string | null
          assigned_to_name?: string | null
          attachment_urls?: string[] | null
          category?: Database["public"]["Enums"]["ticket_category"]
          created_at?: string
          description?: string
          enquiry_id?: string | null
          id?: string
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          raised_by?: string
          raised_by_department?: Database["public"]["Enums"]["app_role"]
          raised_by_name?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          sla_due_at?: string | null
          sla_response_at?: string | null
          sla_status?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          ticket_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      trainings: {
        Row: {
          amount_paid: number | null
          amount_quoted: number | null
          category: Database["public"]["Enums"]["training_category"]
          city: string
          client_name: string
          created_at: string
          created_by: string | null
          created_by_name: string | null
          id: string
          model_name: string | null
          no_of_people: number | null
          notes: string | null
          payment_status: Database["public"]["Enums"]["training_payment_status"]
          pictures: string[] | null
          status: Database["public"]["Enums"]["training_status"]
          trainee_names: string[] | null
          training_date: string | null
          training_number: string | null
          type: Database["public"]["Enums"]["training_type"]
          updated_at: string
        }
        Insert: {
          amount_paid?: number | null
          amount_quoted?: number | null
          category?: Database["public"]["Enums"]["training_category"]
          city: string
          client_name: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          model_name?: string | null
          no_of_people?: number | null
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["training_payment_status"]
          pictures?: string[] | null
          status?: Database["public"]["Enums"]["training_status"]
          trainee_names?: string[] | null
          training_date?: string | null
          training_number?: string | null
          type?: Database["public"]["Enums"]["training_type"]
          updated_at?: string
        }
        Update: {
          amount_paid?: number | null
          amount_quoted?: number | null
          category?: Database["public"]["Enums"]["training_category"]
          city?: string
          client_name?: string
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          id?: string
          model_name?: string | null
          no_of_people?: number | null
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["training_payment_status"]
          pictures?: string[] | null
          status?: Database["public"]["Enums"]["training_status"]
          trainee_names?: string[] | null
          training_date?: string | null
          training_number?: string | null
          type?: Database["public"]["Enums"]["training_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          actions_performed: number | null
          created_at: string
          duration_minutes: number | null
          id: string
          ip_address: string | null
          last_activity_at: string | null
          pages_visited: number | null
          session_end: string | null
          session_start: string
          user_agent: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          actions_performed?: number | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          ip_address?: string | null
          last_activity_at?: string | null
          pages_visited?: number | null
          session_end?: string | null
          session_start?: string
          user_agent?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          actions_performed?: number | null
          created_at?: string
          duration_minutes?: number | null
          id?: string
          ip_address?: string | null
          last_activity_at?: string | null
          pages_visited?: number | null
          session_end?: string | null
          session_start?: string
          user_agent?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          department: string | null
          email: string
          id: string
          invited_at: string
          invited_by: string | null
          name: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          department?: string | null
          email: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          name: string
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          name?: string
          role?: string
          status?: string
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
      user_sessions: {
        Row: {
          browser: string | null
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          is_active: boolean
          is_current: boolean
          last_active_at: string
          location: string | null
          os: string | null
          revocation_reason: string | null
          revoked_at: string | null
          session_token_hash: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          is_current?: boolean
          last_active_at?: string
          location?: string | null
          os?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          session_token_hash?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          is_current?: boolean
          last_active_at?: string
          location?: string | null
          os?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          session_token_hash?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          compact_mode: boolean
          created_at: string
          critical_alerts: boolean
          email_notifications: Json
          id: string
          in_app_notifications: boolean
          language: string
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          compact_mode?: boolean
          created_at?: string
          critical_alerts?: boolean
          email_notifications?: Json
          id?: string
          in_app_notifications?: boolean
          language?: string
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          compact_mode?: boolean
          created_at?: string
          critical_alerts?: boolean
          email_notifications?: Json
          id?: string
          in_app_notifications?: boolean
          language?: string
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      forms_public: {
        Row: {
          description: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
        }
        Insert: {
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
        }
        Update: {
          description?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
      invoice_aging_view: {
        Row: {
          aging_bucket: string | null
          amount_paid: number | null
          balance_due: number | null
          created_by: string | null
          customer_company: string | null
          customer_name: string | null
          days_overdue: number | null
          due_date: string | null
          id: string | null
          invoice_date: string | null
          invoice_number: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          total_amount: number | null
        }
        Insert: {
          aging_bucket?: never
          amount_paid?: number | null
          balance_due?: number | null
          created_by?: string | null
          customer_company?: string | null
          customer_name?: string | null
          days_overdue?: never
          due_date?: string | null
          id?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          total_amount?: number | null
        }
        Update: {
          aging_bucket?: never
          amount_paid?: number | null
          balance_due?: number | null
          created_by?: string | null
          customer_company?: string | null
          customer_name?: string | null
          days_overdue?: never
          due_date?: string | null
          id?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          total_amount?: number | null
        }
        Relationships: []
      }
      pricelist_public: {
        Row: {
          availability: string | null
          brand: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          dealer_price: number | null
          description: string | null
          id: string | null
          lead_time: string | null
          marketing_collateral_name: string | null
          marketing_collateral_url: string | null
          min_order_quantity: number | null
          notes: string | null
          product_category: string | null
          product_name: string | null
          unit_price: number | null
          updated_at: string | null
          updated_by: string | null
          website_price: number | null
        }
        Insert: {
          availability?: string | null
          brand?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          dealer_price?: number | null
          description?: string | null
          id?: string | null
          lead_time?: string | null
          marketing_collateral_name?: string | null
          marketing_collateral_url?: string | null
          min_order_quantity?: number | null
          notes?: string | null
          product_category?: string | null
          product_name?: string | null
          unit_price?: number | null
          updated_at?: string | null
          updated_by?: string | null
          website_price?: number | null
        }
        Update: {
          availability?: string | null
          brand?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          dealer_price?: number | null
          description?: string | null
          id?: string | null
          lead_time?: string | null
          marketing_collateral_name?: string | null
          marketing_collateral_url?: string | null
          min_order_quantity?: number | null
          notes?: string | null
          product_category?: string | null
          product_name?: string | null
          unit_price?: number | null
          updated_at?: string | null
          updated_by?: string | null
          website_price?: number | null
        }
        Relationships: []
      }
      sales_weighted_forecast_view: {
        Row: {
          created_at: string | null
          customer_company: string | null
          customer_name: string | null
          deal_stage: string | null
          expected_closure_date: string | null
          expected_price: number | null
          id: string | null
          is_mega_deal: boolean | null
          lead_temperature: string | null
          probability: number | null
          product_category: string | null
          product_name: string | null
          quantity: number | null
          sales_person_id: string | null
          sales_person_name: string | null
          status: string | null
          weighted_revenue: number | null
        }
        Insert: {
          created_at?: string | null
          customer_company?: string | null
          customer_name?: string | null
          deal_stage?: never
          expected_closure_date?: string | null
          expected_price?: number | null
          id?: string | null
          is_mega_deal?: boolean | null
          lead_temperature?: string | null
          probability?: number | null
          product_category?: string | null
          product_name?: string | null
          quantity?: number | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: string | null
          weighted_revenue?: never
        }
        Update: {
          created_at?: string | null
          customer_company?: string | null
          customer_name?: string | null
          deal_stage?: never
          expected_closure_date?: string | null
          expected_price?: number | null
          id?: string | null
          is_mega_deal?: boolean | null
          lead_temperature?: string | null
          probability?: number | null
          product_category?: string | null
          product_name?: string | null
          quantity?: number | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: string | null
          weighted_revenue?: never
        }
        Relationships: []
      }
    }
    Functions: {
      approve_invitation_atomic: {
        Args: {
          p_admin_name: string
          p_admin_user_id: string
          p_department: string
          p_email: string
          p_invitation_id: string
          p_is_existing_user?: boolean
          p_name: string
          p_role: string
          p_user_id: string
        }
        Returns: Json
      }
      can_create_admin: { Args: never; Returns: boolean }
      can_register_as_admin: { Args: { p_email: string }; Returns: boolean }
      can_view_hr_document: {
        Args: { _document_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_hr_folder: {
        Args: { _folder_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_notice: {
        Args: {
          _user_id: string
          _visibility: Database["public"]["Enums"]["notice_visibility"][]
        }
        Returns: boolean
      }
      check_login_rate_limit: {
        Args: { p_email: string }
        Returns: {
          allowed: boolean
          recent_failures: number
          retry_after_seconds: number
        }[]
      }
      count_admins: { Args: never; Returns: number }
      fetch_pending_shopify_orders: {
        Args: { batch_size?: number }
        Returns: {
          created_at: string
          id: string
          order_id: string
          payload: Json
          retry_count: number
          shop_domain: string
          updated_at: string
        }[]
      }
      find_duplicate_enquiries: {
        Args: {
          p_customer_company: string
          p_customer_name: string
          p_exclude_id?: string
          p_threshold?: number
        }
        Returns: {
          customer_company: string
          customer_name: string
          enquiry_id: string
          match_type: string
          product_name: string
          similarity_score: number
        }[]
      }
      generate_payment_reminders: { Args: never; Returns: undefined }
      get_direct_reports: { Args: { _manager_id: string }; Returns: string[] }
      get_employee_kpi: {
        Args: { p_employee_id: string; p_month?: string }
        Returns: {
          attendance_percentage: number
          hours_fulfilment_percentage: number
          kpi_score: number
          leave_days: number
          present_days: number
          target_hours: number
          total_working_days: number
          total_working_hours: number
        }[]
      }
      get_low_stock_items: {
        Args: never
        Returns: {
          current_stock: number
          id: string
          last_alert_sent_at: string
          product_category: string
          product_name: string
          reorder_point: number
          safety_stock: number
        }[]
      }
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
      get_sales_leaderboard: {
        Args: { end_date?: string; start_date?: string }
        Returns: {
          leads_handled: number
          orders_won: number
          pipeline_created: number
          rank: number
          total_pipeline_value: number
          total_points: number
          user_id: string
          user_name: string
        }[]
      }
      get_sales_team: {
        Args: never
        Returns: {
          name: string
          user_id: string
        }[]
      }
      get_shopify_processing_stats: { Args: never; Returns: Json }
      get_supplier_score: {
        Args: { p_supplier_id: string }
        Returns: {
          avg_communication: number
          avg_delivery: number
          avg_pricing: number
          avg_quality: number
          on_time_percentage: number
          overall_score: number
          total_ratings: number
        }[]
      }
      get_user_activity_summary: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          avg_session_minutes: number
          last_active: string
          total_actions: number
          total_pages_visited: number
          total_sessions: number
          total_usage_minutes: number
          user_id: string
          user_name: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_task_counts: {
        Args: { p_user_id: string }
        Returns: {
          awaiting_approval_tasks: number
          in_progress_tasks: number
          new_tasks: number
          overdue_tasks: number
          total_tasks: number
        }[]
      }
      has_form_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_hr_or_admin: { Args: { _user_id: string }; Returns: boolean }
      is_reporting_manager: {
        Args: { _employee_id: string; _manager_id: string }
        Returns: boolean
      }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
      record_login_attempt: {
        Args: {
          p_email: string
          p_failure_reason?: string
          p_status: string
          p_user_id?: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_profiles_to_employees: { Args: never; Returns: number }
      validate_admin_registration: {
        Args: { p_email: string }
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "sales"
        | "supply_chain"
        | "admin"
        | "finance"
        | "it"
        | "marketing"
        | "hr"
      application_source:
        | "Referral"
        | "Naukri"
        | "LinkedIn"
        | "Website"
        | "Consultant"
        | "Walk-in"
        | "Other"
      asset_status:
        | "assigned"
        | "returned"
        | "lost"
        | "damaged"
        | "under_repair"
      asset_type:
        | "mobile_phone"
        | "sim_card"
        | "laptop"
        | "camera"
        | "tablet"
        | "headset"
        | "monitor"
        | "keyboard"
        | "mouse"
        | "other"
      candidate_lifecycle_status:
        | "NEW"
        | "SCREENING"
        | "INTERVIEW"
        | "SELECTED"
        | "OFFERED"
        | "JOINED"
        | "REJECTED"
        | "DROPPED"
        | "ON_HOLD"
      candidate_status:
        | "applied"
        | "shortlisted"
        | "rejected"
        | "hired"
        | "blacklisted"
        | "active"
        | "offered"
        | "joined"
        | "dropped"
      employment_type: "Full-time" | "Contract" | "Intern"
      final_status: "Selected" | "Rejected" | "Pending"
      interview_decision: "pass" | "reject" | "hold"
      interview_stage: "HR" | "Technical" | "Managerial" | "Final"
      invoice_status:
        | "draft"
        | "sent"
        | "paid"
        | "partial"
        | "overdue"
        | "cancelled"
        | "pending_signature"
        | "signed"
      kpi_measurement_unit:
        | "percentage"
        | "numeric"
        | "currency"
        | "count"
        | "rating"
        | "boolean"
      kpi_priority: "low" | "medium" | "high"
      kpi_rag_status: "green" | "amber" | "red" | "not_started"
      notice_visibility:
        | "all"
        | "sales"
        | "supply_chain"
        | "finance"
        | "admin"
        | "it"
        | "marketing"
        | "hr"
      order_status:
        | "po_received"
        | "payment_received"
        | "partial_payment_received"
        | "procurement_to_plan"
        | "procurement_in_process"
        | "procurement_done"
        | "delivery_done"
        | "cancelled"
        | "to_ship"
        | "in_transit"
      quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "converted"
      repair_issue_type:
        | "motor_failure"
        | "gimbal_issue"
        | "camera_damage"
        | "battery_problem"
        | "gps_issue"
        | "remote_controller"
        | "propeller_damage"
        | "frame_damage"
        | "flight_controller"
        | "esc_issue"
        | "software_issue"
        | "water_damage"
        | "crash_damage"
        | "other"
      repair_payment_status: "pending" | "partial" | "paid"
      screening_status: "New" | "Shortlisted" | "Rejected" | "On Hold"
      shopify_processing_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
      supplier_preference: "low" | "medium" | "high"
      task_status: "new" | "in_progress" | "awaiting_approval" | "completed"
      task_type:
        | "sales_followup"
        | "supplier_validation"
        | "supplier_onboarding"
        | "finance_review"
        | "sales_confirmation"
        | "hot_lead_followup"
        | "mega_deal_review"
        | "quotation_request"
        | "order_confirmation"
        | "custom"
        | "meeting_reminder"
        | "low_stock_alert"
        | "hr_task"
      ticket_category:
        | "general_inquiry"
        | "order_issue"
        | "payment_issue"
        | "delivery_issue"
        | "supplier_issue"
        | "procurement_request"
        | "refund_request"
        | "technical_support"
        | "documentation"
        | "other"
      ticket_priority: "low" | "medium" | "high" | "critical"
      ticket_status:
        | "open"
        | "assigned"
        | "in_progress"
        | "pending"
        | "resolved"
        | "closed"
      training_category: "drone_ops" | "software_usage" | "both" | "das" | "ras"
      training_payment_status: "pending" | "partial" | "paid"
      training_status: "requested" | "pending" | "done"
      training_type: "demo" | "training"
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
      app_role: [
        "sales",
        "supply_chain",
        "admin",
        "finance",
        "it",
        "marketing",
        "hr",
      ],
      application_source: [
        "Referral",
        "Naukri",
        "LinkedIn",
        "Website",
        "Consultant",
        "Walk-in",
        "Other",
      ],
      asset_status: ["assigned", "returned", "lost", "damaged", "under_repair"],
      asset_type: [
        "mobile_phone",
        "sim_card",
        "laptop",
        "camera",
        "tablet",
        "headset",
        "monitor",
        "keyboard",
        "mouse",
        "other",
      ],
      candidate_lifecycle_status: [
        "NEW",
        "SCREENING",
        "INTERVIEW",
        "SELECTED",
        "OFFERED",
        "JOINED",
        "REJECTED",
        "DROPPED",
        "ON_HOLD",
      ],
      candidate_status: [
        "applied",
        "shortlisted",
        "rejected",
        "hired",
        "blacklisted",
        "active",
        "offered",
        "joined",
        "dropped",
      ],
      employment_type: ["Full-time", "Contract", "Intern"],
      final_status: ["Selected", "Rejected", "Pending"],
      interview_decision: ["pass", "reject", "hold"],
      interview_stage: ["HR", "Technical", "Managerial", "Final"],
      invoice_status: [
        "draft",
        "sent",
        "paid",
        "partial",
        "overdue",
        "cancelled",
        "pending_signature",
        "signed",
      ],
      kpi_measurement_unit: [
        "percentage",
        "numeric",
        "currency",
        "count",
        "rating",
        "boolean",
      ],
      kpi_priority: ["low", "medium", "high"],
      kpi_rag_status: ["green", "amber", "red", "not_started"],
      notice_visibility: [
        "all",
        "sales",
        "supply_chain",
        "finance",
        "admin",
        "it",
        "marketing",
        "hr",
      ],
      order_status: [
        "po_received",
        "payment_received",
        "partial_payment_received",
        "procurement_to_plan",
        "procurement_in_process",
        "procurement_done",
        "delivery_done",
        "cancelled",
        "to_ship",
        "in_transit",
      ],
      quote_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "converted",
      ],
      repair_issue_type: [
        "motor_failure",
        "gimbal_issue",
        "camera_damage",
        "battery_problem",
        "gps_issue",
        "remote_controller",
        "propeller_damage",
        "frame_damage",
        "flight_controller",
        "esc_issue",
        "software_issue",
        "water_damage",
        "crash_damage",
        "other",
      ],
      repair_payment_status: ["pending", "partial", "paid"],
      screening_status: ["New", "Shortlisted", "Rejected", "On Hold"],
      shopify_processing_status: [
        "pending",
        "processing",
        "completed",
        "failed",
      ],
      supplier_preference: ["low", "medium", "high"],
      task_status: ["new", "in_progress", "awaiting_approval", "completed"],
      task_type: [
        "sales_followup",
        "supplier_validation",
        "supplier_onboarding",
        "finance_review",
        "sales_confirmation",
        "hot_lead_followup",
        "mega_deal_review",
        "quotation_request",
        "order_confirmation",
        "custom",
        "meeting_reminder",
        "low_stock_alert",
        "hr_task",
      ],
      ticket_category: [
        "general_inquiry",
        "order_issue",
        "payment_issue",
        "delivery_issue",
        "supplier_issue",
        "procurement_request",
        "refund_request",
        "technical_support",
        "documentation",
        "other",
      ],
      ticket_priority: ["low", "medium", "high", "critical"],
      ticket_status: [
        "open",
        "assigned",
        "in_progress",
        "pending",
        "resolved",
        "closed",
      ],
      training_category: ["drone_ops", "software_usage", "both", "das", "ras"],
      training_payment_status: ["pending", "partial", "paid"],
      training_status: ["requested", "pending", "done"],
      training_type: ["demo", "training"],
    },
  },
} as const
