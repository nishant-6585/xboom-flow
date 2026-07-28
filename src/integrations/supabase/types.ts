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
      abandoned_carts_archive: {
        Row: {
          auto_email_1_sent_at: string | null
          auto_email_2_sent_at: string | null
          auto_email_3_sent_at: string | null
          cart_items: Json | null
          cart_value: number | null
          contacted_at: string | null
          created_at: string | null
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string | null
          last_contacted_by: string | null
          last_contacted_by_name: string | null
          priority: string | null
          recovered_amount: number | null
          recovered_at: string | null
          recovered_order_id: string | null
          recovery_emails_sent: number | null
          recovery_notes: string | null
          recovery_source: string | null
          session_id: string | null
          source: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auto_email_1_sent_at?: string | null
          auto_email_2_sent_at?: string | null
          auto_email_3_sent_at?: string | null
          cart_items?: Json | null
          cart_value?: number | null
          contacted_at?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string | null
          last_contacted_by?: string | null
          last_contacted_by_name?: string | null
          priority?: string | null
          recovered_amount?: number | null
          recovered_at?: string | null
          recovered_order_id?: string | null
          recovery_emails_sent?: number | null
          recovery_notes?: string | null
          recovery_source?: string | null
          session_id?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_email_1_sent_at?: string | null
          auto_email_2_sent_at?: string | null
          auto_email_3_sent_at?: string | null
          cart_items?: Json | null
          cart_value?: number | null
          contacted_at?: string | null
          created_at?: string | null
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string | null
          last_contacted_by?: string | null
          last_contacted_by_name?: string | null
          priority?: string | null
          recovered_amount?: number | null
          recovered_at?: string | null
          recovered_order_id?: string | null
          recovery_emails_sent?: number | null
          recovery_notes?: string | null
          recovery_source?: string | null
          session_id?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
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
      agent_user_mapping: {
        Row: {
          agent_id: string | null
          agent_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          agent_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          agent_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_access_logs: {
        Row: {
          access_type: string
          approval_reference_id: string | null
          created_at: string
          denied_reason: string | null
          id: string
          masked_fields: string[] | null
          query_text: string
          tool_name: string
          user_id: string
          user_role: string
        }
        Insert: {
          access_type?: string
          approval_reference_id?: string | null
          created_at?: string
          denied_reason?: string | null
          id?: string
          masked_fields?: string[] | null
          query_text: string
          tool_name: string
          user_id: string
          user_role: string
        }
        Update: {
          access_type?: string
          approval_reference_id?: string | null
          created_at?: string
          denied_reason?: string | null
          id?: string
          masked_fields?: string[] | null
          query_text?: string
          tool_name?: string
          user_id?: string
          user_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_access_logs_approval_reference_id_fkey"
            columns: ["approval_reference_id"]
            isOneToOne: false
            referencedRelation: "ai_access_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_access_requests: {
        Row: {
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          id: string
          reason: string | null
          requested_data_type: string
          requester_name: string
          requester_user_id: string
          review_notes: string | null
          reviewed_at: string | null
          status: string
          target_description: string | null
          target_entity_id: string | null
        }
        Insert: {
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          requested_data_type: string
          requester_name?: string
          requester_user_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          status?: string
          target_description?: string | null
          target_entity_id?: string | null
        }
        Update: {
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          requested_data_type?: string
          requester_name?: string
          requester_user_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          status?: string
          target_description?: string | null
          target_entity_id?: string | null
        }
        Relationships: []
      }
      ai_action_logs: {
        Row: {
          action_type: string
          created_at: string
          error_message: string | null
          id: string
          payload: Json
          result: Json | null
          status: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          status?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_action_queue: {
        Row: {
          action_type: string
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          id: string
          max_retries: number
          payload: Json
          requires_approval: boolean
          result: Json | null
          retry_count: number
          risk_level: string
          rule_id: string | null
          status: string
          triggered_by: string
          updated_at: string
          user_id: string
          user_name: string
        }
        Insert: {
          action_type: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          max_retries?: number
          payload?: Json
          requires_approval?: boolean
          result?: Json | null
          retry_count?: number
          risk_level?: string
          rule_id?: string | null
          status?: string
          triggered_by?: string
          updated_at?: string
          user_id: string
          user_name?: string
        }
        Update: {
          action_type?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          max_retries?: number
          payload?: Json
          requires_approval?: boolean
          result?: Json | null
          retry_count?: number
          risk_level?: string
          rule_id?: string | null
          status?: string
          triggered_by?: string
          updated_at?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_action_queue_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "ai_auto_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_auto_rules: {
        Row: {
          action_type: string
          allowed_roles: string[]
          condition: Json
          created_at: string
          created_by: string
          created_by_name: string
          description: string | null
          id: string
          is_active: boolean
          payload: Json
          requires_approval: boolean
          risk_level: string
          rule_name: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_type: string
          allowed_roles?: string[]
          condition?: Json
          created_at?: string
          created_by: string
          created_by_name?: string
          description?: string | null
          id?: string
          is_active?: boolean
          payload?: Json
          requires_approval?: boolean
          risk_level?: string
          rule_name: string
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          allowed_roles?: string[]
          condition?: Json
          created_at?: string
          created_by?: string
          created_by_name?: string
          description?: string | null
          id?: string
          is_active?: boolean
          payload?: Json
          requires_approval?: boolean
          risk_level?: string
          rule_name?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_chats: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_kyc_reviews: {
        Row: {
          account_id: string
          ai_confidence: number | null
          created_at: string
          decision: string
          declared_doc_type: string | null
          declared_number_masked: string | null
          document_id: string
          error: string | null
          expected_name: string | null
          extracted_doc_type: string | null
          extracted_holder_name: string | null
          extracted_number_masked: string | null
          flags: Json
          id: string
          legibility: string | null
          model: string | null
          name_match_score: number | null
          number_match: boolean | null
          raw_response: Json | null
          recommendation: string
          type_match: boolean | null
          updated_at: string
        }
        Insert: {
          account_id: string
          ai_confidence?: number | null
          created_at?: string
          decision?: string
          declared_doc_type?: string | null
          declared_number_masked?: string | null
          document_id: string
          error?: string | null
          expected_name?: string | null
          extracted_doc_type?: string | null
          extracted_holder_name?: string | null
          extracted_number_masked?: string | null
          flags?: Json
          id?: string
          legibility?: string | null
          model?: string | null
          name_match_score?: number | null
          number_match?: boolean | null
          raw_response?: Json | null
          recommendation?: string
          type_match?: boolean | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          ai_confidence?: number | null
          created_at?: string
          decision?: string
          declared_doc_type?: string | null
          declared_number_masked?: string | null
          document_id?: string
          error?: string | null
          expected_name?: string | null
          extracted_doc_type?: string | null
          extracted_holder_name?: string | null
          extracted_number_masked?: string | null
          flags?: Json
          id?: string
          legibility?: string | null
          model?: string | null
          name_match_score?: number | null
          number_match?: boolean | null
          raw_response?: Json | null
          recommendation?: string
          type_match?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_kyc_reviews_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_kyc_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kyc_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_learning_logs: {
        Row: {
          context: Json | null
          created_at: string
          execution_result: string | null
          id: string
          suggestion_payload: Json
          suggestion_type: string
          user_id: string
          user_response: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          execution_result?: string | null
          id?: string
          suggestion_payload?: Json
          suggestion_type: string
          user_id: string
          user_response: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          execution_result?: string | null
          id?: string
          suggestion_payload?: Json
          suggestion_type?: string
          user_id?: string
          user_response?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "ai_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_policies: {
        Row: {
          allowed_actions: string[]
          amount_threshold: number | null
          blocked_actions: string[]
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          policy_name: string
          requires_approval_above: number | null
          role: string
          time_restriction_end: string | null
          time_restriction_start: string | null
          updated_at: string
        }
        Insert: {
          allowed_actions?: string[]
          amount_threshold?: number | null
          blocked_actions?: string[]
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          policy_name: string
          requires_approval_above?: number | null
          role: string
          time_restriction_end?: string | null
          time_restriction_start?: string | null
          updated_at?: string
        }
        Update: {
          allowed_actions?: string[]
          amount_threshold?: number | null
          blocked_actions?: string[]
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          policy_name?: string
          requires_approval_above?: number | null
          role?: string
          time_restriction_end?: string | null
          time_restriction_start?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ai_resolution_cache: {
        Row: {
          created_at: string
          error_signature: string
          id: string
          resolution: Json
          source: string
          ticket_category: string | null
        }
        Insert: {
          created_at?: string
          error_signature: string
          id?: string
          resolution: Json
          source?: string
          ticket_category?: string | null
        }
        Update: {
          created_at?: string
          error_signature?: string
          id?: string
          resolution?: Json
          source?: string
          ticket_category?: string | null
        }
        Relationships: []
      }
      ai_resolution_metrics: {
        Row: {
          ai_called: boolean | null
          code_context_length: number | null
          confidence_score: number | null
          created_at: string | null
          id: string
          resolution_type: string | null
          response_time_ms: number | null
          ticket_id: string | null
          used_cache: boolean | null
          used_code_context: boolean | null
          used_rule: boolean | null
          user_feedback: string | null
        }
        Insert: {
          ai_called?: boolean | null
          code_context_length?: number | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          resolution_type?: string | null
          response_time_ms?: number | null
          ticket_id?: string | null
          used_cache?: boolean | null
          used_code_context?: boolean | null
          used_rule?: boolean | null
          user_feedback?: string | null
        }
        Update: {
          ai_called?: boolean | null
          code_context_length?: number | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          resolution_type?: string | null
          response_time_ms?: number | null
          ticket_id?: string | null
          used_cache?: boolean | null
          used_code_context?: boolean | null
          used_rule?: boolean | null
          user_feedback?: string | null
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
      ai_temp_permissions: {
        Row: {
          access_request_id: string | null
          created_at: string
          data_type: string
          expires_at: string
          granted_by: string
          granted_by_name: string
          id: string
          target_entity_id: string | null
          user_id: string
        }
        Insert: {
          access_request_id?: string | null
          created_at?: string
          data_type: string
          expires_at: string
          granted_by: string
          granted_by_name?: string
          id?: string
          target_entity_id?: string | null
          user_id: string
        }
        Update: {
          access_request_id?: string | null
          created_at?: string
          data_type?: string
          expires_at?: string
          granted_by?: string
          granted_by_name?: string
          id?: string
          target_entity_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_temp_permissions_access_request_id_fkey"
            columns: ["access_request_id"]
            isOneToOne: false
            referencedRelation: "ai_access_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
          value?: Json
        }
        Relationships: []
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
          {
            foreignKeyName: "attendance_audit_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          {
            foreignKeyName: "attendance_correction_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
      attention_items: {
        Row: {
          city: string | null
          company: string | null
          created_at: string
          customer_name: string
          email: string | null
          id: string
          marked_by: string
          marked_by_name: string
          notes: string | null
          phone_number: string | null
          product_name: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_name: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          company?: string | null
          created_at?: string
          customer_name: string
          email?: string | null
          id?: string
          marked_by: string
          marked_by_name: string
          notes?: string | null
          phone_number?: string | null
          product_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          company?: string | null
          created_at?: string
          customer_name?: string
          email?: string | null
          id?: string
          marked_by?: string
          marked_by_name?: string
          notes?: string | null
          phone_number?: string | null
          product_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_name?: string | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      attribution_field_audit: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          created_at: string
          db_session_user: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          order_id: string
          source_path: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          db_session_user?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id: string
          source_path: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          db_session_user?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          order_id?: string
          source_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribution_field_audit_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "attribution_field_audit_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_field_audit_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
        ]
      }
      attribution_grants: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bank_reconciliation_uploads: {
        Row: {
          account_number: string | null
          bank_name: string | null
          created_at: string
          error_message: string | null
          file_name: string
          file_type: string
          file_url: string
          id: string
          parsed_count: number | null
          updated_at: string
          upload_status: string
          uploaded_by: string
          uploaded_by_name: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          error_message?: string | null
          file_name: string
          file_type: string
          file_url: string
          id?: string
          parsed_count?: number | null
          updated_at?: string
          upload_status?: string
          uploaded_by: string
          uploaded_by_name?: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_type?: string
          file_url?: string
          id?: string
          parsed_count?: number | null
          updated_at?: string
          upload_status?: string
          uploaded_by?: string
          uploaded_by_name?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          account_id: string | null
          bank_reference: string | null
          created_at: string
          credit_amount: number | null
          debit_amount: number | null
          id: string
          internal_reference: string | null
          match_confidence: number | null
          matched_at: string | null
          matched_by: string | null
          matched_entity_id: string | null
          matched_entity_type: string | null
          narration: string | null
          notes: string | null
          running_balance: number | null
          status: string
          subaccount_id: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string
          upload_id: string | null
          value_date: string | null
        }
        Insert: {
          account_id?: string | null
          bank_reference?: string | null
          created_at?: string
          credit_amount?: number | null
          debit_amount?: number | null
          id?: string
          internal_reference?: string | null
          match_confidence?: number | null
          matched_at?: string | null
          matched_by?: string | null
          matched_entity_id?: string | null
          matched_entity_type?: string | null
          narration?: string | null
          notes?: string | null
          running_balance?: number | null
          status?: string
          subaccount_id?: string | null
          transaction_date: string
          transaction_type?: string
          updated_at?: string
          upload_id?: string | null
          value_date?: string | null
        }
        Update: {
          account_id?: string | null
          bank_reference?: string | null
          created_at?: string
          credit_amount?: number | null
          debit_amount?: number | null
          id?: string
          internal_reference?: string | null
          match_confidence?: number | null
          matched_at?: string | null
          matched_by?: string | null
          matched_entity_id?: string | null
          matched_entity_type?: string | null
          narration?: string | null
          notes?: string | null
          running_balance?: number | null
          status?: string
          subaccount_id?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
          upload_id?: string | null
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_subaccount_id_fkey"
            columns: ["subaccount_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_subaccounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "bank_reconciliation_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      birthday_cards: {
        Row: {
          created_at: string
          employee_id: string
          greeting_message: string | null
          greeting_source: string
          id: string
          photo_path: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          greeting_message?: string | null
          greeting_source?: string
          id?: string
          photo_path?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          greeting_message?: string | null
          greeting_source?: string
          id?: string
          photo_path?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birthday_cards_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_cards_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      birthday_flashes: {
        Row: {
          created_at: string
          employee_id: string
          flash_date: string
          id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          flash_date: string
          id?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          flash_date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "birthday_flashes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_flashes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      birthday_songs: {
        Row: {
          created_at: string
          employee_id: string
          file_path: string
          generation_prompt: string | null
          id: string
          source: string
          title: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          file_path: string
          generation_prompt?: string | null
          id?: string
          source?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          file_path?: string
          generation_prompt?: string | null
          id?: string
          source?: string
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "birthday_songs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "birthday_songs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
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
      call_ai_analysis: {
        Row: {
          budget: string | null
          call_log_id: string
          confidence_score: number | null
          created_at: string
          extracted_data: Json | null
          id: string
          intent: string | null
          key_requirements: string[] | null
          next_action: string | null
          objections: string[] | null
          raw_ai_response: Json | null
          sentiment: string | null
          summary: string | null
          timeline: string | null
          transcript: string | null
        }
        Insert: {
          budget?: string | null
          call_log_id: string
          confidence_score?: number | null
          created_at?: string
          extracted_data?: Json | null
          id?: string
          intent?: string | null
          key_requirements?: string[] | null
          next_action?: string | null
          objections?: string[] | null
          raw_ai_response?: Json | null
          sentiment?: string | null
          summary?: string | null
          timeline?: string | null
          transcript?: string | null
        }
        Update: {
          budget?: string | null
          call_log_id?: string
          confidence_score?: number | null
          created_at?: string
          extracted_data?: Json | null
          id?: string
          intent?: string | null
          key_requirements?: string[] | null
          next_action?: string | null
          objections?: string[] | null
          raw_ai_response?: Json | null
          sentiment?: string | null
          summary?: string | null
          timeline?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_ai_analysis_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          agent_name: string | null
          agent_number: string | null
          assigned_agent_name: string | null
          assigned_agent_phone: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          budget: string | null
          call_duration: number | null
          call_id: string | null
          call_status: string
          call_type: string | null
          caller_number: string
          city: string | null
          company: string | null
          created_at: string
          customer_company: string | null
          customer_name: string | null
          customer_type: string | null
          department: string | null
          disposition: Database["public"]["Enums"]["lead_disposition"]
          disposition_at: string | null
          disposition_by: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          end_time: string | null
          entity_id: string | null
          entity_type: string | null
          exotel_call_sid: string | null
          full_number: string | null
          id: string
          is_a_category: boolean | null
          is_enquiry_converted: boolean
          is_prospect: boolean | null
          ivr_input: string | null
          last_contacted_at: string | null
          lead_created: boolean
          lead_id: string | null
          lead_score: number | null
          lead_source: string | null
          lead_status: string | null
          lead_temperature: string
          notes: string | null
          outcall_info: string | null
          priority: string | null
          product_category: string | null
          product_code: string | null
          product_name: string | null
          purpose_of_purchase: string | null
          quantity: number | null
          raw_payload: Json | null
          raw_transcript: string | null
          recording_fetched_at: string | null
          recording_stream_url: string | null
          recording_url: string | null
          requested_timeline: string | null
          requirement: string | null
          sales_person_id: string | null
          sales_person_name: string | null
          start_time: string | null
          updated_at: string
          urgency: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_number?: string | null
          assigned_agent_name?: string | null
          assigned_agent_phone?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          budget?: string | null
          call_duration?: number | null
          call_id?: string | null
          call_status?: string
          call_type?: string | null
          caller_number: string
          city?: string | null
          company?: string | null
          created_at?: string
          customer_company?: string | null
          customer_name?: string | null
          customer_type?: string | null
          department?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          end_time?: string | null
          entity_id?: string | null
          entity_type?: string | null
          exotel_call_sid?: string | null
          full_number?: string | null
          id?: string
          is_a_category?: boolean | null
          is_enquiry_converted?: boolean
          is_prospect?: boolean | null
          ivr_input?: string | null
          last_contacted_at?: string | null
          lead_created?: boolean
          lead_id?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_status?: string | null
          lead_temperature?: string
          notes?: string | null
          outcall_info?: string | null
          priority?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          purpose_of_purchase?: string | null
          quantity?: number | null
          raw_payload?: Json | null
          raw_transcript?: string | null
          recording_fetched_at?: string | null
          recording_stream_url?: string | null
          recording_url?: string | null
          requested_timeline?: string | null
          requirement?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          start_time?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_number?: string | null
          assigned_agent_name?: string | null
          assigned_agent_phone?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          budget?: string | null
          call_duration?: number | null
          call_id?: string | null
          call_status?: string
          call_type?: string | null
          caller_number?: string
          city?: string | null
          company?: string | null
          created_at?: string
          customer_company?: string | null
          customer_name?: string | null
          customer_type?: string | null
          department?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          end_time?: string | null
          entity_id?: string | null
          entity_type?: string | null
          exotel_call_sid?: string | null
          full_number?: string | null
          id?: string
          is_a_category?: boolean | null
          is_enquiry_converted?: boolean
          is_prospect?: boolean | null
          ivr_input?: string | null
          last_contacted_at?: string | null
          lead_created?: boolean
          lead_id?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_status?: string | null
          lead_temperature?: string
          notes?: string | null
          outcall_info?: string | null
          priority?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          purpose_of_purchase?: string | null
          quantity?: number | null
          raw_payload?: Json | null
          raw_transcript?: string | null
          recording_fetched_at?: string | null
          recording_stream_url?: string | null
          recording_url?: string | null
          requested_timeline?: string | null
          requirement?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          start_time?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Relationships: []
      }
      call_webhook_logs: {
        Row: {
          call_sid: string | null
          created_at: string
          error_message: string | null
          id: string
          processing_status: string
          raw_payload: Json
          source: string
        }
        Insert: {
          call_sid?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          processing_status?: string
          raw_payload: Json
          source?: string
        }
        Update: {
          call_sid?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          processing_status?: string
          raw_payload?: Json
          source?: string
        }
        Relationships: []
      }
      campaign_spend: {
        Row: {
          campaign_id: string
          campaign_name: string | null
          clicks: number | null
          created_at: string
          date: string
          id: string
          impressions: number | null
          spend: number
        }
        Insert: {
          campaign_id: string
          campaign_name?: string | null
          clicks?: number | null
          created_at?: string
          date: string
          id?: string
          impressions?: number | null
          spend?: number
        }
        Update: {
          campaign_id?: string
          campaign_name?: string | null
          clicks?: number | null
          created_at?: string
          date?: string
          id?: string
          impressions?: number | null
          spend?: number
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
          relevant_experience_months: number | null
          relevant_experience_years: number | null
          remarks: string | null
          resume_url: string | null
          screening_status:
            | Database["public"]["Enums"]["screening_status"]
            | null
          source: string | null
          status: Database["public"]["Enums"]["candidate_status"]
          total_experience_months: number | null
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
          relevant_experience_months?: number | null
          relevant_experience_years?: number | null
          remarks?: string | null
          resume_url?: string | null
          screening_status?:
            | Database["public"]["Enums"]["screening_status"]
            | null
          source?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          total_experience_months?: number | null
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
          relevant_experience_months?: number | null
          relevant_experience_years?: number | null
          remarks?: string | null
          resume_url?: string | null
          screening_status?:
            | Database["public"]["Enums"]["screening_status"]
            | null
          source?: string | null
          status?: Database["public"]["Enums"]["candidate_status"]
          total_experience_months?: number | null
          updated_at?: string
          years_of_experience?: number | null
        }
        Relationships: []
      }
      cc_payments: {
        Row: {
          amount: number
          card_id: string
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_mode: string
          recorded_by: string
          recorded_by_name: string
          reference_number: string | null
          statement_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          card_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date: string
          payment_mode?: string
          recorded_by: string
          recorded_by_name?: string
          reference_number?: string | null
          statement_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          card_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          recorded_by?: string
          recorded_by_name?: string
          reference_number?: string | null
          statement_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cc_payments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_payments_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "cc_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      cc_statements: {
        Row: {
          amount_paid: number | null
          available_credit_limit: number
          billing_month: string
          card_id: string
          created_at: string
          due_date: string
          id: string
          interest_charged: number
          late_fee: number
          minimum_due: number
          outstanding_balance: number
          payment_date: string | null
          payment_status: string
          total_due: number
          updated_at: string
          upload_id: string | null
        }
        Insert: {
          amount_paid?: number | null
          available_credit_limit?: number
          billing_month: string
          card_id: string
          created_at?: string
          due_date: string
          id?: string
          interest_charged?: number
          late_fee?: number
          minimum_due?: number
          outstanding_balance?: number
          payment_date?: string | null
          payment_status?: string
          total_due?: number
          updated_at?: string
          upload_id?: string | null
        }
        Update: {
          amount_paid?: number | null
          available_credit_limit?: number
          billing_month?: string
          card_id?: string
          created_at?: string
          due_date?: string
          id?: string
          interest_charged?: number
          late_fee?: number
          minimum_due?: number
          outstanding_balance?: number
          payment_date?: string | null
          payment_status?: string
          total_due?: number
          updated_at?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cc_statements_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_statements_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "statement_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      cc_transactions: {
        Row: {
          amount: number
          card_id: string
          category: string | null
          created_at: string
          description: string
          id: string
          merchant_name: string | null
          statement_id: string
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          amount?: number
          card_id: string
          category?: string | null
          created_at?: string
          description: string
          id?: string
          merchant_name?: string | null
          statement_id: string
          transaction_date: string
          transaction_type?: string
        }
        Update: {
          amount?: number
          card_id?: string
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          merchant_name?: string | null
          statement_id?: string
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cc_transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_transactions_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "cc_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          checklist_type: string
          created_at: string
          id: string
          is_active: boolean
          item_name: string
          item_order: number
          updated_at: string
        }
        Insert: {
          checklist_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_name: string
          item_order?: number
          updated_at?: string
        }
        Update: {
          checklist_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          item_name?: string
          item_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      claim_audit_log: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          created_at: string
          error_code: string | null
          event_type: string
          id: string
          metadata: Json
          order_id: string | null
          outcome: string | null
          query_kind: string | null
          query_length: number | null
          reason_code: string | null
          request_id: string | null
          result_count: number | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          error_code?: string | null
          event_type: string
          id?: string
          metadata?: Json
          order_id?: string | null
          outcome?: string | null
          query_kind?: string | null
          query_length?: number | null
          reason_code?: string | null
          request_id?: string | null
          result_count?: number | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          error_code?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          order_id?: string | null
          outcome?: string | null
          query_kind?: string | null
          query_length?: number | null
          reason_code?: string | null
          request_id?: string | null
          result_count?: number | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          account_owner_id: string | null
          address: string | null
          ai_brief: string | null
          ai_brief_generated_at: string | null
          city: string | null
          created_at: string
          created_by: string
          created_by_name: string
          email: string | null
          engagement_stage: string | null
          engagement_stage_updated_at: string | null
          health_band: string | null
          health_score: number | null
          id: string
          industry: string | null
          is_recurring: boolean | null
          last_activity_at: string | null
          last_order_at: string | null
          name: string
          next_action_at: string | null
          next_action_notes: string | null
          next_action_type: string | null
          notes: string | null
          phone: string | null
          pipeline_value: number | null
          potential_value: number | null
          state: string | null
          status: string
          tier: string | null
          tier_locked_at: string | null
          tier_locked_by: string | null
          tier_notes: string | null
          tier_source: string | null
          total_order_value: number | null
          total_orders_count: number | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_owner_id?: string | null
          address?: string | null
          ai_brief?: string | null
          ai_brief_generated_at?: string | null
          city?: string | null
          created_at?: string
          created_by: string
          created_by_name?: string
          email?: string | null
          engagement_stage?: string | null
          engagement_stage_updated_at?: string | null
          health_band?: string | null
          health_score?: number | null
          id?: string
          industry?: string | null
          is_recurring?: boolean | null
          last_activity_at?: string | null
          last_order_at?: string | null
          name: string
          next_action_at?: string | null
          next_action_notes?: string | null
          next_action_type?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_value?: number | null
          potential_value?: number | null
          state?: string | null
          status?: string
          tier?: string | null
          tier_locked_at?: string | null
          tier_locked_by?: string | null
          tier_notes?: string | null
          tier_source?: string | null
          total_order_value?: number | null
          total_orders_count?: number | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_owner_id?: string | null
          address?: string | null
          ai_brief?: string | null
          ai_brief_generated_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          email?: string | null
          engagement_stage?: string | null
          engagement_stage_updated_at?: string | null
          health_band?: string | null
          health_score?: number | null
          id?: string
          industry?: string | null
          is_recurring?: boolean | null
          last_activity_at?: string | null
          last_order_at?: string | null
          name?: string
          next_action_at?: string | null
          next_action_notes?: string | null
          next_action_type?: string | null
          notes?: string | null
          phone?: string | null
          pipeline_value?: number | null
          potential_value?: number | null
          state?: string | null
          status?: string
          tier?: string | null
          tier_locked_at?: string | null
          tier_locked_by?: string | null
          tier_notes?: string | null
          tier_source?: string | null
          total_order_value?: number | null
          total_orders_count?: number | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_activities: {
        Row: {
          activity_type: string
          amount: number | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json | null
          occurred_at: string
          reference_id: string | null
          reference_table: string | null
          source: string
          title: string
        }
        Insert: {
          activity_type: string
          amount?: number | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          occurred_at?: string
          reference_id?: string | null
          reference_table?: string | null
          source: string
          title: string
        }
        Update: {
          activity_type?: string
          amount?: number | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          occurred_at?: string
          reference_id?: string | null
          reference_table?: string | null
          source?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_contacts: {
        Row: {
          city: string | null
          company_id: string
          created_at: string
          department: string | null
          designation: string | null
          email: string | null
          id: string
          is_primary: boolean | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          company_id: string
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          company_id?: string
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_saved_views: {
        Row: {
          created_at: string
          filters: Json
          id: string
          is_shared: boolean | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          is_shared?: boolean | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          is_shared?: boolean | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      compoff_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          comment: string | null
          created_at: string
          earned_date: string | null
          earned_type: string | null
          employee_id: string
          id: string
          ledger_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          comment?: string | null
          created_at?: string
          earned_date?: string | null
          earned_type?: string | null
          employee_id: string
          id?: string
          ledger_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          comment?: string | null
          created_at?: string
          earned_date?: string | null
          earned_type?: string | null
          employee_id?: string
          id?: string
          ledger_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compoff_audit_log_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "compoff_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      compoff_ledger: {
        Row: {
          approval_comment: string | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          created_at: string
          created_by: string | null
          earned_date: string
          earned_type: string
          employee_id: string
          expires_at: string
          holiday_id: string | null
          holiday_name: string | null
          id: string
          leave_request_id: string | null
          redeemed_on: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approval_comment?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          created_by?: string | null
          earned_date: string
          earned_type: string
          employee_id: string
          expires_at: string
          holiday_id?: string | null
          holiday_name?: string | null
          id?: string
          leave_request_id?: string | null
          redeemed_on?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approval_comment?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          created_at?: string
          created_by?: string | null
          earned_date?: string
          earned_type?: string
          employee_id?: string
          expires_at?: string
          holiday_id?: string | null
          holiday_name?: string | null
          id?: string
          leave_request_id?: string | null
          redeemed_on?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compoff_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compoff_ledger_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compoff_ledger_holiday_id_fkey"
            columns: ["holiday_id"]
            isOneToOne: false
            referencedRelation: "holidays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compoff_ledger_leave_request_id_fkey"
            columns: ["leave_request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      compoff_notification_log: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          attempts: number
          comment: string | null
          created_at: string
          decision: string
          employee_id: string
          id: string
          last_error: string | null
          ledger_id: string
          reason: string | null
          recipient_email: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          attempts?: number
          comment?: string | null
          created_at?: string
          decision: string
          employee_id: string
          id?: string
          last_error?: string | null
          ledger_id: string
          reason?: string | null
          recipient_email?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          attempts?: number
          comment?: string | null
          created_at?: string
          decision?: string
          employee_id?: string
          id?: string
          last_error?: string | null
          ledger_id?: string
          reason?: string | null
          recipient_email?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compoff_notification_log_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "compoff_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_directory: {
        Row: {
          contact_key: string
          created_at: string
          current_owner: string | null
          current_owner_name: string | null
          display_name: string | null
          email_key: string | null
          first_seen_at: string
          last_disposition: Database["public"]["Enums"]["lead_disposition"]
          last_disposition_at: string | null
          last_disposition_reason_code: string | null
          last_disposition_reason_note: string | null
          last_seen_at: string
          normalized_phone: string | null
          touchpoint_count: number
          updated_at: string
        }
        Insert: {
          contact_key: string
          created_at?: string
          current_owner?: string | null
          current_owner_name?: string | null
          display_name?: string | null
          email_key?: string | null
          first_seen_at?: string
          last_disposition?: Database["public"]["Enums"]["lead_disposition"]
          last_disposition_at?: string | null
          last_disposition_reason_code?: string | null
          last_disposition_reason_note?: string | null
          last_seen_at?: string
          normalized_phone?: string | null
          touchpoint_count?: number
          updated_at?: string
        }
        Update: {
          contact_key?: string
          created_at?: string
          current_owner?: string | null
          current_owner_name?: string | null
          display_name?: string | null
          email_key?: string | null
          first_seen_at?: string
          last_disposition?: Database["public"]["Enums"]["lead_disposition"]
          last_disposition_at?: string | null
          last_disposition_reason_code?: string | null
          last_disposition_reason_note?: string | null
          last_seen_at?: string
          normalized_phone?: string | null
          touchpoint_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      contact_touchpoints: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          contact_key: string
          contact_name: string | null
          created_at: string
          email_key: string | null
          id: string
          normalized_phone: string | null
          occurred_at: string
          raw: Json | null
          source: string
          source_row_id: string
          status: string | null
          summary: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          contact_key: string
          contact_name?: string | null
          created_at?: string
          email_key?: string | null
          id?: string
          normalized_phone?: string | null
          occurred_at?: string
          raw?: Json | null
          source: string
          source_row_id: string
          status?: string | null
          summary?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          contact_key?: string
          contact_name?: string | null
          created_at?: string
          email_key?: string | null
          id?: string
          normalized_phone?: string | null
          occurred_at?: string
          raw?: Json | null
          source?: string
          source_row_id?: string
          status?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_touchpoints_contact_key_fkey"
            columns: ["contact_key"]
            isOneToOne: false
            referencedRelation: "contact_directory"
            referencedColumns: ["contact_key"]
          },
        ]
      }
      courier_partners: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          tracking_url: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          tracking_url?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tracking_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_cards: {
        Row: {
          bank_name: string
          card_name: string
          created_at: string
          credit_limit: number
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          bank_name: string
          card_name: string
          created_at?: string
          credit_limit?: number
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          bank_name?: string
          card_name?: string
          created_at?: string
          credit_limit?: number
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      crm_contact_activities: {
        Row: {
          activity_date: string
          activity_type: string
          created_at: string
          followup_completed: boolean | null
          followup_completed_at: string | null
          followup_date: string | null
          id: string
          notes: string | null
          outcome: string | null
          performed_by: string
          performed_by_name: string
          prospect_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          activity_date?: string
          activity_type?: string
          created_at?: string
          followup_completed?: boolean | null
          followup_completed_at?: string | null
          followup_date?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          performed_by: string
          performed_by_name?: string
          prospect_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          activity_date?: string
          activity_type?: string
          created_at?: string
          followup_completed?: boolean | null
          followup_completed_at?: string | null
          followup_date?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          performed_by?: string
          performed_by_name?: string
          prospect_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_activities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "customer_testimonials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_testimonials_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_flow_entries: {
        Row: {
          actual_value: number | null
          created_at: string | null
          created_by: string
          created_by_name: string
          description: string
          duration_mins: number
          employee_id: string
          employee_name: string
          flow_date: string
          frequency: string | null
          frequency_days: string[] | null
          id: string
          is_break: boolean | null
          links: string[] | null
          notes: string | null
          sl_no: number
          sub_items: string[] | null
          target_value: number | null
          task_description: string | null
          template_id: string | null
          time_from: string
          time_to: string
          updated_at: string | null
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          actual_value?: number | null
          created_at?: string | null
          created_by: string
          created_by_name: string
          description: string
          duration_mins: number
          employee_id: string
          employee_name: string
          flow_date?: string
          frequency?: string | null
          frequency_days?: string[] | null
          id?: string
          is_break?: boolean | null
          links?: string[] | null
          notes?: string | null
          sl_no: number
          sub_items?: string[] | null
          target_value?: number | null
          task_description?: string | null
          template_id?: string | null
          time_from: string
          time_to: string
          updated_at?: string | null
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          actual_value?: number | null
          created_at?: string | null
          created_by?: string
          created_by_name?: string
          description?: string
          duration_mins?: number
          employee_id?: string
          employee_name?: string
          flow_date?: string
          frequency?: string | null
          frequency_days?: string[] | null
          id?: string
          is_break?: boolean | null
          links?: string[] | null
          notes?: string | null
          sl_no?: number
          sub_items?: string[] | null
          target_value?: number | null
          task_description?: string | null
          template_id?: string | null
          time_from?: string
          time_to?: string
          updated_at?: string | null
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_flow_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_flow_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_flow_entries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "daily_flow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_flow_templates: {
        Row: {
          created_at: string | null
          created_by: string
          created_by_name: string
          description: string
          duration_mins: number
          employee_id: string
          employee_name: string
          frequency: string
          frequency_days: string[] | null
          id: string
          is_break: boolean | null
          sl_no: number
          sub_items: string[] | null
          target_value: number | null
          template_name: string | null
          time_from: string
          time_to: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          created_by_name: string
          description: string
          duration_mins: number
          employee_id: string
          employee_name: string
          frequency?: string
          frequency_days?: string[] | null
          id?: string
          is_break?: boolean | null
          sl_no: number
          sub_items?: string[] | null
          target_value?: number | null
          template_name?: string | null
          time_from: string
          time_to: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          created_by_name?: string
          description?: string
          duration_mins?: number
          employee_id?: string
          employee_name?: string
          frequency?: string
          frequency_days?: string[] | null
          id?: string
          is_break?: boolean | null
          sl_no?: number
          sub_items?: string[] | null
          target_value?: number | null
          template_name?: string | null
          time_from?: string
          time_to?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_flow_templates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_flow_templates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_findings: {
        Row: {
          bad_value: string
          customer_name: string | null
          detected_at: string
          field_name: string
          id: string
          owner_name: string | null
          owner_user_id: string | null
          product_name: string | null
          reason: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          source_id: string
          source_table: string
        }
        Insert: {
          bad_value: string
          customer_name?: string | null
          detected_at?: string
          field_name?: string
          id?: string
          owner_name?: string | null
          owner_user_id?: string | null
          product_name?: string | null
          reason: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          source_id: string
          source_table: string
        }
        Update: {
          bad_value?: string
          customer_name?: string | null
          detected_at?: string
          field_name?: string
          id?: string
          owner_name?: string | null
          owner_user_id?: string | null
          product_name?: string | null
          reason?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string
          source_table?: string
        }
        Relationships: []
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
      dev_report_issues: {
        Row: {
          category: string
          code_snippet: string | null
          created_at: string
          file_path: string | null
          id: string
          line_number: number | null
          message: string
          report_id: string
          resolution_status: string
          resolved_at: string | null
          severity: string
          suggestion: string | null
        }
        Insert: {
          category: string
          code_snippet?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          line_number?: number | null
          message: string
          report_id: string
          resolution_status?: string
          resolved_at?: string | null
          severity: string
          suggestion?: string | null
        }
        Update: {
          category?: string
          code_snippet?: string | null
          created_at?: string
          file_path?: string | null
          id?: string
          line_number?: number | null
          message?: string
          report_id?: string
          resolution_status?: string
          resolved_at?: string | null
          severity?: string
          suggestion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_report_issues_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dev_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_reports: {
        Row: {
          branch: string
          commit_range: string | null
          commit_sha: string | null
          created_at: string
          critical_count: number
          high_count: number
          id: string
          info_count: number
          low_count: number
          medium_count: number
          repo: string
          status: string
          summary: string | null
          total_issues: number
          trigger_type: string
          triggered_at: string
        }
        Insert: {
          branch?: string
          commit_range?: string | null
          commit_sha?: string | null
          created_at?: string
          critical_count?: number
          high_count?: number
          id?: string
          info_count?: number
          low_count?: number
          medium_count?: number
          repo?: string
          status?: string
          summary?: string | null
          total_issues?: number
          trigger_type?: string
          triggered_at?: string
        }
        Update: {
          branch?: string
          commit_range?: string | null
          commit_sha?: string | null
          created_at?: string
          critical_count?: number
          high_count?: number
          id?: string
          info_count?: number
          low_count?: number
          medium_count?: number
          repo?: string
          status?: string
          summary?: string | null
          total_issues?: number
          trigger_type?: string
          triggered_at?: string
        }
        Relationships: []
      }
      dm_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          last_message_preview: string | null
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          user_a?: string
          user_b?: string
        }
        Relationships: []
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
      drone_operations: {
        Row: {
          activity_datetime: string
          activity_type: string
          client_name: string
          created_at: string
          created_by: string | null
          equipment_used: Json | null
          id: string
          location: string | null
          project_name: string
          remarks: string | null
          report_file_url: string | null
          service_fee: number | null
          status: string
          team_members: string[] | null
          updated_at: string
          work_description: string | null
        }
        Insert: {
          activity_datetime: string
          activity_type: string
          client_name: string
          created_at?: string
          created_by?: string | null
          equipment_used?: Json | null
          id?: string
          location?: string | null
          project_name: string
          remarks?: string | null
          report_file_url?: string | null
          service_fee?: number | null
          status?: string
          team_members?: string[] | null
          updated_at?: string
          work_description?: string | null
        }
        Update: {
          activity_datetime?: string
          activity_type?: string
          client_name?: string
          created_at?: string
          created_by?: string | null
          equipment_used?: Json | null
          id?: string
          location?: string | null
          project_name?: string
          remarks?: string | null
          report_file_url?: string | null
          service_fee?: number | null
          status?: string
          team_members?: string[] | null
          updated_at?: string
          work_description?: string | null
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
      email_lead_pipeline_stats: {
        Row: {
          avg_confidence: number | null
          avg_latency_seconds: number | null
          created_at: string | null
          false_positive_count: number | null
          id: string
          spam_detected: number | null
          stat_date: string
          total_failed: number | null
          total_ingested: number | null
          total_needs_review: number | null
          total_processed: number | null
          total_rejected: number | null
        }
        Insert: {
          avg_confidence?: number | null
          avg_latency_seconds?: number | null
          created_at?: string | null
          false_positive_count?: number | null
          id?: string
          spam_detected?: number | null
          stat_date?: string
          total_failed?: number | null
          total_ingested?: number | null
          total_needs_review?: number | null
          total_processed?: number | null
          total_rejected?: number | null
        }
        Update: {
          avg_confidence?: number | null
          avg_latency_seconds?: number | null
          created_at?: string | null
          false_positive_count?: number | null
          id?: string
          spam_detected?: number | null
          stat_date?: string
          total_failed?: number | null
          total_ingested?: number | null
          total_needs_review?: number | null
          total_processed?: number | null
          total_rejected?: number | null
        }
        Relationships: []
      }
      email_leads: {
        Row: {
          ai_confidence: number | null
          ai_extracted_json: Json | null
          ai_processed: boolean
          assigned_to: string | null
          assigned_to_name: string | null
          body_html: string | null
          body_text: string | null
          city: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          customer_company: string | null
          customer_name: string
          customer_type: string | null
          disposition: Database["public"]["Enums"]["lead_disposition"]
          disposition_at: string | null
          disposition_by: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          email_lead_id: string | null
          error_message: string | null
          id: string
          ingested_at: string | null
          is_a_category: boolean | null
          is_enquiry_converted: boolean
          is_prospect: boolean | null
          last_error: string | null
          lead_source: string | null
          mail_source: string
          notes: string | null
          phone_number: string | null
          processed_at: string | null
          processing_status: string
          product_category: string | null
          product_code: string | null
          product_name: string | null
          purpose_of_purchase: string | null
          quantity: number | null
          requested_timeline: string | null
          retry_count: number
          sales_person_id: string | null
          sales_person_name: string | null
          status: string | null
          subject: string | null
          thread_id: string | null
          updated_at: string
          updated_by: string | null
          urgency: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_extracted_json?: Json | null
          ai_processed?: boolean
          assigned_to?: string | null
          assigned_to_name?: string | null
          body_html?: string | null
          body_text?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_company?: string | null
          customer_name: string
          customer_type?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          email_lead_id?: string | null
          error_message?: string | null
          id?: string
          ingested_at?: string | null
          is_a_category?: boolean | null
          is_enquiry_converted?: boolean
          is_prospect?: boolean | null
          last_error?: string | null
          lead_source?: string | null
          mail_source?: string
          notes?: string | null
          phone_number?: string | null
          processed_at?: string | null
          processing_status?: string
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          purpose_of_purchase?: string | null
          quantity?: number | null
          requested_timeline?: string | null
          retry_count?: number
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: string | null
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
          updated_by?: string | null
          urgency?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_extracted_json?: Json | null
          ai_processed?: boolean
          assigned_to?: string | null
          assigned_to_name?: string | null
          body_html?: string | null
          body_text?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_company?: string | null
          customer_name?: string
          customer_type?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          email_lead_id?: string | null
          error_message?: string | null
          id?: string
          ingested_at?: string | null
          is_a_category?: boolean | null
          is_enquiry_converted?: boolean
          is_prospect?: boolean | null
          last_error?: string | null
          lead_source?: string | null
          mail_source?: string
          notes?: string | null
          phone_number?: string | null
          processed_at?: string | null
          processing_status?: string
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          purpose_of_purchase?: string | null
          quantity?: number | null
          requested_timeline?: string | null
          retry_count?: number
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: string | null
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
          updated_by?: string | null
          urgency?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_sender_frequency: {
        Row: {
          created_at: string | null
          first_seen_at: string | null
          id: string
          is_bulk_sender: boolean | null
          last_seen_at: string | null
          message_count: number | null
          sender_email: string
        }
        Insert: {
          created_at?: string | null
          first_seen_at?: string | null
          id?: string
          is_bulk_sender?: boolean | null
          last_seen_at?: string | null
          message_count?: number | null
          sender_email: string
        }
        Update: {
          created_at?: string | null
          first_seen_at?: string | null
          id?: string
          is_bulk_sender?: boolean | null
          last_seen_at?: string | null
          message_count?: number | null
          sender_email?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
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
          {
            foreignKeyName: "employee_assets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_bank_audit_log: {
        Row: {
          changed_by: string | null
          created_at: string
          employee_id: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          employee_id: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          employee_id?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_bank_audit_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_bank_audit_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_checklist_items: {
        Row: {
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          created_at: string
          id: string
          is_applicable: boolean
          is_completed: boolean
          item_name: string
          item_order: number
          notes: string | null
          template_item_id: string | null
          updated_at: string
        }
        Insert: {
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          id?: string
          is_applicable?: boolean
          is_completed?: boolean
          item_name: string
          item_order?: number
          notes?: string | null
          template_item_id?: string | null
          updated_at?: string
        }
        Update: {
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          id?: string
          is_applicable?: boolean
          is_completed?: boolean
          item_name?: string
          item_order?: number
          notes?: string | null
          template_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "employee_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_checklist_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_checklists: {
        Row: {
          checklist_type: string
          completion_percentage: number
          created_at: string
          employee_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          checklist_type: string
          completion_percentage?: number
          created_at?: string
          employee_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          checklist_type?: string
          completion_percentage?: number
          created_at?: string
          employee_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_checklists_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_checklists_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_kpi_progress: {
        Row: {
          achieved_value: number
          approval_status: string
          approved_at: string | null
          approved_by: string | null
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
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
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
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
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
          kpi_source: Database["public"]["Enums"]["kpi_source"]
          measurement_unit: Database["public"]["Enums"]["kpi_measurement_unit"]
          month: number
          priority: Database["public"]["Enums"]["kpi_priority"]
          status: Database["public"]["Enums"]["kpi_rag_status"]
          target_value: number
          title: string
          updated_at: string
          weightage: number
          workflow_status: Database["public"]["Enums"]["kpi_workflow_status"]
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
          kpi_source?: Database["public"]["Enums"]["kpi_source"]
          measurement_unit?: Database["public"]["Enums"]["kpi_measurement_unit"]
          month: number
          priority?: Database["public"]["Enums"]["kpi_priority"]
          status?: Database["public"]["Enums"]["kpi_rag_status"]
          target_value: number
          title: string
          updated_at?: string
          weightage?: number
          workflow_status?: Database["public"]["Enums"]["kpi_workflow_status"]
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
          kpi_source?: Database["public"]["Enums"]["kpi_source"]
          measurement_unit?: Database["public"]["Enums"]["kpi_measurement_unit"]
          month?: number
          priority?: Database["public"]["Enums"]["kpi_priority"]
          status?: Database["public"]["Enums"]["kpi_rag_status"]
          target_value?: number
          title?: string
          updated_at?: string
          weightage?: number
          workflow_status?: Database["public"]["Enums"]["kpi_workflow_status"]
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
          {
            foreignKeyName: "employee_kpis_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payslips: {
        Row: {
          employee_id: string
          generated_at: string
          generated_by: string | null
          generated_by_name: string | null
          id: string
          month: number
          pdf_url: string
          salary_sheet_id: string
          year: number
        }
        Insert: {
          employee_id: string
          generated_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          month: number
          pdf_url: string
          salary_sheet_id: string
          year: number
        }
        Update: {
          employee_id?: string
          generated_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          month?: number
          pdf_url?: string
          salary_sheet_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payslips_salary_sheet_id_fkey"
            columns: ["salary_sheet_id"]
            isOneToOne: false
            referencedRelation: "salary_sheets"
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
          {
            foreignKeyName: "employee_roles_responsibilities_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_training_resources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          resource_order: number
          resource_type: string
          thumbnail_url: string | null
          title: string
          training_id: string
          url_or_file_path: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          resource_order?: number
          resource_type: string
          thumbnail_url?: string | null
          title: string
          training_id: string
          url_or_file_path?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          resource_order?: number
          resource_type?: string
          thumbnail_url?: string | null
          title?: string
          training_id?: string
          url_or_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_training_resources_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "employee_trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_trainings: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string
          description: string | null
          id: string
          priority: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name: string
          description?: string | null
          id?: string
          priority?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string
          description?: string | null
          id?: string
          priority?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          bank_account: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          department: string
          designation: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_number: string | null
          employee_type: string | null
          employment_status: Database["public"]["Enums"]["employment_status"]
          exit_date: string | null
          gender: string | null
          id: string
          ifsc_code: string | null
          is_active: boolean | null
          joining_date: string | null
          manager_id: string | null
          monthly_attendance_target: number | null
          monthly_salary: number | null
          name: string
          pan_number: string | null
          personal_email: string | null
          phone: string | null
          role: string | null
          shift_end_time: string | null
          shift_start_time: string | null
          shift_type: string | null
          state: string | null
          tax_regime: string | null
          updated_at: string
          user_id: string | null
          weekly_hours_target: number | null
          work_location: string | null
          xboom_email: string | null
        }
        Insert: {
          bank_account?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_number?: string | null
          employee_type?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          exit_date?: string | null
          gender?: string | null
          id?: string
          ifsc_code?: string | null
          is_active?: boolean | null
          joining_date?: string | null
          manager_id?: string | null
          monthly_attendance_target?: number | null
          monthly_salary?: number | null
          name: string
          pan_number?: string | null
          personal_email?: string | null
          phone?: string | null
          role?: string | null
          shift_end_time?: string | null
          shift_start_time?: string | null
          shift_type?: string | null
          state?: string | null
          tax_regime?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_hours_target?: number | null
          work_location?: string | null
          xboom_email?: string | null
        }
        Update: {
          bank_account?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string
          designation?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_number?: string | null
          employee_type?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          exit_date?: string | null
          gender?: string | null
          id?: string
          ifsc_code?: string | null
          is_active?: boolean | null
          joining_date?: string | null
          manager_id?: string | null
          monthly_attendance_target?: number | null
          monthly_salary?: number | null
          name?: string
          pan_number?: string | null
          personal_email?: string | null
          phone?: string | null
          role?: string | null
          shift_end_time?: string | null
          shift_start_time?: string | null
          shift_type?: string | null
          state?: string | null
          tax_regime?: string | null
          updated_at?: string
          user_id?: string | null
          weekly_hours_target?: number | null
          work_location?: string | null
          xboom_email?: string | null
        }
        Relationships: []
      }
      employment_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          employment_type: string
          id: string
          salary: number | null
          stipend: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          employment_type: string
          id?: string
          salary?: number | null
          stipend?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          employment_type?: string
          id?: string
          salary?: number | null
          stipend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employment_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiries: {
        Row: {
          ad_group_id: string | null
          admin_response: string | null
          admin_response_at: string | null
          admin_response_by: string | null
          admin_response_by_name: string | null
          ai_confidence: number | null
          ai_last_scored_at: string | null
          ai_priority_level: string | null
          ai_score: number | null
          campaign_id: string | null
          campaign_name: string | null
          company_id: string | null
          conversion_date: string | null
          conversion_value: number
          created_at: string
          customer_company: string
          customer_name: string
          customer_state: string | null
          customer_type: string
          email_lead_id: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalated_by_name: string | null
          escalation_reason: string | null
          followup_note: string | null
          followup_note_updated_at: string | null
          followup_note_updated_by_name: string | null
          google_lead_id: string | null
          id: string
          is_converted: boolean
          is_escalated: boolean
          is_mega_deal: boolean | null
          is_prospect: boolean | null
          lead_source: string | null
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
          raw_google_payload: Json | null
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
          ad_group_id?: string | null
          admin_response?: string | null
          admin_response_at?: string | null
          admin_response_by?: string | null
          admin_response_by_name?: string | null
          ai_confidence?: number | null
          ai_last_scored_at?: string | null
          ai_priority_level?: string | null
          ai_score?: number | null
          campaign_id?: string | null
          campaign_name?: string | null
          company_id?: string | null
          conversion_date?: string | null
          conversion_value?: number
          created_at?: string
          customer_company: string
          customer_name: string
          customer_state?: string | null
          customer_type?: string
          email_lead_id?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_by_name?: string | null
          escalation_reason?: string | null
          followup_note?: string | null
          followup_note_updated_at?: string | null
          followup_note_updated_by_name?: string | null
          google_lead_id?: string | null
          id?: string
          is_converted?: boolean
          is_escalated?: boolean
          is_mega_deal?: boolean | null
          is_prospect?: boolean | null
          lead_source?: string | null
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
          raw_google_payload?: Json | null
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
          ad_group_id?: string | null
          admin_response?: string | null
          admin_response_at?: string | null
          admin_response_by?: string | null
          admin_response_by_name?: string | null
          ai_confidence?: number | null
          ai_last_scored_at?: string | null
          ai_priority_level?: string | null
          ai_score?: number | null
          campaign_id?: string | null
          campaign_name?: string | null
          company_id?: string | null
          conversion_date?: string | null
          conversion_value?: number
          created_at?: string
          customer_company?: string
          customer_name?: string
          customer_state?: string | null
          customer_type?: string
          email_lead_id?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalated_by_name?: string | null
          escalation_reason?: string | null
          followup_note?: string | null
          followup_note_updated_at?: string | null
          followup_note_updated_by_name?: string | null
          google_lead_id?: string | null
          id?: string
          is_converted?: boolean
          is_escalated?: boolean
          is_mega_deal?: boolean | null
          is_prospect?: boolean | null
          lead_source?: string | null
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
          raw_google_payload?: Json | null
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
        Relationships: [
          {
            foreignKeyName: "enquiries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiries_email_lead_id_fkey"
            columns: ["email_lead_id"]
            isOneToOne: false
            referencedRelation: "email_leads"
            referencedColumns: ["id"]
          },
        ]
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
      enquiry_messages: {
        Row: {
          created_at: string
          enquiry_id: string
          id: string
          is_initial: boolean
          is_nudge: boolean
          is_quote_mirror: boolean
          is_read: boolean
          message: string
          sender_id: string
          sender_name: string
          sender_role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enquiry_id: string
          id?: string
          is_initial?: boolean
          is_nudge?: boolean
          is_quote_mirror?: boolean
          is_read?: boolean
          message: string
          sender_id: string
          sender_name?: string
          sender_role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enquiry_id?: string
          id?: string
          is_initial?: boolean
          is_nudge?: boolean
          is_quote_mirror?: boolean
          is_read?: boolean
          message?: string
          sender_id?: string
          sender_name?: string
          sender_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_messages_enquiry_id_fkey"
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "expense_order_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_order_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
      false_positive_clear_runs: {
        Row: {
          cleared_count: number
          created_at: string
          error_count: number
          finished_at: string | null
          id: string
          notes: string | null
          skipped_count: number
          started_at: string
          triggered_by: string
        }
        Insert: {
          cleared_count?: number
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          skipped_count?: number
          started_at?: string
          triggered_by?: string
        }
        Update: {
          cleared_count?: number
          created_at?: string
          error_count?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          skipped_count?: number
          started_at?: string
          triggered_by?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          metadata: Json | null
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          enabled?: boolean
          key: string
          metadata?: Json | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          enabled?: boolean
          key?: string
          metadata?: Json | null
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: []
      }
      flow_template_library: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string
          created_by_name: string
          description: string | null
          id: string
          task_count: number | null
          template_name: string
          total_duration_mins: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by: string
          created_by_name?: string
          description?: string | null
          id?: string
          task_count?: number | null
          template_name: string
          total_duration_mins?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string
          created_by_name?: string
          description?: string | null
          id?: string
          task_count?: number | null
          template_name?: string
          total_duration_mins?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      flow_template_library_items: {
        Row: {
          created_at: string | null
          description: string
          duration_mins: number
          frequency: string | null
          frequency_days: string[] | null
          id: string
          is_break: boolean | null
          library_template_id: string
          sl_no: number
          sub_items: string[] | null
          target_value: number | null
          time_from: string
          time_to: string
        }
        Insert: {
          created_at?: string | null
          description: string
          duration_mins?: number
          frequency?: string | null
          frequency_days?: string[] | null
          id?: string
          is_break?: boolean | null
          library_template_id: string
          sl_no: number
          sub_items?: string[] | null
          target_value?: number | null
          time_from: string
          time_to: string
        }
        Update: {
          created_at?: string | null
          description?: string
          duration_mins?: number
          frequency?: string | null
          frequency_days?: string[] | null
          id?: string
          is_break?: boolean | null
          library_template_id?: string
          sl_no?: number
          sub_items?: string[] | null
          target_value?: number | null
          time_from?: string
          time_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_template_library_items_library_template_id_fkey"
            columns: ["library_template_id"]
            isOneToOne: false
            referencedRelation: "flow_template_library"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          created_at: string
          created_by: string
          created_by_name: string
          customer_company: string | null
          customer_name: string
          email: string | null
          followup_at: string
          id: string
          is_a_category: boolean | null
          phone: string | null
          product_name: string | null
          remark: string | null
          reminder_sent: boolean | null
          source_id: string
          source_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          created_by: string
          created_by_name: string
          customer_company?: string | null
          customer_name: string
          email?: string | null
          followup_at: string
          id?: string
          is_a_category?: boolean | null
          phone?: string | null
          product_name?: string | null
          remark?: string | null
          reminder_sent?: boolean | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          customer_company?: string | null
          customer_name?: string
          email?: string | null
          followup_at?: string
          id?: string
          is_a_category?: boolean | null
          phone?: string | null
          product_name?: string | null
          remark?: string | null
          reminder_sent?: boolean | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
          user_id?: string
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
      form_lead_contact_us_counter: {
        Row: {
          counter: number
          id: number
        }
        Insert: {
          counter?: number
          id?: number
        }
        Update: {
          counter?: number
          id?: number
        }
        Relationships: []
      }
      form_leads: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          city: string | null
          company: string | null
          created_at: string
          customer_name: string
          customer_type: string | null
          disposition: Database["public"]["Enums"]["lead_disposition"]
          disposition_at: string | null
          disposition_by: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          form_id: string | null
          form_name: string
          id: string
          is_enquiry_converted: boolean
          notes: string | null
          phone: string | null
          product_name: string | null
          sales_person_id: string | null
          sales_person_name: string | null
          status: string
          submission_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          customer_name?: string
          customer_type?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          form_id?: string | null
          form_name: string
          id?: string
          is_enquiry_converted?: boolean
          notes?: string | null
          phone?: string | null
          product_name?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: string
          submission_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          customer_name?: string
          customer_type?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          form_id?: string | null
          form_name?: string
          id?: string
          is_enquiry_converted?: boolean
          notes?: string | null
          phone?: string | null
          product_name?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: string
          submission_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_leads_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_leads_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
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
          submission_data: Json
          submitted_at: string
        }
        Insert: {
          form_id: string
          id?: string
          submission_data: Json
          submitted_at?: string
        }
        Update: {
          form_id?: string
          id?: string
          submission_data?: Json
          submitted_at?: string
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
          is_public: boolean
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
          is_public?: boolean
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
          is_public?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      gmail_integrations: {
        Row: {
          access_token: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          refresh_token: string
          token_expiry: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          refresh_token: string
          token_expiry?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          refresh_token?: string
          token_expiry?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gmail_sync_logs: {
        Row: {
          created_at: string
          emails_fetched: number
          errors: string | null
          id: string
          integration_id: string
          leads_created: number
        }
        Insert: {
          created_at?: string
          emails_fetched?: number
          errors?: string | null
          id?: string
          integration_id: string
          leads_created?: number
        }
        Update: {
          created_at?: string
          emails_fetched?: number
          errors?: string | null
          id?: string
          integration_id?: string
          leads_created?: number
        }
        Relationships: [
          {
            foreignKeyName: "gmail_sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "gmail_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_ads_leads: {
        Row: {
          ad_group_id: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          city: string | null
          conversion_date: string | null
          conversion_value: number | null
          created_at: string | null
          customer_company: string | null
          customer_name: string
          customer_state: string | null
          disposition: Database["public"]["Enums"]["lead_disposition"]
          disposition_at: string | null
          disposition_by: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          google_lead_id: string | null
          id: string
          is_a_category: boolean | null
          is_converted: boolean | null
          is_prospect: boolean | null
          lead_source: string | null
          lead_temperature: string | null
          notes: string | null
          order_outcome: string | null
          phone: string | null
          product_category: string | null
          product_code: string | null
          product_name: string | null
          quantity: number | null
          raw_google_payload: Json | null
          requested_timeline: string | null
          sales_person_id: string | null
          sales_person_name: string | null
          status: string | null
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          ad_group_id?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          city?: string | null
          conversion_date?: string | null
          conversion_value?: number | null
          created_at?: string | null
          customer_company?: string | null
          customer_name?: string
          customer_state?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          google_lead_id?: string | null
          id?: string
          is_a_category?: boolean | null
          is_converted?: boolean | null
          is_prospect?: boolean | null
          lead_source?: string | null
          lead_temperature?: string | null
          notes?: string | null
          order_outcome?: string | null
          phone?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          quantity?: number | null
          raw_google_payload?: Json | null
          requested_timeline?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          ad_group_id?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          city?: string | null
          conversion_date?: string | null
          conversion_value?: number | null
          created_at?: string | null
          customer_company?: string | null
          customer_name?: string
          customer_state?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          google_lead_id?: string | null
          id?: string
          is_a_category?: boolean | null
          is_converted?: boolean | null
          is_prospect?: boolean | null
          lead_source?: string | null
          lead_temperature?: string | null
          notes?: string | null
          order_outcome?: string | null
          phone?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          quantity?: number | null
          raw_google_payload?: Json | null
          requested_timeline?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: []
      }
      google_ads_sync_log: {
        Row: {
          created_at: string
          duplicates_skipped: number | null
          errors: string[] | null
          id: string
          last_synced_at: string
          leads_fetched: number
          leads_inserted: number
          leads_skipped: number
          retry_count: number | null
          status: string
          sync_duration_ms: number | null
          sync_locked_until: string | null
        }
        Insert: {
          created_at?: string
          duplicates_skipped?: number | null
          errors?: string[] | null
          id?: string
          last_synced_at?: string
          leads_fetched?: number
          leads_inserted?: number
          leads_skipped?: number
          retry_count?: number | null
          status?: string
          sync_duration_ms?: number | null
          sync_locked_until?: string | null
        }
        Update: {
          created_at?: string
          duplicates_skipped?: number | null
          errors?: string[] | null
          id?: string
          last_synced_at?: string
          leads_fetched?: number
          leads_inserted?: number
          leads_skipped?: number
          retry_count?: number | null
          status?: string
          sync_duration_ms?: number | null
          sync_locked_until?: string | null
        }
        Relationships: []
      }
      hiring_requirements: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          experience_required: string | null
          id: string
          location: string | null
          open_positions: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          experience_required?: string | null
          id?: string
          location?: string | null
          open_positions?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          experience_required?: string | null
          id?: string
          location?: string | null
          open_positions?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          holiday_date: string
          holiday_type: Database["public"]["Enums"]["holiday_type"]
          id: string
          is_active: boolean
          is_restricted: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          holiday_date: string
          holiday_type?: Database["public"]["Enums"]["holiday_type"]
          id?: string
          is_active?: boolean
          is_restricted?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          holiday_date?: string
          holiday_type?: Database["public"]["Enums"]["holiday_type"]
          id?: string
          is_active?: boolean
          is_restricted?: boolean
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
          {
            foreignKeyName: "hr_document_shares_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
            foreignKeyName: "hr_folder_shares_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
            foreignKeyName: "hr_folders_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
      hr_process_documents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          is_active: boolean
          mime_type: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          is_active?: boolean
          mime_type?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          is_active?: boolean
          mime_type?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: []
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
      integration_errors: {
        Row: {
          created_at: string
          error_details: Json | null
          error_message: string
          function_name: string
          id: string
          integration: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          error_message: string
          function_name: string
          id?: string
          integration: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          error_message?: string
          function_name?: string
          id?: string
          integration?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: []
      }
      interakt_leads: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          city: string | null
          company: string | null
          country_code: string
          created_at: string
          customer_company: string | null
          customer_name: string
          customer_type: string | null
          disposition: Database["public"]["Enums"]["lead_disposition"]
          disposition_at: string | null
          disposition_by: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          id: string
          interakt_created_at: string | null
          interakt_traits: Json | null
          interakt_user_id: string | null
          is_a_category: boolean | null
          is_enquiry_converted: boolean
          is_prospect: boolean | null
          lead_source: string | null
          notes: string | null
          phone_number: string
          product_category: string | null
          product_code: string | null
          product_name: string | null
          purpose_of_purchase: string | null
          quantity: number | null
          requested_timeline: string | null
          sales_person_id: string | null
          sales_person_name: string | null
          source: string
          status: string
          synced_at: string
          synced_by: string | null
          updated_at: string
          updated_by: string | null
          urgency: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          city?: string | null
          company?: string | null
          country_code?: string
          created_at?: string
          customer_company?: string | null
          customer_name: string
          customer_type?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          id?: string
          interakt_created_at?: string | null
          interakt_traits?: Json | null
          interakt_user_id?: string | null
          is_a_category?: boolean | null
          is_enquiry_converted?: boolean
          is_prospect?: boolean | null
          lead_source?: string | null
          notes?: string | null
          phone_number: string
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          purpose_of_purchase?: string | null
          quantity?: number | null
          requested_timeline?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          source?: string
          status?: string
          synced_at?: string
          synced_by?: string | null
          updated_at?: string
          updated_by?: string | null
          urgency?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          city?: string | null
          company?: string | null
          country_code?: string
          created_at?: string
          customer_company?: string | null
          customer_name?: string
          customer_type?: string | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          id?: string
          interakt_created_at?: string | null
          interakt_traits?: Json | null
          interakt_user_id?: string | null
          is_a_category?: boolean | null
          is_enquiry_converted?: boolean
          is_prospect?: boolean | null
          lead_source?: string | null
          notes?: string | null
          phone_number?: string
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          purpose_of_purchase?: string | null
          quantity?: number | null
          requested_timeline?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          source?: string
          status?: string
          synced_at?: string
          synced_by?: string | null
          updated_at?: string
          updated_by?: string | null
          urgency?: string | null
        }
        Relationships: []
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
          po_number: string | null
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
          po_number?: string | null
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
          po_number?: string | null
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "inventory_procurements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_procurements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "inventory_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
      invitation_email_log: {
        Row: {
          context: string
          created_at: string
          error_message: string | null
          from_address: string
          id: string
          invitation_id: string | null
          provider: string
          provider_message_id: string | null
          recipient_email: string
          status: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          context?: string
          created_at?: string
          error_message?: string | null
          from_address: string
          id?: string
          invitation_id?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient_email: string
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          context?: string
          created_at?: string
          error_message?: string | null
          from_address?: string
          id?: string
          invitation_id?: string | null
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_email_log_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "user_invitations"
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
      invoice_email_log: {
        Row: {
          attempted_at: string
          bypass_reason: string | null
          created_at: string
          doc_type: string
          error: string | null
          id: string
          invoice_id: string
          order_id: string | null
          sent_by: string | null
          status: string
          to_email: string | null
          woocommerce_order_id: string | null
        }
        Insert: {
          attempted_at?: string
          bypass_reason?: string | null
          created_at?: string
          doc_type: string
          error?: string | null
          id?: string
          invoice_id: string
          order_id?: string | null
          sent_by?: string | null
          status: string
          to_email?: string | null
          woocommerce_order_id?: string | null
        }
        Update: {
          attempted_at?: string
          bypass_reason?: string | null
          created_at?: string
          doc_type?: string
          error?: string | null
          id?: string
          invoice_id?: string
          order_id?: string | null
          sent_by?: string | null
          status?: string
          to_email?: string | null
          woocommerce_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_email_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "order_invoices"
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
          payment_mode: string | null
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
          payment_mode?: string | null
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
          payment_mode?: string | null
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
      kyc_audit_log: {
        Row: {
          account_id: string
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string
          document_id: string | null
          id: string
          metadata: Json
          notes: string | null
        }
        Insert: {
          account_id: string
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
        }
        Update: {
          account_id?: string
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string
          document_id?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_audit_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_audit_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kyc_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_digilocker_sessions: {
        Row: {
          account_id: string
          actor_user_id: string | null
          code_verifier: string
          consumed_at: string | null
          contact_id: string | null
          created_at: string
          expires_at: string
          id: string
          redirect_uri: string
          session_id: string
          state: string
        }
        Insert: {
          account_id: string
          actor_user_id?: string | null
          code_verifier: string
          consumed_at?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri: string
          session_id: string
          state: string
        }
        Update: {
          account_id?: string
          actor_user_id?: string | null
          code_verifier?: string
          consumed_at?: string | null
          contact_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          redirect_uri?: string
          session_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_digilocker_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_digilocker_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_documents: {
        Row: {
          account_id: string
          created_at: string
          doc_type: Database["public"]["Enums"]["kyc_doc_type"]
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          is_current: boolean
          metadata: Json
          method: string
          mime_type: string | null
          provider: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["kyc_status"]
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          account_id: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["kyc_doc_type"]
          file_name: string
          file_path: string
          file_size_bytes: number
          id?: string
          is_current?: boolean
          metadata?: Json
          method?: string
          mime_type?: string | null
          provider?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["kyc_doc_type"]
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          is_current?: boolean
          metadata?: Json
          method?: string
          mime_type?: string | null
          provider?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["kyc_status"]
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_email_log: {
        Row: {
          attempt_count: number
          created_at: string
          doc_type: string
          error: string | null
          id: string
          idempotency_key: string | null
          order_id: string | null
          order_number: string | null
          recipient_email: string | null
          sent_by: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          doc_type?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          order_id?: string | null
          order_number?: string | null
          recipient_email?: string | null
          sent_by?: string | null
          status: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          doc_type?: string
          error?: string | null
          id?: string
          idempotency_key?: string | null
          order_id?: string | null
          order_number?: string | null
          recipient_email?: string | null
          sent_by?: string | null
          status?: string
        }
        Relationships: []
      }
      kyc_sensitive_data: {
        Row: {
          aadhaar_full: string | null
          account_id: string
          consent_valid_till: string | null
          created_at: string
          digilockerid: string | null
          dob: string | null
          document_id: string | null
          document_number_full: string | null
          document_reference: string | null
          document_type: string | null
          gender: string | null
          id: string
        }
        Insert: {
          aadhaar_full?: string | null
          account_id: string
          consent_valid_till?: string | null
          created_at?: string
          digilockerid?: string | null
          dob?: string | null
          document_id?: string | null
          document_number_full?: string | null
          document_reference?: string | null
          document_type?: string | null
          gender?: string | null
          id?: string
        }
        Update: {
          aadhaar_full?: string | null
          account_id?: string
          consent_valid_till?: string | null
          created_at?: string
          digilockerid?: string | null
          dob?: string | null
          document_id?: string | null
          document_number_full?: string | null
          document_reference?: string | null
          document_type?: string | null
          gender?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_sensitive_data_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_sensitive_data_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "kyc_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignment_counter: {
        Row: {
          counter: number
          id: number
        }
        Insert: {
          counter?: number
          id?: number
        }
        Update: {
          counter?: number
          id?: number
        }
        Relationships: []
      }
      lead_assignment_state: {
        Row: {
          id: number
          next_index: number
        }
        Insert: {
          id?: number
          next_index?: number
        }
        Update: {
          id?: number
          next_index?: number
        }
        Relationships: []
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
      lead_touch_marks: {
        Row: {
          created_at: string
          id: string
          marked_by: string
          marked_by_name: string | null
          note: string | null
          source_id: string
          source_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          marked_by: string
          marked_by_name?: string | null
          note?: string | null
          source_id: string
          source_type: string
        }
        Update: {
          created_at?: string
          id?: string
          marked_by?: string
          marked_by_name?: string | null
          note?: string | null
          source_id?: string
          source_type?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
          assigned_to_name: string | null
          company: string | null
          created_at: string
          destinations: Json | null
          disposition: Database["public"]["Enums"]["lead_disposition"]
          disposition_at: string | null
          disposition_by: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          form_type: string | null
          id: number
          ip: string | null
          is_enquiry_converted: boolean
          last_contacted_at: string | null
          lead_temperature: string
          location: string | null
          message: string | null
          name: string | null
          page_url: string | null
          payload: Json | null
          phone: string | null
          role: string | null
          sector: string | null
          source: string | null
          status: string
          subject: string | null
          submitted_at: string | null
          urgency: string | null
          user_agent: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          company?: string | null
          created_at?: string
          destinations?: Json | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          form_type?: string | null
          id?: never
          ip?: string | null
          is_enquiry_converted?: boolean
          last_contacted_at?: string | null
          lead_temperature?: string
          location?: string | null
          message?: string | null
          name?: string | null
          page_url?: string | null
          payload?: Json | null
          phone?: string | null
          role?: string | null
          sector?: string | null
          source?: string | null
          status?: string
          subject?: string | null
          submitted_at?: string | null
          urgency?: string | null
          user_agent?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_name?: string | null
          company?: string | null
          created_at?: string
          destinations?: Json | null
          disposition?: Database["public"]["Enums"]["lead_disposition"]
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_by_name?: string | null
          disposition_reason_code?: string | null
          disposition_reason_note?: string | null
          email?: string | null
          form_type?: string | null
          id?: never
          ip?: string | null
          is_enquiry_converted?: boolean
          last_contacted_at?: string | null
          lead_temperature?: string
          location?: string | null
          message?: string | null
          name?: string | null
          page_url?: string | null
          payload?: Json | null
          phone?: string | null
          role?: string | null
          sector?: string | null
          source?: string | null
          status?: string
          subject?: string | null
          submitted_at?: string | null
          urgency?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      leave_balances: {
        Row: {
          balance: number
          created_at: string
          employee_id: string
          id: string
          leave_type: string
          updated_at: string
          year: number
        }
        Insert: {
          balance?: number
          created_at?: string
          employee_id: string
          id?: string
          leave_type?: string
          updated_at?: string
          year?: number
        }
        Update: {
          balance?: number
          created_at?: string
          employee_id?: string
          id?: string
          leave_type?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          ai_review_confidence: number | null
          ai_review_model: string | null
          ai_reviewed: boolean
          applied_by_id: string | null
          applied_by_name: string | null
          approved_rejected_at: string | null
          approver_id: string | null
          approver_name: string | null
          comments: string | null
          created_at: string
          employee_id: string
          end_date: string
          id: string
          is_hr_applied: boolean | null
          leave_type: string
          reason: string | null
          start_date: string
          status: string | null
          total_days: number | null
          updated_at: string
        }
        Insert: {
          ai_review_confidence?: number | null
          ai_review_model?: string | null
          ai_reviewed?: boolean
          applied_by_id?: string | null
          applied_by_name?: string | null
          approved_rejected_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          comments?: string | null
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          is_hr_applied?: boolean | null
          leave_type: string
          reason?: string | null
          start_date: string
          status?: string | null
          total_days?: number | null
          updated_at?: string
        }
        Update: {
          ai_review_confidence?: number | null
          ai_review_model?: string | null
          ai_reviewed?: boolean
          applied_by_id?: string | null
          applied_by_name?: string | null
          approved_rejected_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          comments?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          is_hr_applied?: boolean | null
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
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          credit_date: string
          credit_month: number | null
          credit_year: number | null
          employee_id: string
          id: string
          leave_type: string
          remarks: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          credit_date?: string
          credit_month?: number | null
          credit_year?: number | null
          employee_id: string
          id?: string
          leave_type?: string
          remarks?: string | null
          transaction_type?: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          credit_date?: string
          credit_month?: number | null
          credit_year?: number | null
          employee_id?: string
          id?: string
          leave_type?: string
          remarks?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
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
      meeting_participants: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          response_status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          response_status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          response_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          agenda: string | null
          background: string | null
          created_at: string
          description: string | null
          end_datetime: string | null
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
          title: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          agenda?: string | null
          background?: string | null
          created_at?: string
          description?: string | null
          end_datetime?: string | null
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
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          agenda?: string | null
          background?: string | null
          created_at?: string
          description?: string | null
          end_datetime?: string | null
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
          title?: string | null
          updated_at?: string
          visibility?: string
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "meetings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
      missed_call_callbacks: {
        Row: {
          assigned_by: string | null
          assigned_by_name: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          call_log_id: string | null
          call_time: string
          caller_number: string
          city: string | null
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          created_at: string
          customer_company: string | null
          customer_name: string | null
          id: string
          priority: string
          product_name: string | null
          remark: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_by_name?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          call_log_id?: string | null
          call_time?: string
          caller_number: string
          city?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          customer_company?: string | null
          customer_name?: string | null
          id?: string
          priority?: string
          product_name?: string | null
          remark?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assigned_by_name?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          call_log_id?: string | null
          call_time?: string
          caller_number?: string
          city?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          customer_company?: string | null
          customer_name?: string | null
          id?: string
          priority?: string
          product_name?: string | null
          remark?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "missed_call_callbacks_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_pulse_reads: {
        Row: {
          id: string
          pulse_id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          id?: string
          pulse_id: string
          seen_at?: string
          user_id: string
        }
        Update: {
          id?: string
          pulse_id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_pulse_reads_pulse_id_fkey"
            columns: ["pulse_id"]
            isOneToOne: false
            referencedRelation: "monthly_pulses"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_pulses: {
        Row: {
          created_at: string
          description: string | null
          file_url: string
          id: string
          is_active: boolean
          month: string
          title: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_url: string
          id?: string
          is_active?: boolean
          month: string
          title: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          file_url?: string
          id?: string
          is_active?: boolean
          month?: string
          title?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: []
      }
      myoperator_config: {
        Row: {
          api_token: string
          company_id: string
          created_at: string
          id: string
          is_connected: boolean
          secret_key: string
          updated_at: string
          x_api_key: string
        }
        Insert: {
          api_token?: string
          company_id?: string
          created_at?: string
          id?: string
          is_connected?: boolean
          secret_key?: string
          updated_at?: string
          x_api_key?: string
        }
        Update: {
          api_token?: string
          company_id?: string
          created_at?: string
          id?: string
          is_connected?: boolean
          secret_key?: string
          updated_at?: string
          x_api_key?: string
        }
        Relationships: []
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
      notification_circuit_state: {
        Row: {
          id: boolean
          is_open: boolean
          last_reason: string | null
          opened_at: string | null
          reopen_at: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          is_open?: boolean
          last_reason?: string | null
          opened_at?: string | null
          reopen_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          is_open?: boolean
          last_reason?: string | null
          opened_at?: string | null
          reopen_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_rate_limits: {
        Row: {
          count: number
          max_per_minute: number
          provider: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          max_per_minute?: number
          provider: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          count?: number
          max_per_minute?: number
          provider?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          created_at: string
          description: string | null
          event_type: string
          id: string
          is_active: boolean
          language: string
          provider: string
          template_id: string
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          is_active?: boolean
          language?: string
          provider: string
          template_id: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          language?: string
          provider?: string
          template_id?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      notifications: {
        Row: {
          account_id: string | null
          created_at: string
          enquiry_id: string | null
          id: string
          is_read: boolean
          message: string
          order_id: string | null
          portal_ticket_id: string | null
          target_role: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          enquiry_id?: string | null
          id?: string
          is_read?: boolean
          message: string
          order_id?: string | null
          portal_ticket_id?: string | null
          target_role?: string | null
          title: string
          type?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          enquiry_id?: string | null
          id?: string
          is_read?: boolean
          message?: string
          order_id?: string | null
          portal_ticket_id?: string | null
          target_role?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_portal_ticket_id_fkey"
            columns: ["portal_ticket_id"]
            isOneToOne: false
            referencedRelation: "portal_tickets"
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
      order_duplicate_candidates: {
        Row: {
          amount_diff: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          manual_order_id: string
          match_reasons: string[]
          notes: string | null
          payment_records_on_manual: number
          status: string
          updated_at: string
          website_order_id: string
        }
        Insert: {
          amount_diff?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          manual_order_id: string
          match_reasons?: string[]
          notes?: string | null
          payment_records_on_manual?: number
          status?: string
          updated_at?: string
          website_order_id: string
        }
        Update: {
          amount_diff?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          manual_order_id?: string
          match_reasons?: string[]
          notes?: string | null
          payment_records_on_manual?: number
          status?: string
          updated_at?: string
          website_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_duplicate_candidates_manual_order_id_fkey"
            columns: ["manual_order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_duplicate_candidates_manual_order_id_fkey"
            columns: ["manual_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_duplicate_candidates_manual_order_id_fkey"
            columns: ["manual_order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_duplicate_candidates_website_order_id_fkey"
            columns: ["website_order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_duplicate_candidates_website_order_id_fkey"
            columns: ["website_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_duplicate_candidates_website_order_id_fkey"
            columns: ["website_order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
        ]
      }
      order_invoices: {
        Row: {
          amount_paid: number | null
          created_at: string
          document_type: string
          file_name: string | null
          gst_treatment: string | null
          id: string
          invoice_number: string | null
          needs_regenerate: boolean
          order_id: string | null
          override_at: string | null
          override_by: string | null
          override_by_name: string | null
          override_reason: string | null
          place_of_supply: string | null
          regenerate_flagged_at: string | null
          regenerate_reason: string | null
          source: string
          storage_path: string
          subtotal: number | null
          tax_amount: number | null
          tax_breakup: Json | null
          total: number | null
          updated_at: string
          uploaded_by: string | null
          woocommerce_order_id: string | null
          zoho_invoice_id: string | null
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string
          document_type?: string
          file_name?: string | null
          gst_treatment?: string | null
          id?: string
          invoice_number?: string | null
          needs_regenerate?: boolean
          order_id?: string | null
          override_at?: string | null
          override_by?: string | null
          override_by_name?: string | null
          override_reason?: string | null
          place_of_supply?: string | null
          regenerate_flagged_at?: string | null
          regenerate_reason?: string | null
          source?: string
          storage_path: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_breakup?: Json | null
          total?: number | null
          updated_at?: string
          uploaded_by?: string | null
          woocommerce_order_id?: string | null
          zoho_invoice_id?: string | null
        }
        Update: {
          amount_paid?: number | null
          created_at?: string
          document_type?: string
          file_name?: string | null
          gst_treatment?: string | null
          id?: string
          invoice_number?: string | null
          needs_regenerate?: boolean
          order_id?: string | null
          override_at?: string | null
          override_by?: string | null
          override_by_name?: string | null
          override_reason?: string | null
          place_of_supply?: string | null
          regenerate_flagged_at?: string | null
          regenerate_reason?: string | null
          source?: string
          storage_path?: string
          subtotal?: number | null
          tax_amount?: number | null
          tax_breakup?: Json | null
          total?: number | null
          updated_at?: string
          uploaded_by?: string | null
          woocommerce_order_id?: string | null
          zoho_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_invoices_woocommerce_order_id_fkey"
            columns: ["woocommerce_order_id"]
            isOneToOne: false
            referencedRelation: "woocommerce_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          discount_amount: number
          estimated_procurement_rate: number | null
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
          weight_grams: number | null
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          estimated_procurement_rate?: number | null
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
          weight_grams?: number | null
        }
        Update: {
          created_at?: string
          discount_amount?: number
          estimated_procurement_rate?: number | null
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
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
      order_notifications: {
        Row: {
          channel: string
          created_at: string
          dlq_moved: boolean
          error_message: string | null
          id: string
          last_attempt_at: string | null
          latency_ms: number | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          order_number: string | null
          order_ref: string
          order_source: string
          payload: Json
          phone: string | null
          priority: number
          provider: string | null
          provider_message_id: string | null
          provider_response: Json | null
          provider_status_code: number | null
          retry_count: number
          sent_at: string | null
          status: Database["public"]["Enums"]["order_notification_status"]
          status_log_id: string | null
          status_trigger: string
          template_id: string | null
          template_name: string
          updated_at: string
          woo_order_id: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          dlq_moved?: boolean
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          latency_ms?: number | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          order_number?: string | null
          order_ref: string
          order_source: string
          payload?: Json
          phone?: string | null
          priority?: number
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          provider_status_code?: number | null
          retry_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["order_notification_status"]
          status_log_id?: string | null
          status_trigger: string
          template_id?: string | null
          template_name: string
          updated_at?: string
          woo_order_id?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          dlq_moved?: boolean
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          latency_ms?: number | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          order_number?: string | null
          order_ref?: string
          order_source?: string
          payload?: Json
          phone?: string | null
          priority?: number
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          provider_status_code?: number | null
          retry_count?: number
          sent_at?: string | null
          status?: Database["public"]["Enums"]["order_notification_status"]
          status_log_id?: string | null
          status_trigger?: string
          template_id?: string | null
          template_name?: string
          updated_at?: string
          woo_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_notifications_status_log_id_fkey"
            columns: ["status_log_id"]
            isOneToOne: false
            referencedRelation: "woocommerce_order_status_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notifications_dlq: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          moved_at: string
          order_number: string | null
          original_id: string | null
          payload: Json
          phone: string | null
          provider: string | null
          provider_message_id: string | null
          provider_response: Json | null
          retried_by: string | null
          retried_from_dlq_at: string | null
          retry_count: number
          status_trigger: string
          template_name: string | null
          woo_order_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          moved_at?: string
          order_number?: string | null
          original_id?: string | null
          payload?: Json
          phone?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          retried_by?: string | null
          retried_from_dlq_at?: string | null
          retry_count?: number
          status_trigger: string
          template_name?: string | null
          woo_order_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          moved_at?: string
          order_number?: string | null
          original_id?: string | null
          payload?: Json
          phone?: string | null
          provider?: string | null
          provider_message_id?: string | null
          provider_response?: Json | null
          retried_by?: string | null
          retried_from_dlq_at?: string | null
          retry_count?: number
          status_trigger?: string
          template_name?: string | null
          woo_order_id?: string
        }
        Relationships: []
      }
      order_phone_audit_log: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          changed_by_role: string | null
          created_at: string
          id: string
          new_phone: string | null
          old_phone: string | null
          order_id: string
          order_number: string | null
          source: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          changed_by_role?: string | null
          created_at?: string
          id?: string
          new_phone?: string | null
          old_phone?: string | null
          order_id: string
          order_number?: string | null
          source?: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          changed_by_role?: string | null
          created_at?: string
          id?: string
          new_phone?: string | null
          old_phone?: string | null
          order_id?: string
          order_number?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_phone_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_phone_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_phone_audit_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_procurement_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_procurement_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
          additional_details: string | null
          amount_paid: number | null
          attributed_at: string | null
          attributed_by: string | null
          attributed_by_name: string | null
          billing_address: string | null
          campaign_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          committed_timeline: string | null
          company_id: string | null
          confirmation_source: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by_contact: string | null
          courier_name: string | null
          created_at: string
          created_by: string
          customer_company: string | null
          customer_email: string | null
          customer_gst: string | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          customer_type: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          delivery_charges: number | null
          delivery_mode: string | null
          delivery_proof_reject_reason: string | null
          delivery_proof_reviewed_at: string | null
          delivery_proof_reviewed_by: string | null
          delivery_proof_status: string | null
          delivery_proof_uploaded_at: string | null
          delivery_proof_uploaded_by: string | null
          delivery_proof_url: string | null
          discount_amount: number | null
          dispatched_on: string | null
          enquiry_id: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalation_reason: string | null
          estimated_delivery: string | null
          estimated_procurement_rate: number | null
          external_id: string | null
          has_voided_zoho_invoice: boolean
          id: string
          internal_notes: string | null
          invoice_number: string | null
          invoice_url: string | null
          is_escalated: boolean
          is_refund_requested: boolean
          is_rto: boolean
          last_reminder_sent_at: string | null
          lead_source: string | null
          lost_reason: string | null
          lost_reason_notes: string | null
          manual_overrides: string[]
          order_date: string | null
          order_number: string | null
          order_outcome: string | null
          order_type: string | null
          outcome_updated_at: string | null
          outcome_updated_by: string | null
          payment_due_date: string | null
          payment_status: string | null
          payment_terms: string | null
          po_number: string | null
          po_url: string | null
          priority: number | null
          procurement_currency: string | null
          procurement_date: string | null
          procurement_edited: boolean
          procurement_rate: number | null
          product_category: string | null
          product_code: string
          product_name: string
          quantity: number
          refund_reason: string | null
          refund_requested_at: string | null
          refund_requested_by: string | null
          refund_status: string | null
          requires_confirmation: boolean
          rto_marked_at: string | null
          rto_marked_by: string | null
          sales_attribution_locked: boolean
          sales_attribution_reason: string | null
          sales_attribution_reason_custom: string | null
          sales_notes: string | null
          sales_person_id: string
          sales_person_name: string
          selling_price: number | null
          shipping_address: string | null
          source: string
          source_pipeline_id: string | null
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
          additional_details?: string | null
          amount_paid?: number | null
          attributed_at?: string | null
          attributed_by?: string | null
          attributed_by_name?: string | null
          billing_address?: string | null
          campaign_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          committed_timeline?: string | null
          company_id?: string | null
          confirmation_source?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by_contact?: string | null
          courier_name?: string | null
          created_at?: string
          created_by: string
          customer_company?: string | null
          customer_email?: string | null
          customer_gst?: string | null
          customer_name: string
          customer_notes?: string | null
          customer_phone?: string | null
          customer_type?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          delivery_charges?: number | null
          delivery_mode?: string | null
          delivery_proof_reject_reason?: string | null
          delivery_proof_reviewed_at?: string | null
          delivery_proof_reviewed_by?: string | null
          delivery_proof_status?: string | null
          delivery_proof_uploaded_at?: string | null
          delivery_proof_uploaded_by?: string | null
          delivery_proof_url?: string | null
          discount_amount?: number | null
          dispatched_on?: string | null
          enquiry_id?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_reason?: string | null
          estimated_delivery?: string | null
          estimated_procurement_rate?: number | null
          external_id?: string | null
          has_voided_zoho_invoice?: boolean
          id?: string
          internal_notes?: string | null
          invoice_number?: string | null
          invoice_url?: string | null
          is_escalated?: boolean
          is_refund_requested?: boolean
          is_rto?: boolean
          last_reminder_sent_at?: string | null
          lead_source?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          manual_overrides?: string[]
          order_date?: string | null
          order_number?: string | null
          order_outcome?: string | null
          order_type?: string | null
          outcome_updated_at?: string | null
          outcome_updated_by?: string | null
          payment_due_date?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          po_number?: string | null
          po_url?: string | null
          priority?: number | null
          procurement_currency?: string | null
          procurement_date?: string | null
          procurement_edited?: boolean
          procurement_rate?: number | null
          product_category?: string | null
          product_code: string
          product_name: string
          quantity: number
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_requested_by?: string | null
          refund_status?: string | null
          requires_confirmation?: boolean
          rto_marked_at?: string | null
          rto_marked_by?: string | null
          sales_attribution_locked?: boolean
          sales_attribution_reason?: string | null
          sales_attribution_reason_custom?: string | null
          sales_notes?: string | null
          sales_person_id: string
          sales_person_name: string
          selling_price?: number | null
          shipping_address?: string | null
          source?: string
          source_pipeline_id?: string | null
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
          additional_details?: string | null
          amount_paid?: number | null
          attributed_at?: string | null
          attributed_by?: string | null
          attributed_by_name?: string | null
          billing_address?: string | null
          campaign_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          committed_timeline?: string | null
          company_id?: string | null
          confirmation_source?: string | null
          confirmation_status?: string
          confirmed_at?: string | null
          confirmed_by_contact?: string | null
          courier_name?: string | null
          created_at?: string
          created_by?: string
          customer_company?: string | null
          customer_email?: string | null
          customer_gst?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string | null
          customer_type?: string | null
          delete_reason?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_name?: string | null
          delivery_charges?: number | null
          delivery_mode?: string | null
          delivery_proof_reject_reason?: string | null
          delivery_proof_reviewed_at?: string | null
          delivery_proof_reviewed_by?: string | null
          delivery_proof_status?: string | null
          delivery_proof_uploaded_at?: string | null
          delivery_proof_uploaded_by?: string | null
          delivery_proof_url?: string | null
          discount_amount?: number | null
          dispatched_on?: string | null
          enquiry_id?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_reason?: string | null
          estimated_delivery?: string | null
          estimated_procurement_rate?: number | null
          external_id?: string | null
          has_voided_zoho_invoice?: boolean
          id?: string
          internal_notes?: string | null
          invoice_number?: string | null
          invoice_url?: string | null
          is_escalated?: boolean
          is_refund_requested?: boolean
          is_rto?: boolean
          last_reminder_sent_at?: string | null
          lead_source?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
          manual_overrides?: string[]
          order_date?: string | null
          order_number?: string | null
          order_outcome?: string | null
          order_type?: string | null
          outcome_updated_at?: string | null
          outcome_updated_by?: string | null
          payment_due_date?: string | null
          payment_status?: string | null
          payment_terms?: string | null
          po_number?: string | null
          po_url?: string | null
          priority?: number | null
          procurement_currency?: string | null
          procurement_date?: string | null
          procurement_edited?: boolean
          procurement_rate?: number | null
          product_category?: string | null
          product_code?: string
          product_name?: string
          quantity?: number
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_requested_by?: string | null
          refund_status?: string | null
          requires_confirmation?: boolean
          rto_marked_at?: string | null
          rto_marked_by?: string | null
          sales_attribution_locked?: boolean
          sales_attribution_reason?: string | null
          sales_attribution_reason_custom?: string | null
          sales_notes?: string | null
          sales_person_id?: string
          sales_person_name?: string
          selling_price?: number | null
          shipping_address?: string | null
          source?: string
          source_pipeline_id?: string | null
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
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_pipeline_id_fkey"
            columns: ["source_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_source_pipeline_id_fkey"
            columns: ["source_pipeline_id"]
            isOneToOne: false
            referencedRelation: "sales_weighted_forecast_view"
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
      outbound_call_logs: {
        Row: {
          call_duration_seconds: number | null
          call_notes: string | null
          call_outcome: string
          called_by: string
          called_by_name: string
          created_at: string
          id: string
          lead_company: string | null
          lead_created_at: string | null
          lead_id: string
          lead_name: string | null
          lead_phone: string
          lead_source: string
          scheduled_followup_at: string | null
          updated_at: string
        }
        Insert: {
          call_duration_seconds?: number | null
          call_notes?: string | null
          call_outcome?: string
          called_by: string
          called_by_name: string
          created_at?: string
          id?: string
          lead_company?: string | null
          lead_created_at?: string | null
          lead_id: string
          lead_name?: string | null
          lead_phone: string
          lead_source: string
          scheduled_followup_at?: string | null
          updated_at?: string
        }
        Update: {
          call_duration_seconds?: number | null
          call_notes?: string | null
          call_outcome?: string
          called_by?: string
          called_by_name?: string
          created_at?: string
          id?: string
          lead_company?: string | null
          lead_created_at?: string | null
          lead_id?: string
          lead_name?: string | null
          lead_phone?: string
          lead_source?: string
          scheduled_followup_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outbound_contacts: {
        Row: {
          address: string | null
          attention_marked_at: string | null
          attention_marked_by: string | null
          attention_reason: string | null
          city: string | null
          company_name: string | null
          contact_name: string
          created_at: string
          designation: string | null
          duplicate_count: number
          email: string | null
          id: string
          is_prospect: boolean | null
          linkedin_url: string | null
          needs_attention: boolean | null
          notes: string | null
          phone: string | null
          region: string | null
          source: string | null
          source_sheet: string | null
          source_type: string | null
          status: string
          updated_at: string
          uploaded_by: string | null
          uploaded_by_id: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          attention_marked_at?: string | null
          attention_marked_by?: string | null
          attention_reason?: string | null
          city?: string | null
          company_name?: string | null
          contact_name: string
          created_at?: string
          designation?: string | null
          duplicate_count?: number
          email?: string | null
          id?: string
          is_prospect?: boolean | null
          linkedin_url?: string | null
          needs_attention?: boolean | null
          notes?: string | null
          phone?: string | null
          region?: string | null
          source?: string | null
          source_sheet?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_id?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          attention_marked_at?: string | null
          attention_marked_by?: string | null
          attention_reason?: string | null
          city?: string | null
          company_name?: string | null
          contact_name?: string
          created_at?: string
          designation?: string | null
          duplicate_count?: number
          email?: string | null
          id?: string
          is_prospect?: boolean | null
          linkedin_url?: string | null
          needs_attention?: boolean | null
          notes?: string | null
          phone?: string | null
          region?: string | null
          source?: string | null
          source_sheet?: string | null
          source_type?: string | null
          status?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_id?: string | null
          website?: string | null
        }
        Relationships: []
      }
      outbound_review_queue: {
        Row: {
          conflict_type: string
          contact_data: Json
          created_at: string
          id: string
          matched_contact_id: string | null
          resolution: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          conflict_type: string
          contact_data: Json
          created_at?: string
          id?: string
          matched_contact_id?: string | null
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          conflict_type?: string
          contact_data?: Json
          created_at?: string
          id?: string
          matched_contact_id?: string | null
          resolution?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_review_queue_matched_contact_id_fkey"
            columns: ["matched_contact_id"]
            isOneToOne: false
            referencedRelation: "outbound_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_upload_logs: {
        Row: {
          created_at: string
          failed_details: Json | null
          failed_rows: number
          file_name: string
          id: string
          new_records: number
          total_rows: number
          updated_records: number
          uploaded_by: string
          uploaded_by_id: string
        }
        Insert: {
          created_at?: string
          failed_details?: Json | null
          failed_rows?: number
          file_name: string
          id?: string
          new_records?: number
          total_rows?: number
          updated_records?: number
          uploaded_by: string
          uploaded_by_id: string
        }
        Update: {
          created_at?: string
          failed_details?: Json | null
          failed_rows?: number
          file_name?: string
          id?: string
          new_records?: number
          total_rows?: number
          updated_records?: number
          uploaded_by?: string
          uploaded_by_id?: string
        }
        Relationships: []
      }
      password_reset_email_log: {
        Row: {
          context: string | null
          created_at: string
          error_message: string | null
          from_address: string
          id: string
          provider: string
          provider_message_id: string | null
          recipient_email: string
          recipient_user_id: string | null
          status: string
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          error_message?: string | null
          from_address: string
          id?: string
          provider?: string
          provider_message_id?: string | null
          recipient_email: string
          recipient_user_id?: string | null
          status: string
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          context?: string | null
          created_at?: string
          error_message?: string | null
          from_address?: string
          id?: string
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string
          recipient_user_id?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_marker_grants: {
        Row: {
          granted_at: string
          granted_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id?: string
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
          payment_date: string | null
          payment_mode: string | null
          reference_number: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_url: string | null
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
          payment_date?: string | null
          payment_mode?: string | null
          reference_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_url?: string | null
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
          payment_date?: string | null
          payment_mode?: string | null
          reference_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_url?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payment_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records_deletion_log: {
        Row: {
          amount: number | null
          deleted_at: string
          deleted_by: string
          deleted_by_name: string | null
          id: string
          notes: string | null
          order_id: string | null
          original_created_at: string | null
          payment_date: string | null
          payment_mode: string | null
          payment_record_id: string
          record_snapshot: Json
          reference_number: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          screenshot_url: string | null
          status: string | null
          submitted_at: string | null
          submitted_by: string | null
        }
        Insert: {
          amount?: number | null
          deleted_at?: string
          deleted_by: string
          deleted_by_name?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_created_at?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          payment_record_id: string
          record_snapshot: Json
          reference_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_url?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Update: {
          amount?: number | null
          deleted_at?: string
          deleted_by?: string
          deleted_by_name?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          original_created_at?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          payment_record_id?: string
          record_snapshot?: Json
          reference_number?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          screenshot_url?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Relationships: []
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
      payroll_payment_status: {
        Row: {
          amount: number
          bank_account: string | null
          bank_reference_number: string | null
          created_at: string
          employee_id: string
          employee_name: string
          failure_reason: string | null
          id: string
          ifsc_code: string | null
          salary_sheet_id: string
          status: string
          updated_at: string
          updated_by: string | null
          updated_by_name: string | null
        }
        Insert: {
          amount?: number
          bank_account?: string | null
          bank_reference_number?: string | null
          created_at?: string
          employee_id: string
          employee_name: string
          failure_reason?: string | null
          id?: string
          ifsc_code?: string | null
          salary_sheet_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Update: {
          amount?: number
          bank_account?: string | null
          bank_reference_number?: string | null
          created_at?: string
          employee_id?: string
          employee_name?: string
          failure_reason?: string | null
          id?: string
          ifsc_code?: string | null
          salary_sheet_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_payment_status_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payment_status_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_payment_status_salary_sheet_id_fkey"
            columns: ["salary_sheet_id"]
            isOneToOne: false
            referencedRelation: "salary_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_transfer_files: {
        Row: {
          employee_count: number
          file_url: string | null
          generated_at: string
          generated_by: string
          generated_by_name: string
          id: string
          salary_sheet_id: string
          total_amount: number
        }
        Insert: {
          employee_count?: number
          file_url?: string | null
          generated_at?: string
          generated_by: string
          generated_by_name: string
          id?: string
          salary_sheet_id: string
          total_amount?: number
        }
        Update: {
          employee_count?: number
          file_url?: string | null
          generated_at?: string
          generated_by?: string
          generated_by_name?: string
          id?: string
          salary_sheet_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_transfer_files_salary_sheet_id_fkey"
            columns: ["salary_sheet_id"]
            isOneToOne: false
            referencedRelation: "salary_sheets"
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
          company_id: string | null
          created_at: string
          created_by: string
          customer_company: string
          customer_email: string | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          customer_state: string | null
          customer_type: string
          enquiry_id: string | null
          expected_closure_date: string | null
          expected_price: number | null
          id: string
          internal_notes: string | null
          is_mega_deal: boolean | null
          lead_source: string | null
          lead_temperature: string | null
          lost_reason: string | null
          lost_reason_notes: string | null
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
          company_id?: string | null
          created_at?: string
          created_by: string
          customer_company: string
          customer_email?: string | null
          customer_name: string
          customer_notes?: string | null
          customer_phone?: string | null
          customer_state?: string | null
          customer_type?: string
          enquiry_id?: string | null
          expected_closure_date?: string | null
          expected_price?: number | null
          id?: string
          internal_notes?: string | null
          is_mega_deal?: boolean | null
          lead_source?: string | null
          lead_temperature?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
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
          company_id?: string | null
          created_at?: string
          created_by?: string
          customer_company?: string
          customer_email?: string | null
          customer_name?: string
          customer_notes?: string | null
          customer_phone?: string | null
          customer_state?: string | null
          customer_type?: string
          enquiry_id?: string | null
          expected_closure_date?: string | null
          expected_price?: number | null
          id?: string
          internal_notes?: string | null
          is_mega_deal?: boolean | null
          lead_source?: string | null
          lead_temperature?: string | null
          lost_reason?: string | null
          lost_reason_notes?: string | null
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
            foreignKeyName: "pipeline_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
      portal_accounts: {
        Row: {
          aadhaar_last4: string | null
          assigned_rep_id: string | null
          billing_address: string | null
          company_name: string
          created_at: string
          gstin: string | null
          id: string
          industry: string | null
          kyc_rejection_reason: string | null
          kyc_reviewed_at: string | null
          kyc_reviewed_by: string | null
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          kyc_submitted_at: string | null
          primary_contact_name: string | null
          shipping_address: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aadhaar_last4?: string | null
          assigned_rep_id?: string | null
          billing_address?: string | null
          company_name: string
          created_at?: string
          gstin?: string | null
          id?: string
          industry?: string | null
          kyc_rejection_reason?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_submitted_at?: string | null
          primary_contact_name?: string | null
          shipping_address?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aadhaar_last4?: string | null
          assigned_rep_id?: string | null
          billing_address?: string | null
          company_name?: string
          created_at?: string
          gstin?: string | null
          id?: string
          industry?: string | null
          kyc_rejection_reason?: string | null
          kyc_reviewed_at?: string | null
          kyc_reviewed_by?: string | null
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_submitted_at?: string | null
          primary_contact_name?: string | null
          shipping_address?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_contacts: {
        Row: {
          account_id: string
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          invited_at: string | null
          is_active: boolean
          last_login_at: string | null
          phone: string | null
          role: string
          whatsapp_number: string | null
        }
        Insert: {
          account_id: string
          auth_user_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          role: string
          whatsapp_number?: string | null
        }
        Update: {
          account_id?: string
          auth_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          invited_at?: string | null
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          role?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_documents: {
        Row: {
          doc_type: string
          external_url: string | null
          file_size_bytes: number | null
          file_url: string | null
          id: string
          is_master: boolean
          order_id: string | null
          product_id: string | null
          title: string
          uploaded_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          doc_type: string
          external_url?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          is_master?: boolean
          order_id?: string | null
          product_id?: string | null
          title: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          doc_type?: string
          external_url?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          id?: string
          is_master?: boolean
          order_id?: string | null
          product_id?: string | null
          title?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_documents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "portal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_documents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "portal_products"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_feedback: {
        Row: {
          account_id: string
          category: string
          comment: string | null
          contact_id: string | null
          created_at: string
          id: string
          order_id: string | null
          rating: number
        }
        Insert: {
          account_id: string
          category?: string
          comment?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          rating: number
        }
        Update: {
          account_id?: string
          category?: string
          comment?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_feedback_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_feedback_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "portal_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_feedback_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "portal_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_inbound_messages: {
        Row: {
          body: string | null
          created_ticket_id: string | null
          from_phone: string
          id: string
          matched_contact_id: string | null
          raw_payload: Json | null
          received_at: string
          source: string
        }
        Insert: {
          body?: string | null
          created_ticket_id?: string | null
          from_phone: string
          id?: string
          matched_contact_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          source?: string
        }
        Update: {
          body?: string | null
          created_ticket_id?: string | null
          from_phone?: string
          id?: string
          matched_contact_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_inbound_messages_created_ticket_id_fkey"
            columns: ["created_ticket_id"]
            isOneToOne: false
            referencedRelation: "portal_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_inbound_messages_matched_contact_id_fkey"
            columns: ["matched_contact_id"]
            isOneToOne: false
            referencedRelation: "portal_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_invite_tokens: {
        Row: {
          account_id: string | null
          auth_user_id: string
          created_at: string
          email: string
          expires_at: string
          token: string
          used_at: string | null
        }
        Insert: {
          account_id?: string | null
          auth_user_id: string
          created_at?: string
          email: string
          expires_at: string
          token?: string
          used_at?: string | null
        }
        Update: {
          account_id?: string | null
          auth_user_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      portal_notification_preferences: {
        Row: {
          contact_id: string
          email_new_docs: boolean
          email_order_status: boolean
          email_renewals: boolean
          email_supply_chain_notes: boolean
          email_ticket_replies: boolean
          whatsapp_new_docs: boolean
          whatsapp_order_status: boolean
          whatsapp_renewals: boolean
          whatsapp_supply_chain_notes: boolean
          whatsapp_ticket_replies: boolean
        }
        Insert: {
          contact_id: string
          email_new_docs?: boolean
          email_order_status?: boolean
          email_renewals?: boolean
          email_supply_chain_notes?: boolean
          email_ticket_replies?: boolean
          whatsapp_new_docs?: boolean
          whatsapp_order_status?: boolean
          whatsapp_renewals?: boolean
          whatsapp_supply_chain_notes?: boolean
          whatsapp_ticket_replies?: boolean
        }
        Update: {
          contact_id?: string
          email_new_docs?: boolean
          email_order_status?: boolean
          email_renewals?: boolean
          email_supply_chain_notes?: boolean
          email_ticket_replies?: boolean
          whatsapp_new_docs?: boolean
          whatsapp_order_status?: boolean
          whatsapp_renewals?: boolean
          whatsapp_supply_chain_notes?: boolean
          whatsapp_ticket_replies?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "portal_notification_preferences_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "portal_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_notifications_log: {
        Row: {
          channel: string
          created_at: string
          delivered_at: string | null
          error_message: string | null
          id: string
          payload: Json | null
          recipient_contact_id: string | null
          recipient_user_id: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          sent_at: string | null
          status: string
          template_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          recipient_contact_id?: string | null
          recipient_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          status?: string
          template_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          recipient_contact_id?: string | null
          recipient_user_id?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          sent_at?: string | null
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_notifications_log_recipient_contact_id_fkey"
            columns: ["recipient_contact_id"]
            isOneToOne: false
            referencedRelation: "portal_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_order_line_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          line_state: string
          order_id: string
          product_id: string | null
          product_name_snapshot: string
          quantity: number
          serial_numbers: Json
          total: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          line_state?: string
          order_id: string
          product_id?: string | null
          product_name_snapshot: string
          quantity?: number
          serial_numbers?: Json
          total?: number | null
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          line_state?: string
          order_id?: string
          product_id?: string | null
          product_name_snapshot?: string
          quantity?: number
          serial_numbers?: Json
          total?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "portal_order_line_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "portal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_order_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "portal_products"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_orders: {
        Row: {
          account_id: string
          amc_expires_at: string | null
          assigned_rep_id: string | null
          awb_number: string | null
          courier_name: string | null
          created_at: string
          current_state: string
          customer_facing_eta: string | null
          customer_po_number: string | null
          daas_expires_at: string | null
          daas_tier: string | null
          delivery_commitment: string | null
          discount_amount: number | null
          discount_reason: string | null
          gst_amount: number | null
          id: string
          order_number: string
          payment_terms: string | null
          portal_visible: boolean
          subtotal: number | null
          total: number | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amc_expires_at?: string | null
          assigned_rep_id?: string | null
          awb_number?: string | null
          courier_name?: string | null
          created_at?: string
          current_state?: string
          customer_facing_eta?: string | null
          customer_po_number?: string | null
          daas_expires_at?: string | null
          daas_tier?: string | null
          delivery_commitment?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          gst_amount?: number | null
          id?: string
          order_number: string
          payment_terms?: string | null
          portal_visible?: boolean
          subtotal?: number | null
          total?: number | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          amc_expires_at?: string | null
          assigned_rep_id?: string | null
          awb_number?: string | null
          courier_name?: string | null
          created_at?: string
          current_state?: string
          customer_facing_eta?: string | null
          customer_po_number?: string | null
          daas_expires_at?: string | null
          daas_tier?: string | null
          delivery_commitment?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
          gst_amount?: number | null
          id?: string
          order_number?: string
          payment_terms?: string | null
          portal_visible?: boolean
          subtotal?: number | null
          total?: number | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_products: {
        Row: {
          active: boolean
          catalog_price: number | null
          created_at: string
          description: string | null
          domain: string | null
          id: string
          name: string
          sku: string
          unit: string | null
        }
        Insert: {
          active?: boolean
          catalog_price?: number | null
          created_at?: string
          description?: string | null
          domain?: string | null
          id?: string
          name: string
          sku: string
          unit?: string | null
        }
        Update: {
          active?: boolean
          catalog_price?: number | null
          created_at?: string
          description?: string | null
          domain?: string | null
          id?: string
          name?: string
          sku?: string
          unit?: string | null
        }
        Relationships: []
      }
      portal_renewal_alerts: {
        Row: {
          alert_type: string
          alerted_at: string
          expires_on: string
          id: string
          order_id: string
        }
        Insert: {
          alert_type: string
          alerted_at?: string
          expires_on: string
          id?: string
          order_id: string
        }
        Update: {
          alert_type?: string
          alerted_at?: string
          expires_on?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_renewal_alerts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "portal_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_rfqs: {
        Row: {
          account_id: string
          assigned_rep_id: string | null
          attachments: Json
          budget_range: string | null
          converted_to_order_id: string | null
          created_at: string
          daas_interest: string | null
          desired_date: string | null
          domains: string[]
          id: string
          rfq_number: string
          status: string
          submitted_by_contact_id: string | null
          use_case: string
        }
        Insert: {
          account_id: string
          assigned_rep_id?: string | null
          attachments?: Json
          budget_range?: string | null
          converted_to_order_id?: string | null
          created_at?: string
          daas_interest?: string | null
          desired_date?: string | null
          domains?: string[]
          id?: string
          rfq_number: string
          status?: string
          submitted_by_contact_id?: string | null
          use_case: string
        }
        Update: {
          account_id?: string
          assigned_rep_id?: string | null
          attachments?: Json
          budget_range?: string | null
          converted_to_order_id?: string | null
          created_at?: string
          daas_interest?: string | null
          desired_date?: string | null
          domains?: string[]
          id?: string
          rfq_number?: string
          status?: string
          submitted_by_contact_id?: string | null
          use_case?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_rfqs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_rfqs_converted_to_order_id_fkey"
            columns: ["converted_to_order_id"]
            isOneToOne: false
            referencedRelation: "portal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_rfqs_submitted_by_contact_id_fkey"
            columns: ["submitted_by_contact_id"]
            isOneToOne: false
            referencedRelation: "portal_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sla_alerts: {
        Row: {
          alerted_at: string
          breach_type: string
          id: string
          ticket_id: string
        }
        Insert: {
          alerted_at?: string
          breach_type: string
          id?: string
          ticket_id: string
        }
        Update: {
          alerted_at?: string
          breach_type?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sla_alerts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "portal_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_state_transitions: {
        Row: {
          actor_id: string | null
          actor_name_snapshot: string | null
          customer_facing_note: string | null
          from_state: string | null
          id: string
          internal_note: string | null
          order_id: string
          to_state: string
          transitioned_at: string
        }
        Insert: {
          actor_id?: string | null
          actor_name_snapshot?: string | null
          customer_facing_note?: string | null
          from_state?: string | null
          id?: string
          internal_note?: string | null
          order_id: string
          to_state: string
          transitioned_at?: string
        }
        Update: {
          actor_id?: string | null
          actor_name_snapshot?: string | null
          customer_facing_note?: string | null
          from_state?: string | null
          id?: string
          internal_note?: string | null
          order_id?: string
          to_state?: string
          transitioned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_state_transitions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "portal_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_ticket_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          is_internal: boolean
          sender_id: string | null
          sender_name_snapshot: string | null
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id?: string | null
          sender_name_snapshot?: string | null
          ticket_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id?: string | null
          sender_name_snapshot?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "portal_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_ticket_reads: {
        Row: {
          created_at: string
          id: string
          last_read_at: string
          ticket_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_read_at?: string
          ticket_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_read_at?: string
          ticket_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_ticket_reads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "portal_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_tickets: {
        Row: {
          account_id: string
          assigned_to: string | null
          category: string
          created_at: string
          description: string
          first_response_at: string | null
          id: string
          order_id: string | null
          priority: string
          product_id: string | null
          raised_by_contact_id: string | null
          related_order_id: string | null
          related_order_number: string | null
          related_product_name: string | null
          resolved_at: string | null
          sla_first_response_due_at: string | null
          sla_resolution_due_at: string | null
          status: string
          subject: string
          ticket_number: string
          ticket_type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          assigned_to?: string | null
          category: string
          created_at?: string
          description: string
          first_response_at?: string | null
          id?: string
          order_id?: string | null
          priority?: string
          product_id?: string | null
          raised_by_contact_id?: string | null
          related_order_id?: string | null
          related_order_number?: string | null
          related_product_name?: string | null
          resolved_at?: string | null
          sla_first_response_due_at?: string | null
          sla_resolution_due_at?: string | null
          status?: string
          subject: string
          ticket_number: string
          ticket_type?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string
          first_response_at?: string | null
          id?: string
          order_id?: string | null
          priority?: string
          product_id?: string | null
          raised_by_contact_id?: string | null
          related_order_id?: string | null
          related_order_number?: string | null
          related_product_name?: string | null
          resolved_at?: string | null
          sla_first_response_due_at?: string | null
          sla_resolution_due_at?: string | null
          status?: string
          subject?: string
          ticket_number?: string
          ticket_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_tickets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "portal_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_tickets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "portal_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_tickets_raised_by_contact_id_fkey"
            columns: ["raised_by_contact_id"]
            isOneToOne: false
            referencedRelation: "portal_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      price_refresh_grants: {
        Row: {
          granted_at: string
          granted_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: []
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
          sync_source: string | null
          unit_price: number | null
          updated_at: string
          updated_by: string | null
          website_price: number | null
          website_price_includes_gst: boolean
          website_synced_at: string | null
          weight_grams: number | null
          woo_product_id: number | null
          woo_sku: string | null
          woo_stock_status: string | null
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
          sync_source?: string | null
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          website_price?: number | null
          website_price_includes_gst?: boolean
          website_synced_at?: string | null
          weight_grams?: number | null
          woo_product_id?: number | null
          woo_sku?: string | null
          woo_stock_status?: string | null
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
          sync_source?: string | null
          unit_price?: number | null
          updated_at?: string
          updated_by?: string | null
          website_price?: number | null
          website_price_includes_gst?: boolean
          website_synced_at?: string | null
          weight_grams?: number | null
          woo_product_id?: number | null
          woo_sku?: string | null
          woo_stock_status?: string | null
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "procurement_payment_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_payment_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
          profile_pic_prompt_dismissed_at: string | null
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
          profile_pic_prompt_dismissed_at?: string | null
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
          profile_pic_prompt_dismissed_at?: string | null
          reporting_manager_id?: string | null
          slack_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proforma_audit_log: {
        Row: {
          action: string
          created_at: string
          generated_by: string | null
          generated_by_name: string | null
          id: string
          invoice_id: string | null
          order_id: string | null
          proforma_number: string | null
          snapshot: Json
          woocommerce_order_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          invoice_id?: string | null
          order_id?: string | null
          proforma_number?: string | null
          snapshot?: Json
          woocommerce_order_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          invoice_id?: string | null
          order_id?: string | null
          proforma_number?: string | null
          snapshot?: Json
          woocommerce_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_audit_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "order_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_rule_audit: {
        Row: {
          action: string
          after_snapshot: Json | null
          before_snapshot: Json | null
          created_at: string
          id: string
          line_changes: Json
          order_id: string | null
          order_number: string | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          rules_version: string | null
          triggered_by: string
          triggered_by_name: string | null
          woocommerce_order_id: string | null
        }
        Insert: {
          action: string
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string
          id?: string
          line_changes?: Json
          order_id?: string | null
          order_number?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          rules_version?: string | null
          triggered_by: string
          triggered_by_name?: string | null
          woocommerce_order_id?: string | null
        }
        Update: {
          action?: string
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string
          id?: string
          line_changes?: Json
          order_id?: string | null
          order_number?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          rules_version?: string | null
          triggered_by?: string
          triggered_by_name?: string | null
          woocommerce_order_id?: string | null
        }
        Relationships: []
      }
      prospect_followup_settings: {
        Row: {
          ai_model: string
          cc_emails: string[]
          created_at: string
          enabled: boolean
          id: boolean
          max_attempts: number
          send_window_end: string
          send_window_start: string
          shadow_mode: boolean
          updated_at: string
          weekdays_only: boolean
        }
        Insert: {
          ai_model?: string
          cc_emails?: string[]
          created_at?: string
          enabled?: boolean
          id?: boolean
          max_attempts?: number
          send_window_end?: string
          send_window_start?: string
          shadow_mode?: boolean
          updated_at?: string
          weekdays_only?: boolean
        }
        Update: {
          ai_model?: string
          cc_emails?: string[]
          created_at?: string
          enabled?: boolean
          id?: boolean
          max_attempts?: number
          send_window_end?: string
          send_window_start?: string
          shadow_mode?: boolean
          updated_at?: string
          weekdays_only?: boolean
        }
        Relationships: []
      }
      prospect_followup_state: {
        Row: {
          attempts_sent: number
          last_sent_at: string | null
          next_scheduled_at: string | null
          paused: boolean
          prospect_id: string
          stop_reason: string | null
          stopped: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attempts_sent?: number
          last_sent_at?: string | null
          next_scheduled_at?: string | null
          paused?: boolean
          prospect_id: string
          stop_reason?: string | null
          stopped?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attempts_sent?: number
          last_sent_at?: string | null
          next_scheduled_at?: string | null
          paused?: boolean
          prospect_id?: string
          stop_reason?: string | null
          stopped?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospect_followup_state_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: true
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospect_followups: {
        Row: {
          ai_meta: Json
          ai_model: string | null
          attempt_no: number
          body_html: string
          body_text: string
          cc_emails: string[]
          created_at: string
          email_message_id: string | null
          error_message: string | null
          id: string
          prospect_id: string
          recipient_email: string
          scheduled_for: string
          sent_at: string | null
          skip_reason: string | null
          status: string
          subject: string
        }
        Insert: {
          ai_meta?: Json
          ai_model?: string | null
          attempt_no: number
          body_html: string
          body_text: string
          cc_emails?: string[]
          created_at?: string
          email_message_id?: string | null
          error_message?: string | null
          id?: string
          prospect_id: string
          recipient_email: string
          scheduled_for?: string
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
          subject: string
        }
        Update: {
          ai_meta?: Json
          ai_model?: string | null
          attempt_no?: number
          body_html?: string
          body_text?: string
          cc_emails?: string[]
          created_at?: string
          email_message_id?: string | null
          error_message?: string | null
          id?: string
          prospect_id?: string
          recipient_email?: string
          scheduled_for?: string
          sent_at?: string | null
          skip_reason?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_followups_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          a_category_marked_at: string | null
          a_category_marked_by: string | null
          city: string | null
          company: string | null
          company_id: string | null
          created_at: string
          created_by: string
          created_by_name: string
          customer_company: string | null
          customer_name: string
          customer_type: string | null
          default_price: number | null
          discount_amount: number | null
          discount_percentage: number | null
          email: string | null
          id: string
          is_a_category: boolean
          lead_quality: string | null
          lead_source: string | null
          notes: string | null
          phone_number: string | null
          product_category: string | null
          product_code: string | null
          product_name: string | null
          prospect_type: string | null
          purpose_of_purchase: string | null
          quantity: number | null
          quoted_price: number | null
          requested_timeline: string | null
          source_id: string
          source_type: string
          status: string
          updated_at: string
          urgency: string | null
        }
        Insert: {
          a_category_marked_at?: string | null
          a_category_marked_by?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string
          created_by: string
          created_by_name: string
          customer_company?: string | null
          customer_name: string
          customer_type?: string | null
          default_price?: number | null
          discount_amount?: number | null
          discount_percentage?: number | null
          email?: string | null
          id?: string
          is_a_category?: boolean
          lead_quality?: string | null
          lead_source?: string | null
          notes?: string | null
          phone_number?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          prospect_type?: string | null
          purpose_of_purchase?: string | null
          quantity?: number | null
          quoted_price?: number | null
          requested_timeline?: string | null
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          a_category_marked_at?: string | null
          a_category_marked_by?: string | null
          city?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          customer_company?: string | null
          customer_name?: string
          customer_type?: string | null
          default_price?: number | null
          discount_amount?: number | null
          discount_percentage?: number | null
          email?: string | null
          id?: string
          is_a_category?: boolean
          lead_quality?: string | null
          lead_source?: string | null
          notes?: string | null
          phone_number?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string | null
          prospect_type?: string | null
          purpose_of_purchase?: string | null
          quantity?: number | null
          quoted_price?: number | null
          requested_timeline?: string | null
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
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
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          created_at: string
          id: string
          request_count: number
          window_duration_ms: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          created_at?: string
          id?: string
          request_count?: number
          window_duration_ms?: number
          window_start?: string
        }
        Update: {
          bucket_key?: string
          created_at?: string
          id?: string
          request_count?: number
          window_duration_ms?: number
          window_start?: string
        }
        Relationships: []
      }
      reconciliation_accounts: {
        Row: {
          account_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      reconciliation_rules: {
        Row: {
          account_id: string
          created_at: string
          id: string
          is_active: boolean
          keyword: string
          priority: number
          subaccount_id: string | null
          suggested_category: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          keyword: string
          priority?: number
          subaccount_id?: string | null
          suggested_category?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          keyword?: string
          priority?: number
          subaccount_id?: string | null
          suggested_category?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_rules_subaccount_id_fkey"
            columns: ["subaccount_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_subaccounts: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_subaccounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          account_id: string | null
          created_at: string
          created_by: string
          created_by_name: string
          default_amount: number
          due_day: number | null
          end_date: string | null
          expense_name: string
          frequency: string
          id: string
          is_active: boolean
          last_linked_transaction_id: string | null
          last_paid_amount: number | null
          last_paid_date: string | null
          next_due_date: string | null
          notes: string | null
          start_date: string
          subaccount_id: string | null
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by: string
          created_by_name?: string
          default_amount?: number
          due_day?: number | null
          end_date?: string | null
          expense_name: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_linked_transaction_id?: string | null
          last_paid_amount?: number | null
          last_paid_date?: string | null
          next_due_date?: string | null
          notes?: string | null
          start_date?: string
          subaccount_id?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by?: string
          created_by_name?: string
          default_amount?: number
          due_day?: number | null
          end_date?: string | null
          expense_name?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_linked_transaction_id?: string | null
          last_paid_amount?: number | null
          last_paid_date?: string | null
          next_due_date?: string | null
          notes?: string | null
          start_date?: string
          subaccount_id?: string | null
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_last_linked_transaction_id_fkey"
            columns: ["last_linked_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_subaccount_id_fkey"
            columns: ["subaccount_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_subaccounts"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          candidate_email: string
          candidate_id: string | null
          candidate_name: string
          candidate_phone: string
          created_at: string
          id: string
          notes: string | null
          referred_by: string
          resume_url: string | null
          role_id: string
          status: string
          updated_at: string
        }
        Insert: {
          candidate_email: string
          candidate_id?: string | null
          candidate_name: string
          candidate_phone: string
          created_at?: string
          id?: string
          notes?: string | null
          referred_by: string
          resume_url?: string | null
          role_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_email?: string
          candidate_id?: string | null
          candidate_name?: string
          candidate_phone?: string
          created_at?: string
          id?: string
          notes?: string | null
          referred_by?: string
          resume_url?: string | null
          role_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "hiring_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_records: {
        Row: {
          actual_return_date: string | null
          created_at: string
          created_by: string | null
          drone_id: string
          expected_return_date: string | null
          id: string
          notes: string | null
          rental_end_date: string | null
          rental_fee: number
          rental_start_date: string
          renter_contact: string
          renter_name: string
          security_deposit: number | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_return_date?: string | null
          created_at?: string
          created_by?: string | null
          drone_id: string
          expected_return_date?: string | null
          id?: string
          notes?: string | null
          rental_end_date?: string | null
          rental_fee?: number
          rental_start_date: string
          renter_contact: string
          renter_name: string
          security_deposit?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_return_date?: string | null
          created_at?: string
          created_by?: string | null
          drone_id?: string
          expected_return_date?: string | null
          id?: string
          notes?: string | null
          rental_end_date?: string | null
          rental_fee?: number
          rental_start_date?: string
          renter_contact?: string
          renter_name?: string
          security_deposit?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_records_drone_id_fkey"
            columns: ["drone_id"]
            isOneToOne: false
            referencedRelation: "buyback_drones"
            referencedColumns: ["id"]
          },
        ]
      }
      repair_stage_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_by_name: string | null
          from_stage: Database["public"]["Enums"]["repair_stage"] | null
          id: string
          notes: string | null
          repair_id: string
          to_stage: Database["public"]["Enums"]["repair_stage"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          from_stage?: Database["public"]["Enums"]["repair_stage"] | null
          id?: string
          notes?: string | null
          repair_id: string
          to_stage: Database["public"]["Enums"]["repair_stage"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string | null
          from_stage?: Database["public"]["Enums"]["repair_stage"] | null
          id?: string
          notes?: string | null
          repair_id?: string
          to_stage?: Database["public"]["Enums"]["repair_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "repair_stage_history_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      repairs: {
        Row: {
          advance_amount: number | null
          assigned_technician_id: string | null
          assigned_technician_name: string | null
          balance_amount: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
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
          duplicate_source_lead_ids: Json
          email: string | null
          id: string
          inspection_charges: number | null
          intake_payload: Json | null
          issue_details: string | null
          issue_type: Database["public"]["Enums"]["repair_issue_type"]
          item_received_at: string | null
          model_name: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["repair_payment_status"]
          profit: number | null
          quote_accepted_at: string | null
          quote_sent_at: string | null
          repair_cost_charged: number | null
          repair_number: string | null
          repair_stage: Database["public"]["Enums"]["repair_stage"]
          source_lead_id: number | null
          total_component_cost: number | null
          total_quote_amount: number | null
          updated_at: string
        }
        Insert: {
          advance_amount?: number | null
          assigned_technician_id?: string | null
          assigned_technician_name?: string | null
          balance_amount?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
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
          duplicate_source_lead_ids?: Json
          email?: string | null
          id?: string
          inspection_charges?: number | null
          intake_payload?: Json | null
          issue_details?: string | null
          issue_type?: Database["public"]["Enums"]["repair_issue_type"]
          item_received_at?: string | null
          model_name: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["repair_payment_status"]
          profit?: number | null
          quote_accepted_at?: string | null
          quote_sent_at?: string | null
          repair_cost_charged?: number | null
          repair_number?: string | null
          repair_stage?: Database["public"]["Enums"]["repair_stage"]
          source_lead_id?: number | null
          total_component_cost?: number | null
          total_quote_amount?: number | null
          updated_at?: string
        }
        Update: {
          advance_amount?: number | null
          assigned_technician_id?: string | null
          assigned_technician_name?: string | null
          balance_amount?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
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
          duplicate_source_lead_ids?: Json
          email?: string | null
          id?: string
          inspection_charges?: number | null
          intake_payload?: Json | null
          issue_details?: string | null
          issue_type?: Database["public"]["Enums"]["repair_issue_type"]
          item_received_at?: string | null
          model_name?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["repair_payment_status"]
          profit?: number | null
          quote_accepted_at?: string | null
          quote_sent_at?: string | null
          repair_cost_charged?: number | null
          repair_number?: string | null
          repair_stage?: Database["public"]["Enums"]["repair_stage"]
          source_lead_id?: number | null
          total_component_cost?: number | null
          total_quote_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      resignation_requests: {
        Row: {
          approved_lwd: string | null
          created_at: string
          created_by_hr: string | null
          created_by_hr_name: string | null
          employee_id: string
          hr_notes: string | null
          id: string
          personal_email: string | null
          proposed_lwd: string
          reason: string
          resignation_date: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved_lwd?: string | null
          created_at?: string
          created_by_hr?: string | null
          created_by_hr_name?: string | null
          employee_id: string
          hr_notes?: string | null
          id?: string
          personal_email?: string | null
          proposed_lwd: string
          reason: string
          resignation_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved_lwd?: string | null
          created_at?: string
          created_by_hr?: string | null
          created_by_hr_name?: string | null
          employee_id?: string
          hr_notes?: string | null
          id?: string
          personal_email?: string | null
          proposed_lwd?: string
          reason?: string
          resignation_date?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resignation_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resignation_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_access_failure_audit: {
        Row: {
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          actor_user_id_client_hint: string | null
          created_at: string
          document_path: string | null
          error_message: string | null
          error_slug: string | null
          http_status: number | null
          id: string
          is_retry: boolean
          keyword_matched: boolean | null
          reason: Database["public"]["Enums"]["resume_access_failure_reason"]
          referral_id: string | null
          retry_of_failure_id: string | null
          source: string | null
          user_agent: string | null
        }
        Insert: {
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          actor_user_id_client_hint?: string | null
          created_at?: string
          document_path?: string | null
          error_message?: string | null
          error_slug?: string | null
          http_status?: number | null
          id?: string
          is_retry?: boolean
          keyword_matched?: boolean | null
          reason: Database["public"]["Enums"]["resume_access_failure_reason"]
          referral_id?: string | null
          retry_of_failure_id?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          actor_user_id_client_hint?: string | null
          created_at?: string
          document_path?: string | null
          error_message?: string | null
          error_slug?: string | null
          http_status?: number | null
          id?: string
          is_retry?: boolean
          keyword_matched?: boolean | null
          reason?: Database["public"]["Enums"]["resume_access_failure_reason"]
          referral_id?: string | null
          retry_of_failure_id?: string | null
          source?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resume_access_failure_audit_retry_of_failure_id_fkey"
            columns: ["retry_of_failure_id"]
            isOneToOne: false
            referencedRelation: "resume_access_failure_audit"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_history: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          effective_from: string
          employee_id: string
          id: string
          notes: string | null
          salary: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          effective_from: string
          employee_id: string
          id?: string
          notes?: string | null
          salary?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          effective_from?: string
          employee_id?: string
          id?: string
          notes?: string | null
          salary?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_sheet_entries: {
        Row: {
          bank_account: string | null
          created_at: string
          deductions: number
          deductions_override: boolean | null
          el_leaves: number
          el_leaves_override: boolean | null
          employee_id: string
          employee_name: string
          id: string
          ifsc_code: string | null
          last_working_date: string | null
          pending_amount: number
          reimbursements: number
          remarks: string | null
          salary: number
          salary_sheet_id: string
          sl_leaves: number
          sl_leaves_override: boolean | null
          tax: number
          tds: number
          total: number
          unpaid_leaves: number
          unpaid_leaves_override: boolean | null
          updated_at: string
          wfh_days: number
          wfh_days_override: boolean | null
        }
        Insert: {
          bank_account?: string | null
          created_at?: string
          deductions?: number
          deductions_override?: boolean | null
          el_leaves?: number
          el_leaves_override?: boolean | null
          employee_id: string
          employee_name: string
          id?: string
          ifsc_code?: string | null
          last_working_date?: string | null
          pending_amount?: number
          reimbursements?: number
          remarks?: string | null
          salary?: number
          salary_sheet_id: string
          sl_leaves?: number
          sl_leaves_override?: boolean | null
          tax?: number
          tds?: number
          total?: number
          unpaid_leaves?: number
          unpaid_leaves_override?: boolean | null
          updated_at?: string
          wfh_days?: number
          wfh_days_override?: boolean | null
        }
        Update: {
          bank_account?: string | null
          created_at?: string
          deductions?: number
          deductions_override?: boolean | null
          el_leaves?: number
          el_leaves_override?: boolean | null
          employee_id?: string
          employee_name?: string
          id?: string
          ifsc_code?: string | null
          last_working_date?: string | null
          pending_amount?: number
          reimbursements?: number
          remarks?: string | null
          salary?: number
          salary_sheet_id?: string
          sl_leaves?: number
          sl_leaves_override?: boolean | null
          tax?: number
          tds?: number
          total?: number
          unpaid_leaves?: number
          unpaid_leaves_override?: boolean | null
          updated_at?: string
          wfh_days?: number
          wfh_days_override?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_sheet_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_sheet_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_sheet_entries_salary_sheet_id_fkey"
            columns: ["salary_sheet_id"]
            isOneToOne: false
            referencedRelation: "salary_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_sheets: {
        Row: {
          created_at: string
          created_by: string
          created_by_name: string
          id: string
          locked_at: string | null
          locked_by: string | null
          month: number
          status: Database["public"]["Enums"]["salary_sheet_status"]
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by: string
          created_by_name: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          month: number
          status?: Database["public"]["Enums"]["salary_sheet_status"]
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string
          created_by_name?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          month?: number
          status?: Database["public"]["Enums"]["salary_sheet_status"]
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      sales_attribution_log: {
        Row: {
          changed_by: string | null
          changed_by_name: string | null
          created_at: string
          evidence: Json
          from_sales_person_id: string | null
          id: string
          order_id: string
          reason: string | null
          reason_custom: string | null
          source: string
          to_sales_person_id: string
          to_sales_person_name: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          evidence?: Json
          from_sales_person_id?: string | null
          id?: string
          order_id: string
          reason?: string | null
          reason_custom?: string | null
          source: string
          to_sales_person_id: string
          to_sales_person_name: string
        }
        Update: {
          changed_by?: string | null
          changed_by_name?: string | null
          created_at?: string
          evidence?: Json
          from_sales_person_id?: string | null
          id?: string
          order_id?: string
          reason?: string | null
          reason_custom?: string | null
          source?: string
          to_sales_person_id?: string
          to_sales_person_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_attribution_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sales_attribution_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_attribution_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_attribution_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          decision_note: string | null
          evidence: Json
          id: string
          order_id: string
          reason: string | null
          reason_custom: string | null
          requested_by: string
          requested_by_name: string | null
          requested_for_name: string | null
          requested_for_sales_person_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          decision_note?: string | null
          evidence?: Json
          id?: string
          order_id: string
          reason?: string | null
          reason_custom?: string | null
          requested_by: string
          requested_by_name?: string | null
          requested_for_name?: string | null
          requested_for_sales_person_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          decision_note?: string | null
          evidence?: Json
          id?: string
          order_id?: string
          reason?: string | null
          reason_custom?: string | null
          requested_by?: string
          requested_by_name?: string | null
          requested_for_name?: string | null
          requested_for_sales_person_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_attribution_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sales_attribution_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_attribution_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
        ]
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
      sales_unavailability: {
        Row: {
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          ends_at: string
          id: string
          notes: string | null
          reason: Database["public"]["Enums"]["unavailability_reason"]
          starts_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["unavailability_reason"]
          starts_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          reason?: Database["public"]["Enums"]["unavailability_reason"]
          starts_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json | null
          id: string
          is_resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json | null
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          is_resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string
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
      security_findings_ledger: {
        Row: {
          commit_ref: string | null
          created_at: string
          description: string | null
          finding_id: string
          first_seen_at: string
          id: string
          internal_id: string
          last_seen_at: string
          metadata: Json
          migration_ref: string | null
          name: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          scanner_name: string
          severity: string | null
          status: Database["public"]["Enums"]["security_finding_status"]
          updated_at: string
        }
        Insert: {
          commit_ref?: string | null
          created_at?: string
          description?: string | null
          finding_id: string
          first_seen_at?: string
          id?: string
          internal_id: string
          last_seen_at?: string
          metadata?: Json
          migration_ref?: string | null
          name: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scanner_name: string
          severity?: string | null
          status?: Database["public"]["Enums"]["security_finding_status"]
          updated_at?: string
        }
        Update: {
          commit_ref?: string | null
          created_at?: string
          description?: string | null
          finding_id?: string
          first_seen_at?: string
          id?: string
          internal_id?: string
          last_seen_at?: string
          metadata?: Json
          migration_ref?: string | null
          name?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scanner_name?: string
          severity?: string | null
          status?: Database["public"]["Enums"]["security_finding_status"]
          updated_at?: string
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
      shopify_pipeline_alert_state: {
        Row: {
          alert_key: string
          last_alerted_at: string
          last_payload: Json | null
          updated_at: string
        }
        Insert: {
          alert_key: string
          last_alerted_at?: string
          last_payload?: Json | null
          updated_at?: string
        }
        Update: {
          alert_key?: string
          last_alerted_at?: string
          last_payload?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      slack_settings: {
        Row: {
          channel_enquiries: string | null
          channel_order_status: string | null
          channel_orders: string | null
          channel_pipeline: string | null
          channel_procurements: string | null
          channel_sales_report: string | null
          channel_suppliers: string | null
          channel_tickets: string | null
          created_at: string
          enable_ai_insights: boolean | null
          enable_daily_report: boolean | null
          enable_interactive_actions: boolean | null
          enable_weekly_report: boolean | null
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
          channel_order_status?: string | null
          channel_orders?: string | null
          channel_pipeline?: string | null
          channel_procurements?: string | null
          channel_sales_report?: string | null
          channel_suppliers?: string | null
          channel_tickets?: string | null
          created_at?: string
          enable_ai_insights?: boolean | null
          enable_daily_report?: boolean | null
          enable_interactive_actions?: boolean | null
          enable_weekly_report?: boolean | null
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
          channel_order_status?: string | null
          channel_orders?: string | null
          channel_pipeline?: string | null
          channel_procurements?: string | null
          channel_sales_report?: string | null
          channel_suppliers?: string | null
          channel_tickets?: string | null
          created_at?: string
          enable_ai_insights?: boolean | null
          enable_daily_report?: boolean | null
          enable_interactive_actions?: boolean | null
          enable_weekly_report?: boolean | null
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
      sms_phone_suppression: {
        Row: {
          created_at: string
          failure_count: number
          first_failure_at: string
          id: string
          last_failure_at: string
          last_request_id: string | null
          notes: string | null
          phone_e164: string
          reason: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          failure_count?: number
          first_failure_at?: string
          id?: string
          last_failure_at?: string
          last_request_id?: string | null
          notes?: string | null
          phone_e164: string
          reason: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          failure_count?: number
          first_failure_at?: string
          id?: string
          last_failure_at?: string
          last_request_id?: string | null
          notes?: string | null
          phone_e164?: string
          reason?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      spare_parts_inventory: {
        Row: {
          category: string | null
          cost_price: number
          created_at: string
          created_by: string | null
          id: string
          last_purchase_date: string | null
          minimum_stock_threshold: number
          part_code: string | null
          part_name: string
          profit_margin_percent: number | null
          profit_per_unit: number | null
          quantity: number
          remarks: string | null
          selling_price: number
          stock_status: Database["public"]["Enums"]["spare_part_stock_status"]
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          category?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          id?: string
          last_purchase_date?: string | null
          minimum_stock_threshold?: number
          part_code?: string | null
          part_name: string
          profit_margin_percent?: number | null
          profit_per_unit?: number | null
          quantity?: number
          remarks?: string | null
          selling_price?: number
          stock_status?: Database["public"]["Enums"]["spare_part_stock_status"]
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          category?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          id?: string
          last_purchase_date?: string | null
          minimum_stock_threshold?: number
          part_code?: string | null
          part_name?: string
          profit_margin_percent?: number | null
          profit_per_unit?: number | null
          quantity?: number
          remarks?: string | null
          selling_price?: number
          stock_status?: Database["public"]["Enums"]["spare_part_stock_status"]
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spare_parts_inventory_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      spare_parts_sales: {
        Row: {
          buyer_name: string | null
          buyer_phone: string | null
          created_at: string
          id: string
          notes: string | null
          part_id: string
          quantity: number
          sale_date: string
          sale_price: number
          sold_by: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          part_id: string
          quantity: number
          sale_date?: string
          sale_price: number
          sold_by?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          buyer_name?: string | null
          buyer_phone?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          part_id?: string
          quantity?: number
          sale_date?: string
          sale_price?: number
          sold_by?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spare_parts_sales_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "spare_parts_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      spare_parts_transactions: {
        Row: {
          change_type: Database["public"]["Enums"]["spare_part_change_type"]
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          part_id: string
          quantity_change: number
          reason: Database["public"]["Enums"]["spare_part_change_reason"]
          repair_id: string | null
        }
        Insert: {
          change_type: Database["public"]["Enums"]["spare_part_change_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          part_id: string
          quantity_change: number
          reason: Database["public"]["Enums"]["spare_part_change_reason"]
          repair_id?: string | null
        }
        Update: {
          change_type?: Database["public"]["Enums"]["spare_part_change_type"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          part_id?: string
          quantity_change?: number
          reason?: Database["public"]["Enums"]["spare_part_change_reason"]
          repair_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spare_parts_transactions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "spare_parts_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spare_parts_transactions_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_uploads: {
        Row: {
          card_id: string | null
          confidence_score: number | null
          created_at: string
          detected_bank: string | null
          detected_card_name: string | null
          error_message: string | null
          file_name: string
          file_url: string
          id: string
          parsed_json: Json | null
          statement_id: string | null
          status: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          card_id?: string | null
          confidence_score?: number | null
          created_at?: string
          detected_bank?: string | null
          detected_card_name?: string | null
          error_message?: string | null
          file_name: string
          file_url: string
          id?: string
          parsed_json?: Json | null
          statement_id?: string | null
          status?: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          card_id?: string | null
          confidence_score?: number | null
          created_at?: string
          detected_bank?: string | null
          detected_card_name?: string | null
          error_message?: string | null
          file_name?: string
          file_url?: string
          id?: string
          parsed_json?: Json | null
          statement_id?: string | null
          status?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_uploads_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_uploads_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "cc_statements"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "supplier_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "supplier_quotations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "supplier_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      sync_health_runs: {
        Row: {
          details: Json
          email_sent: boolean
          healthy_count: number
          id: string
          ran_at: string
          stale_count: number
          triggered_by: string
        }
        Insert: {
          details?: Json
          email_sent?: boolean
          healthy_count?: number
          id?: string
          ran_at?: string
          stale_count?: number
          triggered_by?: string
        }
        Update: {
          details?: Json
          email_sent?: boolean
          healthy_count?: number
          id?: string
          ran_at?: string
          stale_count?: number
          triggered_by?: string
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
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
      ticket_ai_resolutions: {
        Row: {
          applied_at: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          confidence_score: number | null
          created_at: string | null
          estimated_complexity: string | null
          id: string
          implementation_report: Json | null
          implementation_status: string | null
          implemented_at: string | null
          lovable_prompt: string | null
          needs_human_review: boolean | null
          rejection_reason: string | null
          resolution_comment: string | null
          resolution_plan: string | null
          resolution_type: string | null
          review_reason: string | null
          root_cause: string | null
          ticket_id: string
        }
        Insert: {
          applied_at?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          confidence_score?: number | null
          created_at?: string | null
          estimated_complexity?: string | null
          id?: string
          implementation_report?: Json | null
          implementation_status?: string | null
          implemented_at?: string | null
          lovable_prompt?: string | null
          needs_human_review?: boolean | null
          rejection_reason?: string | null
          resolution_comment?: string | null
          resolution_plan?: string | null
          resolution_type?: string | null
          review_reason?: string | null
          root_cause?: string | null
          ticket_id: string
        }
        Update: {
          applied_at?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          confidence_score?: number | null
          created_at?: string | null
          estimated_complexity?: string | null
          id?: string
          implementation_report?: Json | null
          implementation_status?: string | null
          implemented_at?: string | null
          lovable_prompt?: string | null
          needs_human_review?: boolean | null
          rejection_reason?: string | null
          resolution_comment?: string | null
          resolution_plan?: string | null
          resolution_type?: string | null
          review_reason?: string | null
          root_cause?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_ai_resolutions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_ai_suggestions: {
        Row: {
          applied: boolean
          applied_at: string | null
          applied_by: string | null
          applied_by_name: string | null
          created_at: string
          draft_reply: string | null
          id: string
          priority_reason: string | null
          suggested_assignee_id: string | null
          suggested_assignee_name: string | null
          suggested_priority: string | null
          ticket_id: string
        }
        Insert: {
          applied?: boolean
          applied_at?: string | null
          applied_by?: string | null
          applied_by_name?: string | null
          created_at?: string
          draft_reply?: string | null
          id?: string
          priority_reason?: string | null
          suggested_assignee_id?: string | null
          suggested_assignee_name?: string | null
          suggested_priority?: string | null
          ticket_id: string
        }
        Update: {
          applied?: boolean
          applied_at?: string | null
          applied_by?: string | null
          applied_by_name?: string | null
          created_at?: string
          draft_reply?: string | null
          id?: string
          priority_reason?: string | null
          suggested_assignee_id?: string | null
          suggested_assignee_name?: string | null
          suggested_priority?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_ai_suggestions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          ai_generated: boolean | null
          attachment_urls: string[] | null
          comment: string
          comment_type: string | null
          commented_by: string
          commented_by_name: string
          created_at: string
          id: string
          is_internal: boolean | null
          ticket_id: string
        }
        Insert: {
          ai_generated?: boolean | null
          attachment_urls?: string[] | null
          comment: string
          comment_type?: string | null
          commented_by: string
          commented_by_name: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          ticket_id: string
        }
        Update: {
          ai_generated?: boolean | null
          attachment_urls?: string[] | null
          comment?: string
          comment_type?: string | null
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
      ticket_notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string
          read: boolean | null
          ticket_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          read?: boolean | null
          ticket_id: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          read?: boolean | null
          ticket_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sla_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          acknowledged_by_name: string | null
          alert_message: string
          id: string
          notified_at: string
          ticket_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_by_name?: string | null
          alert_message: string
          id?: string
          notified_at?: string
          ticket_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acknowledged_by_name?: string | null
          alert_message?: string
          id?: string
          notified_at?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sla_alerts_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          ai_category: string | null
          ai_resolution_status: string | null
          ai_summary: string | null
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
          sla_breached: boolean
          sla_due_at: string | null
          sla_response_at: string | null
          sla_status: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number: string | null
          updated_at: string
        }
        Insert: {
          ai_category?: string | null
          ai_resolution_status?: string | null
          ai_summary?: string | null
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
          sla_breached?: boolean
          sla_due_at?: string | null
          sla_response_at?: string | null
          sla_status?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          ticket_number?: string | null
          updated_at?: string
        }
        Update: {
          ai_category?: string | null
          ai_resolution_status?: string | null
          ai_summary?: string | null
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
          sla_breached?: boolean
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
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
        ]
      }
      training_assignments: {
        Row: {
          assigned_by: string
          assigned_by_name: string
          assigned_date: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string
          employee_id: string
          id: string
          last_accessed: string | null
          priority: string
          progress_percentage: number
          status: string
          training_id: string
          training_title: string
          updated_at: string
        }
        Insert: {
          assigned_by: string
          assigned_by_name: string
          assigned_date?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          employee_id: string
          id?: string
          last_accessed?: string | null
          priority?: string
          progress_percentage?: number
          status?: string
          training_id: string
          training_title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string
          assigned_by_name?: string
          assigned_date?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          employee_id?: string
          id?: string
          last_accessed?: string | null
          priority?: string
          progress_percentage?: number
          status?: string
          training_id?: string
          training_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_assignments_training_id_fkey"
            columns: ["training_id"]
            isOneToOne: false
            referencedRelation: "employee_trainings"
            referencedColumns: ["id"]
          },
        ]
      }
      training_resource_tracking: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          is_viewed: boolean
          master_resource_id: string | null
          resource_id: string
          training_assignment_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          is_viewed?: boolean
          master_resource_id?: string | null
          resource_id: string
          training_assignment_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          is_viewed?: boolean
          master_resource_id?: string | null
          resource_id?: string
          training_assignment_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_resource_tracking_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_resource_tracking_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_resource_tracking_master_resource_id_fkey"
            columns: ["master_resource_id"]
            isOneToOne: false
            referencedRelation: "employee_training_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_resource_tracking_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "training_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_resource_tracking_training_assignment_id_fkey"
            columns: ["training_assignment_id"]
            isOneToOne: false
            referencedRelation: "training_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      training_resources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          resource_order: number
          resource_type: string
          thumbnail_url: string | null
          title: string
          training_assignment_id: string
          url_or_file_path: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          resource_order?: number
          resource_type: string
          thumbnail_url?: string | null
          title: string
          training_assignment_id: string
          url_or_file_path?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          resource_order?: number
          resource_type?: string
          thumbnail_url?: string | null
          title?: string
          training_assignment_id?: string
          url_or_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_resources_training_assignment_id_fkey"
            columns: ["training_assignment_id"]
            isOneToOne: false
            referencedRelation: "training_assignments"
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
      trusted_devices: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          device_hash: string
          device_name: string | null
          dynamic_fingerprint: string | null
          expires_at: string
          id: string
          is_revoked: boolean
          last_used_at: string
          stable_fingerprint: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          device_hash: string
          device_name?: string | null
          dynamic_fingerprint?: string | null
          expires_at: string
          id?: string
          is_revoked?: boolean
          last_used_at?: string
          stable_fingerprint?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          device_hash?: string
          device_name?: string | null
          dynamic_fingerprint?: string | null
          expires_at?: string
          id?: string
          is_revoked?: boolean
          last_used_at?: string
          stable_fingerprint?: string | null
          user_id?: string
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
          last_ip: string | null
          last_mfa_verified_at: string | null
          location: string | null
          os: string | null
          revocation_reason: string | null
          revoked_at: string | null
          session_token_hash: string | null
          session_version: number
          started_at: string
          user_agent: string | null
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
          last_ip?: string | null
          last_mfa_verified_at?: string | null
          location?: string | null
          os?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          session_token_hash?: string | null
          session_version?: number
          started_at?: string
          user_agent?: string | null
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
          last_ip?: string | null
          last_mfa_verified_at?: string | null
          location?: string | null
          os?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          session_token_hash?: string | null
          session_version?: number
          started_at?: string
          user_agent?: string | null
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
      webhook_debug_logs: {
        Row: {
          created_at: string
          error_message: string | null
          headers: Json
          id: string
          processing_stage: string | null
          raw_payload: string | null
          request_method: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          headers?: Json
          id?: string
          processing_stage?: string | null
          raw_payload?: string | null
          request_method?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          headers?: Json
          id?: string
          processing_stage?: string | null
          raw_payload?: string | null
          request_method?: string | null
        }
        Relationships: []
      }
      woo_lead_activities: {
        Row: {
          activity_date: string
          activity_type: string
          created_at: string
          description: string
          id: string
          metadata: Json | null
          performed_by: string
          performed_by_name: string
          updated_at: string
          woo_order_id: string
        }
        Insert: {
          activity_date?: string
          activity_type?: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          performed_by: string
          performed_by_name?: string
          updated_at?: string
          woo_order_id: string
        }
        Update: {
          activity_date?: string
          activity_type?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          performed_by?: string
          performed_by_name?: string
          updated_at?: string
          woo_order_id?: string
        }
        Relationships: []
      }
      woo_sync_logs: {
        Row: {
          attempt: number
          created_at: string
          direction: string
          error_message: string | null
          event_type: string
          id: string
          internal_order_id: string | null
          payload: Json | null
          status: string
          woo_order_id: string | null
          woo_status: string | null
        }
        Insert: {
          attempt?: number
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type: string
          id?: string
          internal_order_id?: string | null
          payload?: Json | null
          status: string
          woo_order_id?: string | null
          woo_status?: string | null
        }
        Update: {
          attempt?: number
          created_at?: string
          direction?: string
          error_message?: string | null
          event_type?: string
          id?: string
          internal_order_id?: string | null
          payload?: Json | null
          status?: string
          woo_order_id?: string | null
          woo_status?: string | null
        }
        Relationships: []
      }
      woocommerce_order_status_logs: {
        Row: {
          changed_by: string | null
          changed_by_email: string | null
          created_at: string
          error_message: string | null
          id: string
          new_status: string
          order_number: string | null
          previous_status: string | null
          source: string
          woo_api_response: Json | null
          woo_api_success: boolean | null
          woo_order_id: string
        }
        Insert: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          new_status: string
          order_number?: string | null
          previous_status?: string | null
          source?: string
          woo_api_response?: Json | null
          woo_api_success?: boolean | null
          woo_order_id: string
        }
        Update: {
          changed_by?: string | null
          changed_by_email?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          new_status?: string
          order_number?: string | null
          previous_status?: string | null
          source?: string
          woo_api_response?: Json | null
          woo_api_success?: boolean | null
          woo_order_id?: string
        }
        Relationships: []
      }
      woocommerce_orders: {
        Row: {
          amount_paid: number | null
          assigned_at: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          courier: string | null
          created_at: string
          currency: string | null
          customer_company: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          expected_delivery: string | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          internal_notes: string | null
          is_lost_lead: boolean
          line_items: Json | null
          lost_lead_at: string | null
          lost_lead_reason: string | null
          order_number: string | null
          order_status: string | null
          payment_status: string | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          raw_data: Json | null
          sales_notes: string | null
          selling_price: number | null
          shipping_address: string | null
          source: string
          total_sales_amount: number | null
          tracking_number: string | null
          tracking_status: string | null
          updated_at: string
          woo_created_at: string | null
          woo_order_id: string
          woo_updated_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          assigned_at?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          courier?: string | null
          created_at?: string
          currency?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          expected_delivery?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          internal_notes?: string | null
          is_lost_lead?: boolean
          line_items?: Json | null
          lost_lead_at?: string | null
          lost_lead_reason?: string | null
          order_number?: string | null
          order_status?: string | null
          payment_status?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          raw_data?: Json | null
          sales_notes?: string | null
          selling_price?: number | null
          shipping_address?: string | null
          source?: string
          total_sales_amount?: number | null
          tracking_number?: string | null
          tracking_status?: string | null
          updated_at?: string
          woo_created_at?: string | null
          woo_order_id: string
          woo_updated_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          assigned_at?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          courier?: string | null
          created_at?: string
          currency?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          expected_delivery?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          id?: string
          internal_notes?: string | null
          is_lost_lead?: boolean
          line_items?: Json | null
          lost_lead_at?: string | null
          lost_lead_reason?: string | null
          order_number?: string | null
          order_status?: string | null
          payment_status?: string | null
          product_category?: string | null
          product_code?: string | null
          product_name?: string
          quantity?: number
          raw_data?: Json | null
          sales_notes?: string | null
          selling_price?: number | null
          shipping_address?: string | null
          source?: string
          total_sales_amount?: number | null
          tracking_number?: string | null
          tracking_status?: string | null
          updated_at?: string
          woo_created_at?: string | null
          woo_order_id?: string
          woo_updated_at?: string | null
        }
        Relationships: []
      }
      woocommerce_sync_runs: {
        Row: {
          completed_at: string | null
          end_page: number | null
          errors: number | null
          has_more: boolean | null
          id: string
          message: string | null
          mode: string
          modified_after: string | null
          next_page: number | null
          orders_fetched: number | null
          orders_upserted: number | null
          pages_fetched: number | null
          start_page: number | null
          started_at: string
          status: string
          total_in_woocommerce: number | null
          triggered_by: string
        }
        Insert: {
          completed_at?: string | null
          end_page?: number | null
          errors?: number | null
          has_more?: boolean | null
          id?: string
          message?: string | null
          mode: string
          modified_after?: string | null
          next_page?: number | null
          orders_fetched?: number | null
          orders_upserted?: number | null
          pages_fetched?: number | null
          start_page?: number | null
          started_at?: string
          status?: string
          total_in_woocommerce?: number | null
          triggered_by?: string
        }
        Update: {
          completed_at?: string | null
          end_page?: number | null
          errors?: number | null
          has_more?: boolean | null
          id?: string
          message?: string | null
          mode?: string
          modified_after?: string | null
          next_page?: number | null
          orders_fetched?: number | null
          orders_upserted?: number | null
          pages_fetched?: number | null
          start_page?: number | null
          started_at?: string
          status?: string
          total_in_woocommerce?: number | null
          triggered_by?: string
        }
        Relationships: []
      }
      woocommerce_sync_state: {
        Row: {
          id: number
          last_backfill_completed_at: string | null
          last_backfill_started_at: string | null
          last_incremental_at: string | null
          total_in_woocommerce: number | null
          total_orders_synced: number | null
          updated_at: string
        }
        Insert: {
          id?: number
          last_backfill_completed_at?: string | null
          last_backfill_started_at?: string | null
          last_incremental_at?: string | null
          total_in_woocommerce?: number | null
          total_orders_synced?: number | null
          updated_at?: string
        }
        Update: {
          id?: number
          last_backfill_completed_at?: string | null
          last_backfill_started_at?: string | null
          last_incremental_at?: string | null
          total_in_woocommerce?: number | null
          total_orders_synced?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      zoho_books_invoices: {
        Row: {
          balance: number | null
          created_time: string | null
          currency_code: string | null
          customer_id: string | null
          customer_name: string | null
          date: string | null
          due_date: string | null
          invoice_id: string
          invoice_number: string | null
          last_modified_time: string | null
          linked_order_id: string | null
          linked_order_number: string | null
          match_method: string | null
          match_status: string
          matched_at: string | null
          organization_id: string
          pdf_attached_invoice_id: string | null
          pdf_hash: string | null
          pdf_synced_at: string | null
          raw: Json | null
          reference_number: string | null
          status: string | null
          synced_at: string
          total: number | null
        }
        Insert: {
          balance?: number | null
          created_time?: string | null
          currency_code?: string | null
          customer_id?: string | null
          customer_name?: string | null
          date?: string | null
          due_date?: string | null
          invoice_id: string
          invoice_number?: string | null
          last_modified_time?: string | null
          linked_order_id?: string | null
          linked_order_number?: string | null
          match_method?: string | null
          match_status?: string
          matched_at?: string | null
          organization_id: string
          pdf_attached_invoice_id?: string | null
          pdf_hash?: string | null
          pdf_synced_at?: string | null
          raw?: Json | null
          reference_number?: string | null
          status?: string | null
          synced_at?: string
          total?: number | null
        }
        Update: {
          balance?: number | null
          created_time?: string | null
          currency_code?: string | null
          customer_id?: string | null
          customer_name?: string | null
          date?: string | null
          due_date?: string | null
          invoice_id?: string
          invoice_number?: string | null
          last_modified_time?: string | null
          linked_order_id?: string | null
          linked_order_number?: string | null
          match_method?: string | null
          match_status?: string
          matched_at?: string | null
          organization_id?: string
          pdf_attached_invoice_id?: string | null
          pdf_hash?: string | null
          pdf_synced_at?: string | null
          raw?: Json | null
          reference_number?: string | null
          status?: string | null
          synced_at?: string
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "zoho_books_invoices_linked_order_id_fkey"
            columns: ["linked_order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "zoho_books_invoices_linked_order_id_fkey"
            columns: ["linked_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoho_books_invoices_linked_order_id_fkey"
            columns: ["linked_order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoho_books_invoices_pdf_attached_fk"
            columns: ["pdf_attached_invoice_id"]
            isOneToOne: false
            referencedRelation: "order_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          provider: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          provider?: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          provider?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      zoho_poller_state: {
        Row: {
          last_error: string | null
          last_polled_at: string | null
          last_success_at: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          last_error?: string | null
          last_polled_at?: string | null
          last_success_at?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          last_error?: string | null
          last_polled_at?: string | null
          last_success_at?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      zoho_sync_log: {
        Row: {
          completed_at: string | null
          entity: string
          error_message: string | null
          id: string
          provider: string
          records_synced: number | null
          started_at: string
          stats: Json | null
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          entity: string
          error_message?: string | null
          id?: string
          provider: string
          records_synced?: number | null
          started_at?: string
          stats?: Json | null
          status: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          entity?: string
          error_message?: string | null
          id?: string
          provider?: string
          records_synced?: number | null
          started_at?: string
          stats?: Json | null
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      zoho_tokens: {
        Row: {
          access_token: string
          api_domain: string
          connected_at: string
          connected_by: string | null
          expires_at: string
          organization_id: string | null
          provider: string
          refresh_token: string
          scope: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          api_domain: string
          connected_at?: string
          connected_by?: string | null
          expires_at: string
          organization_id?: string | null
          provider: string
          refresh_token: string
          scope?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          api_domain?: string
          connected_at?: string
          connected_by?: string | null
          expires_at?: string
          organization_id?: string | null
          provider?: string
          refresh_token?: string
          scope?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      attribution_integrity_violations: {
        Row: {
          attributed_at: string | null
          attributed_by: string | null
          attributed_by_name: string | null
          external_id: string | null
          issue: string | null
          order_id: string | null
          order_number: string | null
          sales_attribution_reason: string | null
          sales_person_id: string | null
          sales_person_name: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          attributed_at?: string | null
          attributed_by?: string | null
          attributed_by_name?: string | null
          external_id?: string | null
          issue?: never
          order_id?: string | null
          order_number?: string | null
          sales_attribution_reason?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          attributed_at?: string | null
          attributed_by?: string | null
          attributed_by_name?: string | null
          external_id?: string | null
          issue?: never
          order_id?: string | null
          order_number?: string | null
          sales_attribution_reason?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      campaign_performance: {
        Row: {
          campaign_id: string | null
          campaign_name: string | null
          conversions: number | null
          cpl: number | null
          profit: number | null
          qualified_leads: number | null
          revenue: number | null
          roas: number | null
          total_leads: number | null
          total_spend: number | null
        }
        Relationships: []
      }
      daily_performance: {
        Row: {
          conversions: number | null
          date: string | null
          leads: number | null
          revenue: number | null
          spend: number | null
        }
        Relationships: []
      }
      employees_directory: {
        Row: {
          city: string | null
          department: string | null
          designation: string | null
          employee_number: string | null
          employee_type: string | null
          employment_status:
            | Database["public"]["Enums"]["employment_status"]
            | null
          exit_date: string | null
          gender: string | null
          id: string | null
          is_active: boolean | null
          joining_date: string | null
          manager_id: string | null
          monthly_attendance_target: number | null
          name: string | null
          phone: string | null
          role: string | null
          shift_end_time: string | null
          shift_start_time: string | null
          shift_type: string | null
          state: string | null
          user_id: string | null
          weekly_hours_target: number | null
          work_location: string | null
          xboom_email: string | null
        }
        Insert: {
          city?: string | null
          department?: string | null
          designation?: string | null
          employee_number?: string | null
          employee_type?: string | null
          employment_status?:
            | Database["public"]["Enums"]["employment_status"]
            | null
          exit_date?: string | null
          gender?: string | null
          id?: string | null
          is_active?: boolean | null
          joining_date?: string | null
          manager_id?: string | null
          monthly_attendance_target?: number | null
          name?: string | null
          phone?: string | null
          role?: string | null
          shift_end_time?: string | null
          shift_start_time?: string | null
          shift_type?: string | null
          state?: string | null
          user_id?: string | null
          weekly_hours_target?: number | null
          work_location?: string | null
          xboom_email?: string | null
        }
        Update: {
          city?: string | null
          department?: string | null
          designation?: string | null
          employee_number?: string | null
          employee_type?: string | null
          employment_status?:
            | Database["public"]["Enums"]["employment_status"]
            | null
          exit_date?: string | null
          gender?: string | null
          id?: string | null
          is_active?: boolean | null
          joining_date?: string | null
          manager_id?: string | null
          monthly_attendance_target?: number | null
          name?: string | null
          phone?: string | null
          role?: string | null
          shift_end_time?: string | null
          shift_start_time?: string | null
          shift_type?: string | null
          state?: string | null
          user_id?: string | null
          weekly_hours_target?: number | null
          work_location?: string | null
          xboom_email?: string | null
        }
        Relationships: []
      }
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
      lead_assignment_mismatches: {
        Row: {
          agent_id: string | null
          agent_phone: string | null
          current_user_id: string | null
          expected_user_id: string | null
          lead_id: string | null
          source: string | null
        }
        Relationships: []
      }
      notification_metrics_today: {
        Row: {
          avg_latency_ms: number | null
          failed_messages_today: number | null
          messages_sent_today: number | null
          pending_backlog: number | null
          retry_rate_pct: number | null
        }
        Relationships: []
      }
      order_primary_payment_mode: {
        Row: {
          order_id: string | null
          order_total: number | null
          primary_payment_mode: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "attribution_integrity_violations"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "payment_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders_missing_phone"
            referencedColumns: ["id"]
          },
        ]
      }
      orders_missing_phone: {
        Row: {
          created_at: string | null
          customer_company: string | null
          customer_email: string | null
          customer_name: string | null
          id: string | null
          order_date: string | null
          order_number: string | null
          sales_person_id: string | null
          sales_person_name: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          total_sales_amount: number | null
        }
        Insert: {
          created_at?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string | null
          order_date?: string | null
          order_number?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_sales_amount?: number | null
        }
        Update: {
          created_at?: string | null
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string | null
          order_date?: string | null
          order_number?: string | null
          sales_person_id?: string | null
          sales_person_name?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_sales_amount?: number | null
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
          description: string | null
          id: string | null
          lead_time: string | null
          marketing_collateral_name: string | null
          marketing_collateral_url: string | null
          min_order_quantity: number | null
          notes: string | null
          product_category: string | null
          product_name: string | null
          sync_source: string | null
          unit_price: number | null
          updated_at: string | null
          updated_by: string | null
          website_price: number | null
          website_price_includes_gst: boolean | null
          website_synced_at: string | null
          weight_grams: number | null
          woo_product_id: number | null
          woo_sku: string | null
          woo_stock_status: string | null
        }
        Insert: {
          availability?: string | null
          brand?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          lead_time?: string | null
          marketing_collateral_name?: string | null
          marketing_collateral_url?: string | null
          min_order_quantity?: number | null
          notes?: string | null
          product_category?: string | null
          product_name?: string | null
          sync_source?: string | null
          unit_price?: number | null
          updated_at?: string | null
          updated_by?: string | null
          website_price?: number | null
          website_price_includes_gst?: boolean | null
          website_synced_at?: string | null
          weight_grams?: number | null
          woo_product_id?: number | null
          woo_sku?: string | null
          woo_stock_status?: string | null
        }
        Update: {
          availability?: string | null
          brand?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          lead_time?: string | null
          marketing_collateral_name?: string | null
          marketing_collateral_url?: string | null
          min_order_quantity?: number | null
          notes?: string | null
          product_category?: string | null
          product_name?: string | null
          sync_source?: string | null
          unit_price?: number | null
          updated_at?: string | null
          updated_by?: string | null
          website_price?: number | null
          website_price_includes_gst?: boolean | null
          website_synced_at?: string | null
          weight_grams?: number | null
          woo_product_id?: number | null
          woo_sku?: string | null
          woo_stock_status?: string | null
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
      unified_lead_feed: {
        Row: {
          company: string | null
          created_at: string | null
          disposition: string | null
          disposition_at: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          is_assigned: boolean | null
          name: string | null
          phone: string | null
          product_name: string | null
          sales_person_id: string | null
          sales_person_name: string | null
          source: string | null
          source_row_id: string | null
          source_table: string | null
          status: string | null
          subject_or_message: string | null
        }
        Relationships: []
      }
      unified_lead_feed_dispositions: {
        Row: {
          company: string | null
          created_at: string | null
          disposition: Database["public"]["Enums"]["lead_disposition"] | null
          disposition_at: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          name: string | null
          phone: string | null
          sales_person_id: string | null
          sales_person_name: string | null
          source: string | null
          source_row_id: string | null
          source_table: string | null
          subject_or_message: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _attribute_website_order_core: {
        Args: {
          p_actor_id: string
          p_actor_name: string
          p_evidence?: Json
          p_order_id: string
          p_reason: string
          p_reason_custom: string
          p_sales_person_id: string
          p_source: string
        }
        Returns: undefined
      }
      _create_procurement_for_order: {
        Args: { _order: Database["public"]["Tables"]["orders"]["Row"] }
        Returns: undefined
      }
      _current_portal_contact: {
        Args: never
        Returns: {
          account_id: string
          auth_user_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          invited_at: string | null
          is_active: boolean
          last_login_at: string | null
          phone: string | null
          role: string
          whatsapp_number: string | null
        }
        SetofOptions: {
          from: "*"
          to: "portal_contacts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _deduct_parts_for_repair: {
        Args: { _repair: Database["public"]["Tables"]["repairs"]["Row"] }
        Returns: undefined
      }
      allowed_website_lead_assignees: {
        Args: never
        Returns: {
          uid: string
          uname: string
        }[]
      }
      approve_compoff_credit: {
        Args: { p_comment?: string; p_ledger_id: string }
        Returns: boolean
      }
      approve_compoff_credits_bulk: {
        Args: { p_comment?: string; p_ledger_ids: string[] }
        Returns: {
          error: string
          ledger_id: string
          ok: boolean
        }[]
      }
      approve_delivery_proof: {
        Args: { p_order_id: string }
        Returns: undefined
      }
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
      assert_compoff_ledger_return_alignment: {
        Args: never
        Returns: undefined
      }
      assert_gmail_integrations_grants: { Args: never; Returns: undefined }
      assign_lead_with_sticky: {
        Args: { _email: string; _form_type?: string; _phone: string }
        Returns: Record<string, unknown>
      }
      assign_orphan_leads_sweep: { Args: never; Returns: number }
      assign_woo_lead: {
        Args: { p_assignee: string; p_order_id: string }
        Returns: undefined
      }
      attach_zoho_invoice_to_order: {
        Args: { p_order_id: string; p_zoho_invoice_id: string }
        Returns: undefined
      }
      attendance_logs_self_time_lock: {
        Args: {
          _break_end_time: string
          _break_start_time: string
          _check_in_time: string
          _check_out_time: string
          _id: string
          _notes: string
          _total_break_minutes: number
          _working_hours: number
        }
        Returns: boolean
      }
      attendance_logs_self_update_check: {
        Args: {
          _approved_by: string
          _approved_by_name: string
          _check_in_time: string
          _check_out_time: string
          _corrected_at: string
          _corrected_by: string
          _id: string
          _reconciliation_status: string
          _status: string
          _working_hours: number
        }
        Returns: boolean
      }
      attribute_website_order: {
        Args: {
          p_evidence?: Json
          p_order_id: string
          p_reason: string
          p_reason_custom?: string
          p_sales_person_id: string
        }
        Returns: undefined
      }
      audit_gmail_integrations_grants: {
        Args: never
        Returns: {
          check_name: string
          detail: string
          ok: boolean
        }[]
      }
      auto_assign_woo_leads: { Args: never; Returns: number }
      available_website_lead_assignees: {
        Args: never
        Returns: {
          uid: string
          uname: string
        }[]
      }
      bulk_delete_companies: {
        Args: { _ids: string[]; _unlink_first?: boolean }
        Returns: Json
      }
      bulk_update_portal_ticket_status: {
        Args: { _status: string; _ticket_ids: string[] }
        Returns: number
      }
      bump_notification_rate: {
        Args: { _delta?: number; _provider: string }
        Returns: undefined
      }
      can_access_ticket_attachment: {
        Args: { _name: string; _user_id: string }
        Returns: boolean
      }
      can_attribute_website_order: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_create_admin: { Args: never; Returns: boolean }
      can_mark_website_payment: { Args: { _user_id: string }; Returns: boolean }
      can_refresh_order_price: { Args: { _user_id: string }; Returns: boolean }
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
      check_device_trust:
        | {
            Args: { p_device_hash: string; p_user_id: string }
            Returns: boolean
          }
        | {
            Args: {
              p_device_fingerprint?: string
              p_device_hash: string
              p_user_id: string
            }
            Returns: boolean
          }
      check_device_trust_v2: {
        Args: {
          p_device_hash: string
          p_dynamic_fingerprint?: string
          p_stable_fingerprint?: string
          p_user_id: string
        }
        Returns: string
      }
      check_login_rate_limit: {
        Args: { p_email: string }
        Returns: {
          allowed: boolean
          recent_failures: number
          retry_after_seconds: number
        }[]
      }
      check_rate_limit: {
        Args: { p_key: string; p_max_requests?: number; p_window_ms?: number }
        Returns: boolean
      }
      claim_compoff_credit: {
        Args: {
          p_earned_date: string
          p_earned_type: string
          p_holiday_id?: string
        }
        Returns: string
      }
      claim_pending_email_leads: {
        Args: { p_batch_size?: number; p_specific_lead_id?: string }
        Returns: {
          ai_confidence: number | null
          ai_extracted_json: Json | null
          ai_processed: boolean
          assigned_to: string | null
          assigned_to_name: string | null
          body_html: string | null
          body_text: string | null
          city: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          customer_company: string | null
          customer_name: string
          customer_type: string | null
          disposition: Database["public"]["Enums"]["lead_disposition"]
          disposition_at: string | null
          disposition_by: string | null
          disposition_by_name: string | null
          disposition_reason_code: string | null
          disposition_reason_note: string | null
          email: string | null
          email_lead_id: string | null
          error_message: string | null
          id: string
          ingested_at: string | null
          is_a_category: boolean | null
          is_enquiry_converted: boolean
          is_prospect: boolean | null
          last_error: string | null
          lead_source: string | null
          mail_source: string
          notes: string | null
          phone_number: string | null
          processed_at: string | null
          processing_status: string
          product_category: string | null
          product_code: string | null
          product_name: string | null
          purpose_of_purchase: string | null
          quantity: number | null
          requested_timeline: string | null
          retry_count: number
          sales_person_id: string | null
          sales_person_name: string | null
          status: string | null
          subject: string | null
          thread_id: string | null
          updated_at: string
          updated_by: string | null
          urgency: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "email_leads"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pending_notifications: {
        Args: { _channel?: string; _limit?: number; _worker_id: string }
        Returns: {
          channel: string
          created_at: string
          dlq_moved: boolean
          error_message: string | null
          id: string
          last_attempt_at: string | null
          latency_ms: number | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          order_number: string | null
          order_ref: string
          order_source: string
          payload: Json
          phone: string | null
          priority: number
          provider: string | null
          provider_message_id: string | null
          provider_response: Json | null
          provider_status_code: number | null
          retry_count: number
          sent_at: string | null
          status: Database["public"]["Enums"]["order_notification_status"]
          status_log_id: string | null
          status_trigger: string
          template_id: string | null
          template_name: string
          updated_at: string
          woo_order_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "order_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_expired_devices: { Args: never; Returns: undefined }
      cleanup_rate_limit_buckets: { Args: never; Returns: undefined }
      clear_false_positive_confirmation_flags: {
        Args: { p_triggered_by?: string }
        Returns: string
      }
      clear_order_confirmation_flag_manual: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      compute_contact_key: {
        Args: { _email: string; _phone: string }
        Returns: string
      }
      compute_notification_health: {
        Args: never
        Returns: {
          attempts_5m: number
          failed_5m: number
          failure_rate: number
          is_degraded: boolean
          pending_backlog: number
        }[]
      }
      confirm_my_order: {
        Args: { p_order_id: string }
        Returns: {
          confirmation_status: string
          confirmed_at: string
          ok: boolean
          order_id: string
        }[]
      }
      count_admins: { Args: never; Returns: number }
      create_order_escalation_notification: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      create_security_alert: {
        Args: {
          p_alert_type: string
          p_details?: Json
          p_severity?: string
          p_user_id: string
        }
        Returns: string
      }
      credit_monthly_el: {
        Args: { p_credit_amount?: number; p_month: number; p_year: number }
        Returns: Json
      }
      current_portal_contact_can_manage: {
        Args: { _account_id: string }
        Returns: boolean
      }
      decide_attribution_request: {
        Args: { p_approve: boolean; p_note?: string; p_request_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      employees_self_update_check: {
        Args: {
          _bank_account: string
          _department: string
          _designation: string
          _employee_number: string
          _employee_type: string
          _employment_status: Database["public"]["Enums"]["employment_status"]
          _exit_date: string
          _id: string
          _ifsc_code: string
          _is_active: boolean
          _joining_date: string
          _manager_id: string
          _monthly_salary: number
          _pan_number: string
          _role: string
          _shift_end_time: string
          _shift_start_time: string
          _shift_type: string
          _tax_regime: string
          _xboom_email: string
        }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_order_notification: {
        Args: {
          _channel?: string
          _event_type: string
          _order_number: string
          _payload: Json
          _phone: string
          _woo_order_id: string
        }
        Returns: string
      }
      enqueue_order_notification_v2: {
        Args: {
          _channel?: string
          _event_type: string
          _order_number: string
          _order_ref: string
          _order_source: string
          _payload: Json
          _phone: string
        }
        Returns: string
      }
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
          webhook_topic: string
        }[]
      }
      find_claimable_website_order: {
        Args: { p_query: string }
        Returns: {
          customer_name_masked: string
          order_date: string
          order_id: string
          order_number: string
          product_name: string
          total: number
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
      find_duplicate_orders: {
        Args: {
          p_customer_name: string
          p_customer_phone: string
          p_order_date: string
          p_product_code: string
          p_product_name: string
          p_total: number
        }
        Returns: {
          amount_diff_pct: number
          created_at: string
          customer_name: string
          customer_phone: string
          days_apart: number
          external_id: string
          id: string
          match_reasons: string[]
          order_date: string
          order_number: string
          product_name: string
          sales_person_name: string
          source: string
          total_sales_amount: number
        }[]
      }
      find_or_create_company:
        | { Args: { _name: string; _owner: string }; Returns: string }
        | { Args: { p_name: string }; Returns: string }
      flash_my_birthday: { Args: never; Returns: boolean }
      generate_payment_reminders: { Args: never; Returns: undefined }
      generate_salary_sheets: { Args: never; Returns: undefined }
      get_all_company_followups: {
        Args: never
        Returns: {
          company_id: string
          completed_at: string
          completed_by: string
          completed_by_name: string
          created_at: string
          created_by: string
          created_by_name: string
          customer_company: string
          customer_name: string
          email: string
          followup_at: string
          id: string
          is_a_category: boolean
          phone: string
          product_name: string
          remark: string
          reminder_sent: boolean
          source_id: string
          source_type: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      get_company_followups: {
        Args: { _company_id: string }
        Returns: {
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          created_at: string
          created_by: string
          created_by_name: string
          customer_company: string | null
          customer_name: string
          email: string | null
          followup_at: string
          id: string
          is_a_category: boolean | null
          phone: string | null
          product_name: string | null
          remark: string | null
          reminder_sent: boolean | null
          source_id: string
          source_type: string
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "followups"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_compoff_balance: { Args: { _employee_id: string }; Returns: number }
      get_cron_secret: { Args: never; Returns: string }
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
      get_employees_on_leave_today: {
        Args: never
        Returns: {
          department: string
          designation: string
          employee_id: string
          employee_name: string
          end_date: string
          is_half_day: boolean
          leave_type: string
          start_date: string
        }[]
      }
      get_gmail_integrations_safe: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_synced_at: string
          token_expiry: string
          updated_at: string
          user_id: string
        }[]
      }
      get_gmail_integrations_status: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_synced_at: string
          updated_at: string
          user_id: string
        }[]
      }
      get_kyc_aadhaar_full: { Args: { _account_id: string }; Returns: string }
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
      get_my_confirmable_orders: {
        Args: never
        Returns: {
          confirmation_status: string
          confirmed_at: string
          order_date: string
          order_id: string
          order_number: string
          product_name: string
          total_sales_amount: number
        }[]
      }
      get_my_portal_account_id: { Args: never; Returns: string }
      get_my_portal_team_with_auth_login: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
          invited_at: string
          is_active: boolean
          last_login_at: string
          role: string
        }[]
      }
      get_my_purchases: {
        Args: never
        Returns: {
          actual_delivery: string
          confirmation_status: string
          courier_name: string
          order_date: string
          order_id: string
          order_number: string
          product_name: string
          quantity: number
          status: string
          total_sales_amount: number
          tracking_number: string
          tracking_url: string
        }[]
      }
      get_next_birthday: {
        Args: never
        Returns: {
          avatar_url: string
          birth_day: number
          birth_month: number
          days_until: number
          department: string
          employee_id: string
          is_flashed: boolean
          is_owner: boolean
          is_today: boolean
          name: string
        }[]
      }
      get_next_proforma_number: { Args: never; Returns: string }
      get_or_create_dm_thread: { Args: { other_user: string }; Returns: string }
      get_order_activity_timeline: {
        Args: { p_order_id: string }
        Returns: {
          action: string
          actor: string
          details: string
          event_id: string
          event_type: string
          occurred_at: string
        }[]
      }
      get_order_confirmation_details: {
        Args: { p_order_id: string }
        Returns: {
          confirmation_status: string
          confirmed_at: string
          contact_email: string
          contact_name: string
        }[]
      }
      get_order_profits:
        | {
            Args: { p_order_ids: string[] }
            Returns: {
              order_id: string
              profit: number
              total_cost: number
              total_sales: number
            }[]
          }
        | {
            Args: { p_include_website?: boolean; p_order_ids: string[] }
            Returns: {
              order_id: string
              profit: number
              total_cost: number
              total_sales: number
            }[]
          }
      get_orders_kyc_status: {
        Args: { p_order_ids: string[] }
        Returns: {
          has_portal_account: boolean
          kyc_status: string
          order_id: string
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
      get_portal_contacts_with_auth_login: {
        Args: never
        Returns: {
          account_id: string
          auth_user_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          invited_at: string
          is_active: boolean
          last_login_at: string
          phone: string
          role: string
          whatsapp_number: string
        }[]
      }
      get_sales_leaderboard:
        | {
            Args: { end_date?: string; start_date?: string }
            Returns: {
              leads_handled: number
              orders_won: number
              pipeline_created: number
              rank: number
              total_order_value: number
              total_pipeline_value: number
              total_points: number
              user_id: string
              user_name: string
            }[]
          }
        | {
            Args: {
              end_date?: string
              p_include_website?: boolean
              start_date?: string
            }
            Returns: {
              leads_handled: number
              orders_won: number
              pipeline_created: number
              rank: number
              total_order_value: number
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
      get_suppliers_safe: {
        Args: never
        Returns: {
          address: string
          bank_account_holder: string
          bank_account_number: string
          bank_ifsc: string
          bank_name: string
          brand_name: string
          city: string
          contact_name: string
          created_at: string
          created_by: string
          email: string
          gst_number: string
          id: string
          is_active: boolean
          mobile: string
          name: string
          notes: string
          phone: string
          preference: string
          product_category: string
          products: string
          status: string
          updated_at: string
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
      get_website_order_attribution: {
        Args: { p_external_id?: string; p_internal_order_id?: string }
        Returns: {
          attributed_at: string
          attributed_by_name: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          external_id: string
          id: string
          order_date: string
          order_number: string
          sales_attribution_locked: boolean
          sales_attribution_reason: string
          sales_attribution_reason_custom: string
          sales_person_id: string
          sales_person_name: string
          total_sales_amount: number
        }[]
      }
      get_zoho_connection_status: {
        Args: { p_provider?: string }
        Returns: {
          api_domain: string
          connected: boolean
          connected_at: string
          connected_by: string
          expires_at: string
          organization_id: string
          scope: string
        }[]
      }
      has_form_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_outbound_access: { Args: { _user: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_session_version: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      infer_industry_from_name: { Args: { p_name: string }; Returns: string }
      invoke_elevenlabs_kb_refresh: { Args: never; Returns: number }
      invoke_send_birthday_cards: { Args: never; Returns: number }
      invoke_send_order_sms_msg91: { Args: never; Returns: number }
      invoke_woocommerce_orders_reconcile: { Args: never; Returns: number }
      invoke_woocommerce_products_backfill: { Args: never; Returns: number }
      is_birthday_today: { Args: { p_employee_id: string }; Returns: boolean }
      is_component_category: { Args: { cat: string }; Returns: boolean }
      is_digilocker_kyc_visible: { Args: never; Returns: boolean }
      is_drone_category: { Args: { cat: string }; Returns: boolean }
      is_drone_product: {
        Args: { p_category: string; p_name: string }
        Returns: boolean
      }
      is_hr_or_admin: { Args: { _user_id: string }; Returns: boolean }
      is_internal_directory_viewer: {
        Args: { _user_id: string }
        Returns: boolean
      }
      is_internal_staff: { Args: { p_user_id: string }; Returns: boolean }
      is_kyc_reviewer: { Args: { _uid: string }; Returns: boolean }
      is_reporting_manager: {
        Args: { _employee_id: string; _manager_id: string }
        Returns: boolean
      }
      is_user_approved: { Args: { _user_id: string }; Returns: boolean }
      is_user_available_on: {
        Args: { _on?: string; _user_id: string }
        Returns: boolean
      }
      is_valid_repair_stage_transition: {
        Args: {
          _from: Database["public"]["Enums"]["repair_stage"]
          _to: Database["public"]["Enums"]["repair_stage"]
        }
        Returns: boolean
      }
      lead_company_coverage: {
        Args: never
        Returns: {
          bad_placeholder: number
          source: string
          total: number
          with_company: number
        }[]
      }
      leave_request_self_update_check: {
        Args: {
          _approved_rejected_at: string
          _approver_id: string
          _approver_name: string
          _id: string
          _is_hr_applied: boolean
          _status: string
        }
        Returns: boolean
      }
      link_compoff_to_leave: {
        Args: { p_leave_id: string; p_ledger_id: string }
        Returns: undefined
      }
      link_zoho_invoice_manual: {
        Args: { p_invoice_id: string; p_order_id: string }
        Returns: undefined
      }
      list_pending_compoff_credits: {
        Args: {
          p_expiry_filter?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_sort_by?: string
          p_sort_dir?: string
          p_worked_from?: string
          p_worked_to?: string
        }
        Returns: {
          created_at: string
          earned_date: string
          earned_type: string
          employee_id: string
          employee_name: string
          expires_at: string
          holiday_name: string
          id: string
          total_count: number
        }[]
      }
      list_portal_ticket_inbox: {
        Args: never
        Returns: {
          account_id: string
          assigned_to: string
          category: string
          company_name: string
          created_at: string
          customer_email: string
          first_response_at: string
          id: string
          item_summary: string
          last_message_at: string
          last_message_by_customer: boolean
          priority: string
          related_order_id: string
          related_order_number: string
          related_product_name: string
          resolved_at: string
          sla_first_response_due_at: string
          sla_resolution_due_at: string
          status: string
          subject: string
          ticket_number: string
          ticket_type: string
          unread_customer_count: number
          updated_at: string
        }[]
      }
      list_resume_access_failures: {
        Args: {
          _actor_role?: Database["public"]["Enums"]["app_role"]
          _from?: string
          _limit?: number
          _referral_id?: string
          _to?: string
        }
        Returns: {
          actor_role: Database["public"]["Enums"]["app_role"]
          actor_user_id: string
          created_at: string
          document_path: string
          error_message: string
          id: string
          reason: Database["public"]["Enums"]["resume_access_failure_reason"]
          referral_id: string
          source: string
          user_agent: string
        }[]
      }
      list_sales_attribution_candidates: {
        Args: never
        Returns: {
          email: string
          name: string
          role: string
          user_id: string
        }[]
      }
      log_company_activity: {
        Args: {
          _amount?: number
          _company_id: string
          _description?: string
          _metadata?: Json
          _occurred_at?: string
          _reference_id?: string
          _reference_table?: string
          _source: string
          _title: string
          _type: string
        }
        Returns: string
      }
      log_resume_access_failure:
        | {
            Args: {
              _actor_user_id: string
              _document_path: string
              _error_message: string
              _reason: Database["public"]["Enums"]["resume_access_failure_reason"]
              _referral_id: string
              _source: string
              _user_agent: string
            }
            Returns: string
          }
        | {
            Args: {
              _actor_user_id: string
              _document_path: string
              _error_message: string
              _error_slug?: string
              _http_status?: number
              _keyword_matched?: boolean
              _reason: Database["public"]["Enums"]["resume_access_failure_reason"]
              _referral_id: string
              _source: string
              _user_agent: string
            }
            Returns: string
          }
      log_resume_access_retry: {
        Args: {
          _document_path: string
          _referral_id: string
          _retry_of_failure_id: string
          _source: string
          _user_agent: string
        }
        Returns: string
      }
      mark_enquiry_messages_read: {
        Args: { p_enquiry_id: string }
        Returns: number
      }
      mark_old_woo_leads_as_lost: { Args: never; Returns: number }
      mark_portal_tickets_read: {
        Args: { _ticket_ids: string[] }
        Returns: number
      }
      mark_website_order_paid: {
        Args: { _woo_order_id: string }
        Returns: {
          actual_delivery: string | null
          additional_details: string | null
          amount_paid: number | null
          attributed_at: string | null
          attributed_by: string | null
          attributed_by_name: string | null
          billing_address: string | null
          campaign_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          committed_timeline: string | null
          company_id: string | null
          confirmation_source: string | null
          confirmation_status: string
          confirmed_at: string | null
          confirmed_by_contact: string | null
          courier_name: string | null
          created_at: string
          created_by: string
          customer_company: string | null
          customer_email: string | null
          customer_gst: string | null
          customer_name: string
          customer_notes: string | null
          customer_phone: string | null
          customer_type: string | null
          delete_reason: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_name: string | null
          delivery_charges: number | null
          delivery_mode: string | null
          delivery_proof_reject_reason: string | null
          delivery_proof_reviewed_at: string | null
          delivery_proof_reviewed_by: string | null
          delivery_proof_status: string | null
          delivery_proof_uploaded_at: string | null
          delivery_proof_uploaded_by: string | null
          delivery_proof_url: string | null
          discount_amount: number | null
          dispatched_on: string | null
          enquiry_id: string | null
          escalated_at: string | null
          escalated_by: string | null
          escalation_reason: string | null
          estimated_delivery: string | null
          estimated_procurement_rate: number | null
          external_id: string | null
          has_voided_zoho_invoice: boolean
          id: string
          internal_notes: string | null
          invoice_number: string | null
          invoice_url: string | null
          is_escalated: boolean
          is_refund_requested: boolean
          is_rto: boolean
          last_reminder_sent_at: string | null
          lead_source: string | null
          lost_reason: string | null
          lost_reason_notes: string | null
          manual_overrides: string[]
          order_date: string | null
          order_number: string | null
          order_outcome: string | null
          order_type: string | null
          outcome_updated_at: string | null
          outcome_updated_by: string | null
          payment_due_date: string | null
          payment_status: string | null
          payment_terms: string | null
          po_number: string | null
          po_url: string | null
          priority: number | null
          procurement_currency: string | null
          procurement_date: string | null
          procurement_edited: boolean
          procurement_rate: number | null
          product_category: string | null
          product_code: string
          product_name: string
          quantity: number
          refund_reason: string | null
          refund_requested_at: string | null
          refund_requested_by: string | null
          refund_status: string | null
          requires_confirmation: boolean
          rto_marked_at: string | null
          rto_marked_by: string | null
          sales_attribution_locked: boolean
          sales_attribution_reason: string | null
          sales_attribution_reason_custom: string | null
          sales_notes: string | null
          sales_person_id: string
          sales_person_name: string
          selling_price: number | null
          shipping_address: string | null
          source: string
          source_pipeline_id: string | null
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
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_zoho_invoices_to_orders: { Args: never; Returns: Json }
      move_notification_to_dlq: {
        Args: { _notification_id: string }
        Returns: string
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      needs_step_up_auth: { Args: { p_user_id: string }; Returns: boolean }
      normalize_company_name: { Args: { p_name: string }; Returns: string }
      normalize_phone: { Args: { _raw: string }; Returns: string }
      nudge_enquiry: {
        Args: { p_enquiry_id: string }
        Returns: {
          created_at: string
          enquiry_id: string
          id: string
          is_initial: boolean
          is_nudge: boolean
          is_quote_mirror: boolean
          is_read: boolean
          message: string
          sender_id: string
          sender_name: string
          sender_role: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "enquiry_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      order_has_drone: { Args: { p_order_id: string }; Returns: boolean }
      profiles_self_update_identity_lock: { Args: never; Returns: boolean }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recompute_company_health: {
        Args: { _company_id: string }
        Returns: undefined
      }
      recompute_company_tiers: { Args: never; Returns: undefined }
      record_login_attempt: {
        Args: {
          p_email: string
          p_failure_reason?: string
          p_status: string
          p_user_id?: string
        }
        Returns: undefined
      }
      record_touchpoint: {
        Args: {
          _assigned_to: string
          _assigned_to_name: string
          _email: string
          _name: string
          _occurred_at: string
          _phone: string
          _raw: Json
          _source: string
          _source_row_id: string
          _status: string
          _summary: string
        }
        Returns: undefined
      }
      refresh_all_company_engagement_stages: { Args: never; Returns: number }
      refresh_company_engagement_stage: {
        Args: { _company_id: string }
        Returns: undefined
      }
      refresh_order_price_from_pricelist: {
        Args: { p_order_id: string }
        Returns: Json
      }
      register_trusted_device:
        | {
            Args: {
              p_days?: number
              p_device_hash: string
              p_device_name?: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_days?: number
              p_device_fingerprint?: string
              p_device_hash: string
              p_device_name?: string
              p_user_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_days?: number
              p_device_fingerprint?: string
              p_device_hash: string
              p_device_name?: string
              p_dynamic_fingerprint?: string
              p_stable_fingerprint?: string
              p_user_id: string
            }
            Returns: string
          }
      reject_compoff_credit: {
        Args: { p_ledger_id: string; p_reason: string }
        Returns: boolean
      }
      reject_compoff_credits_bulk: {
        Args: { p_ledger_ids: string[]; p_reason: string }
        Returns: {
          error: string
          ledger_id: string
          ok: boolean
        }[]
      }
      reject_delivery_proof: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      relink_companies: {
        Args: { _source_ids: string[]; _target_id: string }
        Returns: Json
      }
      request_website_order_attribution: {
        Args: {
          p_evidence?: Json
          p_order_id: string
          p_reason: string
          p_reason_custom?: string
        }
        Returns: string
      }
      resolve_agent_user: {
        Args: { _agent_id: string; _agent_phone: string; _provider: string }
        Returns: string
      }
      retry_notification_from_dlq: {
        Args: { _dlq_id: string }
        Returns: string
      }
      sales_faq_self_update_check: {
        Args: {
          _answered_at: string
          _answered_by: string
          _answered_by_name: string
          _approved_at: string
          _approved_by: string
          _approved_by_name: string
          _id: string
          _is_approved: boolean
          _is_pinned: boolean
        }
        Returns: boolean
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      scan_company_field_quality: { Args: never; Returns: number }
      scan_suspect_companies: {
        Args: never
        Returns: {
          activities_count: number
          contacts_count: number
          created_at: string
          created_by_name: string
          id: string
          name: string
          orders_count: number
          pipeline_count: number
          prospects_count: number
          reason: string
          total_orders_count: number
        }[]
      }
      set_lead_disposition: {
        Args: {
          _new_disposition: Database["public"]["Enums"]["lead_disposition"]
          _reason_code: string
          _reason_note: string
          _source_row_id: string
          _source_table: string
        }
        Returns: undefined
      }
      settle_compoff_leave_decision: {
        Args: { p_approve: boolean; p_comment?: string; p_leave_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_delivery_proof: {
        Args: { p_order_id: string; p_url: string }
        Returns: undefined
      }
      sync_profiles_to_employees: { Args: never; Returns: number }
      touch_portal_last_login: { Args: never; Returns: undefined }
      trip_notification_breaker: {
        Args: { _minutes?: number; _reason: string }
        Returns: undefined
      }
      unlink_zoho_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      update_mfa_verified_at: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_mfa_verified_at_to_null: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_pricelist_categories_bulk: {
        Args: { p_items: Json; p_reason?: string }
        Returns: {
          missing: number
          unchanged: number
          updated: number
        }[]
      }
      update_repair_stage: {
        Args: {
          _cancellation_reason?: string
          _new_stage: Database["public"]["Enums"]["repair_stage"]
          _notes?: string
          _repair_id: string
        }
        Returns: {
          advance_amount: number | null
          assigned_technician_id: string | null
          assigned_technician_name: string | null
          balance_amount: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
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
          duplicate_source_lead_ids: Json
          email: string | null
          id: string
          inspection_charges: number | null
          intake_payload: Json | null
          issue_details: string | null
          issue_type: Database["public"]["Enums"]["repair_issue_type"]
          item_received_at: string | null
          model_name: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["repair_payment_status"]
          profit: number | null
          quote_accepted_at: string | null
          quote_sent_at: string | null
          repair_cost_charged: number | null
          repair_number: string | null
          repair_stage: Database["public"]["Enums"]["repair_stage"]
          source_lead_id: number | null
          total_component_cost: number | null
          total_quote_amount: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "repairs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_woo_lead_status: {
        Args: { p_new_status: string; p_order_id: string }
        Returns: {
          amount_paid: number | null
          assigned_at: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          courier: string | null
          created_at: string
          currency: string | null
          customer_company: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          expected_delivery: string | null
          financial_status: string | null
          fulfillment_status: string | null
          id: string
          internal_notes: string | null
          is_lost_lead: boolean
          line_items: Json | null
          lost_lead_at: string | null
          lost_lead_reason: string | null
          order_number: string | null
          order_status: string | null
          payment_status: string | null
          product_category: string | null
          product_code: string | null
          product_name: string
          quantity: number
          raw_data: Json | null
          sales_notes: string | null
          selling_price: number | null
          shipping_address: string | null
          source: string
          total_sales_amount: number | null
          tracking_number: string | null
          tracking_status: string | null
          updated_at: string
          woo_created_at: string | null
          woo_order_id: string
          woo_updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "woocommerce_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_admin_registration: {
        Args: { p_email: string }
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
      zoho_reconciliation_stats: { Args: never; Returns: Json }
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
        | "sales_manager"
        | "b2b_customer"
        | "support"
      application_source:
        | "Referral"
        | "Naukri"
        | "LinkedIn"
        | "Website"
        | "Consultant"
        | "Walk-in"
        | "Other"
        | "Internshala"
        | "Indeed"
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
      employment_status: "active" | "probation" | "resigned" | "terminated"
      employment_type: "Full-time" | "Contract" | "Intern"
      final_status: "Selected" | "Rejected" | "Pending"
      holiday_type:
        | "national"
        | "regional"
        | "company"
        | "religious"
        | "restricted"
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
      kpi_source: "hr" | "employee"
      kpi_workflow_status: "draft" | "active" | "completed" | "reviewed"
      kyc_doc_type:
        | "aadhaar"
        | "pan"
        | "gst"
        | "business_registration"
        | "address_proof"
        | "driving_license"
        | "voter_id"
        | "passport"
        | "rental_agreement"
        | "other_gov_id"
      kyc_status:
        | "not_submitted"
        | "pending_verification"
        | "approved"
        | "rejected"
        | "resubmission_required"
      lead_disposition: "untouched" | "prospect" | "qualified" | "not_qualified"
      notice_visibility:
        | "all"
        | "sales"
        | "supply_chain"
        | "finance"
        | "admin"
        | "it"
        | "marketing"
        | "hr"
      order_notification_status: "pending" | "sent" | "failed"
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
      repair_stage:
        | "pending_receipt"
        | "received"
        | "diagnosing"
        | "quoted"
        | "in_repair"
        | "ready_for_pickup"
        | "delivered"
        | "cancelled"
        | "returned_unrepaired"
      resume_access_failure_reason:
        | "missing_path"
        | "unsupported_format"
        | "not_found"
        | "forbidden"
        | "unknown"
      salary_sheet_status:
        | "draft"
        | "locked"
        | "hr_approved"
        | "finance_approved"
      screening_status: "New" | "Shortlisted" | "Rejected" | "On Hold"
      security_finding_status: "open" | "fixed" | "ignored" | "wontfix"
      shopify_processing_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
      spare_part_change_reason:
        | "PURCHASE"
        | "SALE"
        | "DAMAGE"
        | "MANUAL_ADJUSTMENT"
      spare_part_change_type: "ADD" | "REMOVE"
      spare_part_stock_status: "IN_STOCK" | "LOW_STOCK" | "SOLD_OUT"
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
        | "removed"
      training_category: "drone_ops" | "software_usage" | "both" | "das" | "ras"
      training_payment_status: "pending" | "partial" | "paid"
      training_status: "requested" | "pending" | "done"
      training_type: "demo" | "training"
      unavailability_reason:
        | "vacation"
        | "sick_leave"
        | "training"
        | "official_travel"
        | "personal"
        | "other"
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
        "sales_manager",
        "b2b_customer",
        "support",
      ],
      application_source: [
        "Referral",
        "Naukri",
        "LinkedIn",
        "Website",
        "Consultant",
        "Walk-in",
        "Other",
        "Internshala",
        "Indeed",
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
      employment_status: ["active", "probation", "resigned", "terminated"],
      employment_type: ["Full-time", "Contract", "Intern"],
      final_status: ["Selected", "Rejected", "Pending"],
      holiday_type: [
        "national",
        "regional",
        "company",
        "religious",
        "restricted",
      ],
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
      kpi_source: ["hr", "employee"],
      kpi_workflow_status: ["draft", "active", "completed", "reviewed"],
      kyc_doc_type: [
        "aadhaar",
        "pan",
        "gst",
        "business_registration",
        "address_proof",
        "driving_license",
        "voter_id",
        "passport",
        "rental_agreement",
        "other_gov_id",
      ],
      kyc_status: [
        "not_submitted",
        "pending_verification",
        "approved",
        "rejected",
        "resubmission_required",
      ],
      lead_disposition: ["untouched", "prospect", "qualified", "not_qualified"],
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
      order_notification_status: ["pending", "sent", "failed"],
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
      repair_stage: [
        "pending_receipt",
        "received",
        "diagnosing",
        "quoted",
        "in_repair",
        "ready_for_pickup",
        "delivered",
        "cancelled",
        "returned_unrepaired",
      ],
      resume_access_failure_reason: [
        "missing_path",
        "unsupported_format",
        "not_found",
        "forbidden",
        "unknown",
      ],
      salary_sheet_status: [
        "draft",
        "locked",
        "hr_approved",
        "finance_approved",
      ],
      screening_status: ["New", "Shortlisted", "Rejected", "On Hold"],
      security_finding_status: ["open", "fixed", "ignored", "wontfix"],
      shopify_processing_status: [
        "pending",
        "processing",
        "completed",
        "failed",
      ],
      spare_part_change_reason: [
        "PURCHASE",
        "SALE",
        "DAMAGE",
        "MANUAL_ADJUSTMENT",
      ],
      spare_part_change_type: ["ADD", "REMOVE"],
      spare_part_stock_status: ["IN_STOCK", "LOW_STOCK", "SOLD_OUT"],
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
        "removed",
      ],
      training_category: ["drone_ops", "software_usage", "both", "das", "ras"],
      training_payment_status: ["pending", "partial", "paid"],
      training_status: ["requested", "pending", "done"],
      training_type: ["demo", "training"],
      unavailability_reason: [
        "vacation",
        "sick_leave",
        "training",
        "official_travel",
        "personal",
        "other",
      ],
    },
  },
} as const
