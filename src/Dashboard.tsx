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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          created_at: string
          date: string
          doctor_name: string | null
          id: string
          notes: string | null
          patient_id: string
          status: string
          time_slot: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          doctor_name?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          status?: string
          time_slot?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          doctor_name?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          status?: string
          time_slot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      beds: {
        Row: {
          bed_number: string
          bed_type: string
          id: string
          patient_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bed_number: string
          bed_type: string
          id?: string
          patient_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bed_number?: string
          bed_type?: string
          id?: string
          patient_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beds_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      billing: {
        Row: {
          amount: number
          amount_paid: number
          created_at: string
          id: string
          invoice_pdf_url: string | null
          patient_id: string
          payment_mode: string | null
          service: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          amount_paid?: number
          created_at?: string
          id?: string
          invoice_pdf_url?: string | null
          patient_id: string
          payment_mode?: string | null
          service: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_paid?: number
          created_at?: string
          id?: string
          invoice_pdf_url?: string | null
          patient_id?: string
          payment_mode?: string | null
          service?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_records_log: {
        Row: {
          deleted_at: string
          deleted_by: string
          id: string
          record_data: Json
          record_id: string
          table_name: string
        }
        Insert: {
          deleted_at?: string
          deleted_by: string
          id?: string
          record_data: Json
          record_id: string
          table_name: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string
          id?: string
          record_data?: Json
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      fracture_cases: {
        Row: {
          body_part: string | null
          cause: string | null
          created_at: string
          doctor_name: string | null
          doctor_notes: string | null
          followup_days: number
          fracture_type: string | null
          hospital_name: string | null
          id: string
          next_followup_date: string | null
          patient_id: string
          patient_type: string
          plaster_date: string | null
          plaster_status: string
          plaster_type: string | null
          referral_reason: string | null
          side: string | null
          updated_at: string
        }
        Insert: {
          body_part?: string | null
          cause?: string | null
          created_at?: string
          doctor_name?: string | null
          doctor_notes?: string | null
          followup_days?: number
          fracture_type?: string | null
          hospital_name?: string | null
          id?: string
          next_followup_date?: string | null
          patient_id: string
          patient_type?: string
          plaster_date?: string | null
          plaster_status?: string
          plaster_type?: string | null
          referral_reason?: string | null
          side?: string | null
          updated_at?: string
        }
        Update: {
          body_part?: string | null
          cause?: string | null
          created_at?: string
          doctor_name?: string | null
          doctor_notes?: string | null
          followup_days?: number
          fracture_type?: string | null
          hospital_name?: string | null
          id?: string
          next_followup_date?: string | null
          patient_id?: string
          patient_type?: string
          plaster_date?: string | null
          plaster_status?: string
          plaster_type?: string | null
          referral_reason?: string | null
          side?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fracture_cases_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      fracture_xrays: {
        Row: {
          created_at: string
          file_url: string
          fracture_case_id: string
          id: string
          image_date: string
          patient_id: string
        }
        Insert: {
          created_at?: string
          file_url: string
          fracture_case_id: string
          id?: string
          image_date?: string
          patient_id: string
        }
        Update: {
          created_at?: string
          file_url?: string
          fracture_case_id?: string
          id?: string
          image_date?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fracture_xrays_case_id_fkey"
            columns: ["fracture_case_id"]
            isOneToOne: false
            referencedRelation: "fracture_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fracture_xrays_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          created_at: string
          doctor_name: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          doctor_name?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          doctor_name?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      invoice_medicine_mapping: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          medicine_id: string | null
          medicine_name: string
          rate: number
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          medicine_id?: string | null
          medicine_name: string
          rate?: number
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          medicine_id?: string | null
          medicine_name?: string
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_medicine_mapping_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "medicine_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_medicine_mapping_medicine_id_fkey"
            columns: ["medicine_id"]
            isOneToOne: false
            referencedRelation: "medicines"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_history: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          patient_id: string
          visit_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          patient_id: string
          visit_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_entries: {
        Row: {
          commission: number
          created_at: string
          date: string
          id: string
          invoice_no: string
          patient_name: string
          total_amount: number
        }
        Insert: {
          commission?: number
          created_at?: string
          date?: string
          id?: string
          invoice_no: string
          patient_name: string
          total_amount?: number
        }
        Update: {
          commission?: number
          created_at?: string
          date?: string
          id?: string
          invoice_no?: string
          patient_name?: string
          total_amount?: number
        }
        Relationships: []
      }
      medicines: {
        Row: {
          created_at: string
          id: string
          name: string
          rate: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rate?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rate?: number
        }
        Relationships: []
      }
      patients: {
        Row: {
          address: string | null
          age: number | null
          created_at: string
          gender: string | null
          id: string
          mobile: string | null
          name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          age?: number | null
          created_at?: string
          gender?: string | null
          id?: string
          mobile?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          age?: number | null
          created_at?: string
          gender?: string | null
          id?: string
          mobile?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_paid: number
          billing_id: string
          id: string
          payment_date: string
        }
        Insert: {
          amount_paid: number
          billing_id: string
          id?: string
          payment_date?: string
        }
        Update: {
          amount_paid?: number
          billing_id?: string
          id?: string
          payment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_billing_id_fkey"
            columns: ["billing_id"]
            isOneToOne: false
            referencedRelation: "billing"
            referencedColumns: ["id"]
          },
        ]
      }
      physiotherapy_sessions: {
        Row: {
          created_at: string
          exercise_plan: string | null
          id: string
          pain_scale: number | null
          patient_id: string
          progress_notes: string | null
          session_number: number
          total_sessions: number
        }
        Insert: {
          created_at?: string
          exercise_plan?: string | null
          id?: string
          pain_scale?: number | null
          patient_id: string
          progress_notes?: string | null
          session_number?: number
          total_sessions?: number
        }
        Update: {
          created_at?: string
          exercise_plan?: string | null
          id?: string
          pain_scale?: number | null
          patient_id?: string
          progress_notes?: string | null
          session_number?: number
          total_sessions?: number
        }
        Relationships: [
          {
            foreignKeyName: "physiotherapy_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          advice: string | null
          created_at: string
          diagnosis: string | null
          followup_date: string | null
          id: string
          medicines: string | null
          patient_id: string
        }
        Insert: {
          advice?: string | null
          created_at?: string
          diagnosis?: string | null
          followup_date?: string | null
          id?: string
          medicines?: string | null
          patient_id: string
        }
        Update: {
          advice?: string | null
          created_at?: string
          diagnosis?: string | null
          followup_date?: string | null
          id?: string
          medicines?: string | null
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      report_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          patient_name: string
          payment_date: string
          payment_time: string | null
          status: string
          transaction_id: string | null
          upi_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          patient_name?: string
          payment_date?: string
          payment_time?: string | null
          status?: string
          transaction_id?: string | null
          upi_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          patient_name?: string
          payment_date?: string
          payment_time?: string | null
          status?: string
          transaction_id?: string | null
          upi_id?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          id: string
          message: string | null
          mobile: string | null
          patient_name: string | null
          sent_at: string | null
          sms_type: string | null
          status: string | null
        }
        Insert: {
          id?: string
          message?: string | null
          mobile?: string | null
          patient_name?: string | null
          sent_at?: string | null
          sms_type?: string | null
          status?: string | null
        }
        Update: {
          id?: string
          message?: string | null
          mobile?: string | null
          patient_name?: string | null
          sent_at?: string | null
          sms_type?: string | null
          status?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      xray_reports: {
        Row: {
          body_part: string | null
          clinic_name: string | null
          clinical_history: string | null
          created_at: string
          file_url: string | null
          id: string
          patient_age: string | null
          patient_gender: string | null
          patient_id: string | null
          patient_name: string | null
          report_data: string | null
          report_type: string | null
          uploaded_at: string
          view_projection: string | null
        }
        Insert: {
          body_part?: string | null
          clinic_name?: string | null
          clinical_history?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          patient_age?: string | null
          patient_gender?: string | null
          patient_id?: string | null
          patient_name?: string | null
          report_data?: string | null
          report_type?: string | null
          uploaded_at?: string
          view_projection?: string | null
        }
        Update: {
          body_part?: string | null
          clinic_name?: string | null
          clinical_history?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          patient_age?: string | null
          patient_gender?: string | null
          patient_id?: string | null
          patient_name?: string | null
          report_data?: string | null
          report_type?: string | null
          uploaded_at?: string
          view_projection?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "xray_reports_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "doctor" | "staff" | "patient"
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
      app_role: ["admin", "doctor", "staff", "patient"],
    },
  },
} as const
