export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_voucher_pool: {
        Row: {
          id:           string
          voucher_code: string
          level:        string
          is_used:      boolean
          trainee_id:   string | null
          issued_by:    string | null
          issued_at:    string | null
          created_at:   string
        }
        Insert: {
          id?:          string
          voucher_code: string
          level:        string
          is_used?:     boolean
          trainee_id?:  string | null
          issued_by?:   string | null
          issued_at?:   string | null
          created_at?:  string
        }
        Update: {
          id?:          string
          voucher_code?: string
          level?:       string
          is_used?:     boolean
          trainee_id?:  string | null
          issued_by?:   string | null
          issued_at?:   string | null
          created_at?:  string
        }
        Relationships: []
      }
      attendance_overrides: {
        Row: {
          id: string
          session_id: string
          trainee_id: string
          overridden_by: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          trainee_id: string
          overridden_by: string
          created_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          trainee_id?: string
          overridden_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_overrides_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_overrides_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_overrides_overridden_by_fkey"
            columns: ["overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_pct: number | null
          created_at: string
          duration_mins: number
          id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          total_session_mins: number
          trainee_id: string
        }
        Insert: {
          attendance_pct?: number | null
          created_at?: string
          duration_mins?: number
          id?: string
          session_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          total_session_mins?: number
          trainee_id: string
        }
        Update: {
          attendance_pct?: number | null
          created_at?: string
          duration_mins?: number
          id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          total_session_mins?: number
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: number
          ip_address: unknown
          metadata: Json | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: number
          ip_address?: unknown
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: number
          ip_address?: unknown
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      badges: {
        Row: {
          criteria: Json
          description: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          criteria?: Json
          description?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          criteria?: Json
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      email_change_requests: {
        Row: {
          id:               string
          user_id:          string
          current_email:    string
          requested_email:  string
          reason:           string | null
          status:           string
          notes:            string | null
          reviewed_by:      string | null
          reviewed_at:      string | null
          created_at:       string
        }
        Insert: {
          id?:              string
          user_id:          string
          current_email:    string
          requested_email:  string
          reason?:          string | null
          status?:          string
          notes?:           string | null
          reviewed_by?:     string | null
          reviewed_at?:     string | null
          created_at?:      string
        }
        Update: {
          id?:              string
          user_id?:         string
          current_email?:   string
          requested_email?: string
          reason?:          string | null
          status?:          string
          notes?:           string | null
          reviewed_by?:     string | null
          reviewed_at?:     string | null
          created_at?:      string
        }
        Relationships: [
          {
            foreignKeyName: "email_change_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      access_requests: {
        Row: {
          id: string
          full_name: string
          email: string
          reason: string | null
          institution: string | null
          town: string | null
          region: string | null
          phone: string | null
          requested_role: string
          status: Database["public"]["Enums"]["access_request_status"]
          created_at: string
          reviewed_by: string | null
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          full_name: string
          email: string
          reason?: string | null
          institution?: string | null
          town?: string | null
          region?: string | null
          phone?: string | null
          requested_role?: string
          status?: Database["public"]["Enums"]["access_request_status"]
          created_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          reason?: string | null
          institution?: string | null
          town?: string | null
          region?: string | null
          phone?: string | null
          requested_role?: string
          status?: Database["public"]["Enums"]["access_request_status"]
          created_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Relationships: []
      }
      cohort_access: {
        Row: {
          accepted_at: string | null
          cohort_id: string
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["cohort_access_role"]
          trainer_id: string
        }
        Insert: {
          accepted_at?: string | null
          cohort_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["cohort_access_role"]
          trainer_id: string
        }
        Update: {
          accepted_at?: string | null
          cohort_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["cohort_access_role"]
          trainer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_access_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_week_tasks: {
        Row: {
          canvas_assignment_id: string | null
          cohort_id: string
          created_at: string
          display_order: number
          id: string
          task_name: string
          task_type: Database["public"]["Enums"]["task_type"]
          updated_at: string
          week_number: number
        }
        Insert: {
          canvas_assignment_id?: string | null
          cohort_id: string
          created_at?: string
          display_order?: number
          id?: string
          task_name: string
          task_type: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          week_number: number
        }
        Update: {
          canvas_assignment_id?: string | null
          cohort_id?: string
          created_at?: string
          display_order?: number
          id?: string
          task_name?: string
          task_type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cohort_week_tasks_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      cohorts: {
        Row: {
          analytics_threshold: number | null
          attendance_partial_pct: number
          attendance_present_pct: number
          canvas_api_token_encrypted: string | null
          canvas_course_id: string | null
          code_name: string | null
          created_at: string
          created_by: string
          end_date: string | null
          exam_prep_weeks: number
          has_index_numbers: boolean
          institution: string | null
          last_canvas_sync_at: string | null
          exam_readiness_threshold: number
          exam_type: Database["public"]["Enums"]["exam_type"] | null
          id: string
          level: Database["public"]["Enums"]["cohort_level"]
          name: string
          platform: Database["public"]["Enums"]["cohort_platform"]
          start_date: string
          status: Database["public"]["Enums"]["cohort_status"]
          training_weeks: number
          updated_at: string
        }
        Insert: {
          analytics_threshold?: number | null
          attendance_partial_pct?: number
          attendance_present_pct?: number
          canvas_api_token_encrypted?: string | null
          canvas_course_id?: string | null
          code_name?: string | null
          created_at?: string
          created_by: string
          end_date?: string | null
          exam_prep_weeks?: number
          has_index_numbers?: boolean
          institution?: string | null
          last_canvas_sync_at?: string | null
          exam_readiness_threshold?: number
          exam_type?: Database["public"]["Enums"]["exam_type"] | null
          id?: string
          level: Database["public"]["Enums"]["cohort_level"]
          name: string
          platform: Database["public"]["Enums"]["cohort_platform"]
          start_date: string
          status?: Database["public"]["Enums"]["cohort_status"]
          training_weeks: number
          updated_at?: string
        }
        Update: {
          analytics_threshold?: number | null
          attendance_partial_pct?: number
          attendance_present_pct?: number
          canvas_api_token_encrypted?: string | null
          canvas_course_id?: string | null
          code_name?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          exam_prep_weeks?: number
          has_index_numbers?: boolean
          institution?: string | null
          last_canvas_sync_at?: string | null
          exam_readiness_threshold?: number
          exam_type?: Database["public"]["Enums"]["exam_type"] | null
          id?: string
          level?: Database["public"]["Enums"]["cohort_level"]
          name?: string
          platform?: Database["public"]["Enums"]["cohort_platform"]
          start_date?: string
          status?: Database["public"]["Enums"]["cohort_status"]
          training_weeks?: number
          updated_at?: string
        }
        Relationships: []
      }
      completions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          score: number | null
          source: string
          task_id: string
          trainee_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          score?: number | null
          source?: string
          task_id: string
          trainee_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          score?: number | null
          source?: string
          task_id?: string
          trainee_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "cohort_week_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "completions_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_templates: {
        Row: {
          cohort_subtype: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          level: Database["public"]["Enums"]["cohort_level"]
          name: string
          platform: Database["public"]["Enums"]["cohort_platform"]
          updated_at: string
        }
        Insert: {
          cohort_subtype?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          level: Database["public"]["Enums"]["cohort_level"]
          name: string
          platform: Database["public"]["Enums"]["cohort_platform"]
          updated_at?: string
        }
        Update: {
          cohort_subtype?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          level?: Database["public"]["Enums"]["cohort_level"]
          name?: string
          platform?: Database["public"]["Enums"]["cohort_platform"]
          updated_at?: string
        }
        Relationships: []
      }
      devops_assessments: {
        Row: {
          assessed_at: string
          assessed_by: string | null
          attitude_score: number | null
          communication_score: number | null
          id: string
          initiative_score: number | null
          overall_notes: string | null
          phase_id: string
          technical_score: number | null
          trainee_id: string
        }
        Insert: {
          assessed_at?: string
          assessed_by?: string | null
          attitude_score?: number | null
          communication_score?: number | null
          id?: string
          initiative_score?: number | null
          overall_notes?: string | null
          phase_id: string
          technical_score?: number | null
          trainee_id: string
        }
        Update: {
          assessed_at?: string
          assessed_by?: string | null
          attitude_score?: number | null
          communication_score?: number | null
          id?: string
          initiative_score?: number | null
          overall_notes?: string | null
          phase_id?: string
          technical_score?: number | null
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devops_assessments_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "devops_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_assessments_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_lab_completions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          lab_id: string
          platform_ref: string | null
          score: number | null
          trainee_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lab_id: string
          platform_ref?: string | null
          score?: number | null
          trainee_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          lab_id?: string
          platform_ref?: string | null
          score?: number | null
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devops_lab_completions_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "devops_labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_lab_completions_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_labs: {
        Row: {
          created_at: string
          display_order: number
          due_date: string | null
          id: string
          lab_name: string
          phase_id: string
          platform: Database["public"]["Enums"]["devops_lab_platform"]
        }
        Insert: {
          created_at?: string
          display_order?: number
          due_date?: string | null
          id?: string
          lab_name: string
          phase_id: string
          platform?: Database["public"]["Enums"]["devops_lab_platform"]
        }
        Update: {
          created_at?: string
          display_order?: number
          due_date?: string | null
          id?: string
          lab_name?: string
          phase_id?: string
          platform?: Database["public"]["Enums"]["devops_lab_platform"]
        }
        Relationships: [
          {
            foreignKeyName: "devops_labs_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "devops_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_outcomes: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          outcome: Database["public"]["Enums"]["devops_outcome"]
          outcome_date: string | null
          recorded_by: string | null
          trainee_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          outcome: Database["public"]["Enums"]["devops_outcome"]
          outcome_date?: string | null
          recorded_by?: string | null
          trainee_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          outcome?: Database["public"]["Enums"]["devops_outcome"]
          outcome_date?: string | null
          recorded_by?: string | null
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devops_outcomes_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_phase_rankings: {
        Row: {
          composite_score: number | null
          id: string
          notes: string | null
          rank: number
          recommendation: Database["public"]["Enums"]["devops_recommendation"]
          report_id: string
          trainee_id: string
        }
        Insert: {
          composite_score?: number | null
          id?: string
          notes?: string | null
          rank: number
          recommendation: Database["public"]["Enums"]["devops_recommendation"]
          report_id: string
          trainee_id: string
        }
        Update: {
          composite_score?: number | null
          id?: string
          notes?: string | null
          rank?: number
          recommendation?: Database["public"]["Enums"]["devops_recommendation"]
          report_id?: string
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devops_phase_rankings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "devops_phase_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_phase_rankings_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_phase_reports: {
        Row: {
          generated_at: string
          generated_by: string | null
          id: string
          notes: string | null
          phase_id: string
        }
        Insert: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          phase_id: string
        }
        Update: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          notes?: string | null
          phase_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devops_phase_reports_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "devops_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_phases: {
        Row: {
          cohort_id: string
          created_at: string
          end_date: string | null
          id: string
          is_completed: boolean
          name: string
          phase_number: number
          start_date: string | null
        }
        Insert: {
          cohort_id: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_completed?: boolean
          name: string
          phase_number: number
          start_date?: string | null
        }
        Update: {
          cohort_id?: string
          created_at?: string
          end_date?: string | null
          id?: string
          is_completed?: boolean
          name?: string
          phase_number?: number
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devops_phases_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_project_submissions: {
        Row: {
          created_at: string
          github_url: string | null
          id: string
          project_id: string
          quality_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string | null
          timeliness_score: number | null
          trainee_id: string
          trainer_notes: string | null
        }
        Insert: {
          created_at?: string
          github_url?: string | null
          id?: string
          project_id: string
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string | null
          timeliness_score?: number | null
          trainee_id: string
          trainer_notes?: string | null
        }
        Update: {
          created_at?: string
          github_url?: string | null
          id?: string
          project_id?: string
          quality_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string | null
          timeliness_score?: number | null
          trainee_id?: string
          trainer_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devops_project_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "devops_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devops_project_submissions_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_projects: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          max_score: number
          phase_id: string
          project_name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          max_score?: number
          phase_id: string
          project_name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          max_score?: number
          phase_id?: string
          project_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "devops_projects_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "devops_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      devops_readiness_snapshots: {
        Row: {
          consistency_score: number | null
          created_at: string
          id: string
          initiative_score: number | null
          model_version: string | null
          overall_readiness: number | null
          professionalism_score: number | null
          recommendation: string | null
          snapshot_date: string
          technical_score: number | null
          trainee_id: string
        }
        Insert: {
          consistency_score?: number | null
          created_at?: string
          id?: string
          initiative_score?: number | null
          model_version?: string | null
          overall_readiness?: number | null
          professionalism_score?: number | null
          recommendation?: string | null
          snapshot_date?: string
          technical_score?: number | null
          trainee_id: string
        }
        Update: {
          consistency_score?: number | null
          created_at?: string
          id?: string
          initiative_score?: number | null
          model_version?: string | null
          overall_readiness?: number | null
          professionalism_score?: number | null
          recommendation?: string | null
          snapshot_date?: string
          technical_score?: number | null
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devops_readiness_snapshots_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_outcomes: {
        Row: {
          actual_score: number | null
          attempt_no:   number
          created_at:   string
          exam_date:    string | null
          exam_type:    Database["public"]["Enums"]["exam_type"]
          id:           string
          notes:         string | null
          outcome:       Database["public"]["Enums"]["exam_outcome"]
          self_reported: boolean
          trainee_id:    string
          updated_at:    string
          voucher_id:    string | null
        }
        Insert: {
          actual_score?:  number | null
          attempt_no?:    number
          created_at?:    string
          exam_date?:     string | null
          exam_type:      Database["public"]["Enums"]["exam_type"]
          id?:            string
          notes?:         string | null
          outcome?:       Database["public"]["Enums"]["exam_outcome"]
          self_reported?: boolean
          trainee_id:     string
          updated_at?:    string
          voucher_id?:    string | null
        }
        Update: {
          actual_score?:  number | null
          attempt_no?:    number
          created_at?:    string
          exam_date?:     string | null
          exam_type?:     Database["public"]["Enums"]["exam_type"]
          id?:            string
          notes?:         string | null
          outcome?:       Database["public"]["Enums"]["exam_outcome"]
          self_reported?: boolean
          trainee_id?:    string
          updated_at?:    string
          voucher_id?:    string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_outcomes_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_outcomes_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_quizzes: {
        Row: {
          cohort_id:    string
          created_at:   string
          created_by:   string | null
          focus_label:  string | null
          focus_type:   string
          id:           string
          max_score:    number
          quiz_date:    string | null
          quiz_name:    string
          source_platform: string
          week_number:  number
        }
        Insert: {
          cohort_id:    string
          created_at?:  string
          created_by?:  string | null
          focus_label?: string | null
          focus_type?:  string
          id?:          string
          max_score?:   number
          quiz_date?:   string | null
          quiz_name:    string
          source_platform?: string
          week_number:  number
        }
        Update: {
          cohort_id?:   string
          created_at?:  string
          created_by?:  string | null
          focus_label?: string | null
          focus_type?:  string
          id?:          string
          max_score?:   number
          quiz_date?:   string | null
          quiz_name?:   string
          source_platform?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_quizzes_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_scores: {
        Row: {
          attempt_no: number
          id: string
          quiz_id: string
          score: number
          trainee_id: string
          uploaded_at: string
        }
        Insert: {
          attempt_no?: number
          id?: string
          quiz_id: string
          score: number
          trainee_id: string
          uploaded_at?: string
        }
        Update: {
          attempt_no?: number
          id?: string
          quiz_id?: string
          score?: number
          trainee_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_scores_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "exam_quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_scores_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      prediction_snapshots: {
        Row: {
          confidence_pct: number | null
          created_at: string
          dropout_risk_level: string | null
          dropout_risk_score: number | null
          exam_readiness_score: number | null
          id: string
          model_version: string | null
          predicted_exam_score: number | null
          prediction_stage: number
          snapshot_date: string
          trainee_id: string
        }
        Insert: {
          confidence_pct?: number | null
          created_at?: string
          dropout_risk_level?: string | null
          dropout_risk_score?: number | null
          exam_readiness_score?: number | null
          id?: string
          model_version?: string | null
          predicted_exam_score?: number | null
          prediction_stage?: number
          snapshot_date?: string
          trainee_id: string
        }
        Update: {
          confidence_pct?: number | null
          created_at?: string
          dropout_risk_level?: string | null
          dropout_risk_score?: number | null
          exam_readiness_score?: number | null
          id?: string
          model_version?: string | null
          predicted_exam_score?: number | null
          prediction_stage?: number
          snapshot_date?: string
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prediction_snapshots_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          last_seen: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          last_seen?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          last_seen?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      question_banks: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean
          level: Database["public"]["Enums"]["cohort_level"] | null
          name: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean
          level?: Database["public"]["Enums"]["cohort_level"] | null
          name: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean
          level?: Database["public"]["Enums"]["cohort_level"] | null
          name?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          bank_id: string
          correct_answers: string[] | null
          created_at: string
          display_order: number
          explanation: string | null
          id: string
          option_a: string | null
          option_b: string | null
          option_c: string | null
          option_d: string | null
          option_e: string | null
          option_f: string | null
          points: number
          question_text: string
          question_type: Database["public"]["Enums"]["quiz_question_type"]
          time_seconds: number | null
          updated_at: string
        }
        Insert: {
          bank_id: string
          correct_answers?: string[] | null
          created_at?: string
          display_order?: number
          explanation?: string | null
          id?: string
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          option_e?: string | null
          option_f?: string | null
          points?: number
          question_text: string
          question_type: Database["public"]["Enums"]["quiz_question_type"]
          time_seconds?: number | null
          updated_at?: string
        }
        Update: {
          bank_id?: string
          correct_answers?: string[] | null
          created_at?: string
          display_order?: number
          explanation?: string | null
          id?: string
          option_a?: string | null
          option_b?: string | null
          option_c?: string | null
          option_d?: string | null
          option_e?: string | null
          option_f?: string | null
          points?: number
          question_text?: string
          question_type?: Database["public"]["Enums"]["quiz_question_type"]
          time_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_answers: {
        Row: {
          attempt_id: string
          created_at: string
          graded_at: string | null
          graded_by: string | null
          id: string
          is_correct: boolean | null
          question_id: string
          score_awarded: number | null
          selected_options: string[] | null
          text_answer: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          question_id: string
          score_awarded?: number | null
          selected_options?: string[] | null
          text_answer?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          is_correct?: boolean | null
          question_id?: string
          score_awarded?: number | null
          selected_options?: string[] | null
          text_answer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_assignments: {
        Row: {
          attempts_allowed: number
          bank_id: string
          close_at: string | null
          cohort_id: string | null
          created_at: string
          created_by: string
          eye_away_warn_secs: number
          id: string
          lockout_duration_mins: number
          mode: Database["public"]["Enums"]["quiz_mode"]
          open_at: string | null
          per_question_secs: number | null
          published_exam_quiz_id: string | null
          questions_per_student: number
          quizdesk_class_id: string | null
          randomise: boolean
          show_answers: boolean
          show_results: boolean
          strike_limit: number
          time_limit_mins: number | null
          title: string
          updated_at: string
          webcam_required: boolean
          week_number: number | null
        }
        Insert: {
          attempts_allowed?: number
          bank_id: string
          close_at?: string | null
          cohort_id?: string | null
          created_at?: string
          created_by: string
          eye_away_warn_secs?: number
          id?: string
          lockout_duration_mins?: number
          mode?: Database["public"]["Enums"]["quiz_mode"]
          open_at?: string | null
          per_question_secs?: number | null
          published_exam_quiz_id?: string | null
          questions_per_student?: number
          quizdesk_class_id?: string | null
          randomise?: boolean
          show_answers?: boolean
          show_results?: boolean
          strike_limit?: number
          time_limit_mins?: number | null
          title: string
          updated_at?: string
          webcam_required?: boolean
          week_number?: number | null
        }
        Update: {
          attempts_allowed?: number
          bank_id?: string
          close_at?: string | null
          cohort_id?: string | null
          created_at?: string
          created_by?: string
          eye_away_warn_secs?: number
          id?: string
          lockout_duration_mins?: number
          mode?: Database["public"]["Enums"]["quiz_mode"]
          open_at?: string | null
          per_question_secs?: number | null
          published_exam_quiz_id?: string | null
          questions_per_student?: number
          quizdesk_class_id?: string | null
          randomise?: boolean
          show_answers?: boolean
          show_results?: boolean
          strike_limit?: number
          time_limit_mins?: number | null
          title?: string
          updated_at?: string
          webcam_required?: boolean
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_quizdesk_class"
            columns: ["quizdesk_class_id"]
            isOneToOne: false
            referencedRelation: "quizdesk_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_assignments_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_assignments_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          assignment_id: string
          attempt_no: number
          auto_score: number | null
          created_at: string
          final_score: number | null
          id: string
          is_locked: boolean
          locked_until: string | null
          manual_score: number | null
          mode: Database["public"]["Enums"]["quiz_mode"]
          question_order: string[] | null
          quizdesk_student_id: string | null
          retake_blocked: boolean
          started_at: string
          submitted_at: string | null
          terminated: boolean
          trainee_id: string | null
          warning_count: number
        }
        Insert: {
          assignment_id: string
          attempt_no?: number
          auto_score?: number | null
          created_at?: string
          final_score?: number | null
          id?: string
          is_locked?: boolean
          locked_until?: string | null
          manual_score?: number | null
          mode: Database["public"]["Enums"]["quiz_mode"]
          question_order?: string[] | null
          quizdesk_student_id?: string | null
          retake_blocked?: boolean
          started_at?: string
          submitted_at?: string | null
          terminated?: boolean
          trainee_id?: string | null
          warning_count?: number
        }
        Update: {
          assignment_id?: string
          attempt_no?: number
          auto_score?: number | null
          created_at?: string
          final_score?: number | null
          id?: string
          is_locked?: boolean
          locked_until?: string | null
          manual_score?: number | null
          mode?: Database["public"]["Enums"]["quiz_mode"]
          question_order?: string[] | null
          quizdesk_student_id?: string | null
          retake_blocked?: boolean
          started_at?: string
          submitted_at?: string | null
          terminated?: boolean
          trainee_id?: string | null
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_quizdesk_student"
            columns: ["quizdesk_student_id"]
            isOneToOne: false
            referencedRelation: "quizdesk_students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "quiz_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_violations: {
        Row: {
          attempt_id: string
          detected_at: string
          id: string
          metadata: Json | null
          strike_no: number | null
          violation_type: Database["public"]["Enums"]["quiz_violation_type"]
        }
        Insert: {
          attempt_id: string
          detected_at?: string
          id?: string
          metadata?: Json | null
          strike_no?: number | null
          violation_type: Database["public"]["Enums"]["quiz_violation_type"]
        }
        Update: {
          attempt_id?: string
          detected_at?: string
          id?: string
          metadata?: Json | null
          strike_no?: number | null
          violation_type?: Database["public"]["Enums"]["quiz_violation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "quiz_violations_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      quizdesk_classes: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizdesk_classes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "quizdesk_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      quizdesk_organizations: {
        Row: {
          created_at: string
          id: string
          institution: string | null
          is_active: boolean
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          institution?: string | null
          is_active?: boolean
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          institution?: string | null
          is_active?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      quizdesk_students: {
        Row: {
          class_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          index_number: string | null
          user_id: string | null
        }
        Insert: {
          class_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          index_number?: string | null
          user_id?: string | null
        }
        Update: {
          class_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          index_number?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quizdesk_students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "quizdesk_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          cohort_id: string
          created_at: string
          ended_at: string | null
          external_meeting_id: string | null
          host_email: string | null
          id: string
          platform: Database["public"]["Enums"]["session_platform"]
          session_number: number | null
          started_at: string
          topic: string
          total_duration_mins: number
          week_number: number | null
        }
        Insert: {
          cohort_id: string
          created_at?: string
          ended_at?: string | null
          external_meeting_id?: string | null
          host_email?: string | null
          id?: string
          platform: Database["public"]["Enums"]["session_platform"]
          session_number?: number | null
          started_at: string
          topic: string
          total_duration_mins: number
          week_number?: number | null
        }
        Update: {
          cohort_id?: string
          created_at?: string
          ended_at?: string | null
          external_meeting_id?: string | null
          host_email?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["session_platform"]
          session_number?: number | null
          started_at?: string
          topic?: string
          total_duration_mins?: number
          week_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      teams_chat_analysis: {
        Row: {
          action_items_completed: number
          analyzed_at: string
          engagement_score: number | null
          helped_others: number
          id: string
          message_count: number
          questions_asked: number
          responses_given: number
          session_id: string
          technical_depth_score: number | null
          trainee_id: string
        }
        Insert: {
          action_items_completed?: number
          analyzed_at?: string
          engagement_score?: number | null
          helped_others?: number
          id?: string
          message_count?: number
          questions_asked?: number
          responses_given?: number
          session_id: string
          technical_depth_score?: number | null
          trainee_id: string
        }
        Update: {
          action_items_completed?: number
          analyzed_at?: string
          engagement_score?: number | null
          helped_others?: number
          id?: string
          message_count?: number
          questions_asked?: number
          responses_given?: number
          session_id?: string
          technical_depth_score?: number | null
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_chat_analysis_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_chat_analysis_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      teams_chats: {
        Row: {
          ai_summary: string | null
          id: string
          raw_content: string | null
          session_id: string
          uploaded_at: string
        }
        Insert: {
          ai_summary?: string | null
          id?: string
          raw_content?: string | null
          session_id: string
          uploaded_at?: string
        }
        Update: {
          ai_summary?: string | null
          id?: string
          raw_content?: string | null
          session_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_chats_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      template_tasks: {
        Row: {
          created_at: string
          display_order: number
          id: string
          task_name: string
          task_type: Database["public"]["Enums"]["task_type"]
          template_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          task_name: string
          task_type: Database["public"]["Enums"]["task_type"]
          template_id: string
          week_number: number
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          task_name?: string
          task_type?: Database["public"]["Enums"]["task_type"]
          template_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "curriculum_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      trainee_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          trainee_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          trainee_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          trainee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainee_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trainee_badges_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      trainees: {
        Row: {
          amalitech_email: string | null
          cohort_id: string
          cohort_type: Database["public"]["Enums"]["cohort_type"] | null
          created_at: string
          deleted_at: string | null
          exam_approved: boolean
          full_name: string
          gender: string | null
          graduated: boolean
          id: string
          index_number: string | null
          personal_email: string
          phone: string | null
          region: Database["public"]["Enums"]["ghana_region"] | null
          serial_no:      number | null
          show_readiness: boolean
          status:         Database["public"]["Enums"]["trainee_status"]
          town:           string | null
          university:     string | null
          updated_at:     string
          user_id:        string | null
        }
        Insert: {
          amalitech_email?: string | null
          cohort_id:        string
          cohort_type?:     Database["public"]["Enums"]["cohort_type"] | null
          created_at?:      string
          deleted_at?:      string | null
          exam_approved?:   boolean
          full_name:        string
          gender?:          string | null
          graduated?:       boolean
          id?:              string
          index_number?:    string | null
          personal_email:   string
          phone?:           string | null
          region?:          Database["public"]["Enums"]["ghana_region"] | null
          serial_no?:       number | null
          show_readiness?:  boolean
          status?:          Database["public"]["Enums"]["trainee_status"]
          town?:            string | null
          university?:      string | null
          updated_at?:      string
          user_id?:         string | null
        }
        Update: {
          amalitech_email?: string | null
          cohort_id?:       string
          cohort_type?:     Database["public"]["Enums"]["cohort_type"] | null
          created_at?:      string
          deleted_at?:      string | null
          exam_approved?:   boolean
          full_name?:       string
          gender?:          string | null
          graduated?:       boolean
          id?:              string
          index_number?:    string | null
          personal_email?:  string
          phone?:           string | null
          region?:          Database["public"]["Enums"]["ghana_region"] | null
          serial_no?:       number | null
          show_readiness?:  boolean
          status?:          Database["public"]["Enums"]["trainee_status"]
          town?:            string | null
          university?:      string | null
          updated_at?:      string
          user_id?:         string | null
        }
        Relationships: [
          {
            foreignKeyName: "trainees_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          id: string
          is_waived: boolean
          max_quiz_takers: number
          notes: string | null
          owner_id: string
          updated_at: string
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          id?: string
          is_waived?: boolean
          max_quiz_takers?: number
          notes?: string | null
          owner_id: string
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          id?: string
          is_waived?: boolean
          max_quiz_takers?: number
          notes?: string | null
          owner_id?: string
          updated_at?: string
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: []
      }
      voucher_pool: {
        Row: {
          cohort_id:    string
          created_at:   string
          email:        string
          id:           string
          is_used:      boolean
          name:         string | null
          trainee_id:   string | null
          uploaded_by:  string | null
          voucher_code: string
        }
        Insert: {
          cohort_id:    string
          created_at?:  string
          email:        string
          id?:          string
          is_used?:     boolean
          name?:        string | null
          trainee_id?:  string | null
          uploaded_by?: string | null
          voucher_code: string
        }
        Update: {
          cohort_id?:   string
          created_at?:  string
          email?:       string
          id?:          string
          is_used?:     boolean
          name?:        string | null
          trainee_id?:  string | null
          uploaded_by?: string | null
          voucher_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_pool_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_pool_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          attempt_no:   number
          created_at:   string
          exam_type:    Database["public"]["Enums"]["exam_type"]
          id:           string
          issued_by:    string | null
          issued_date:  string
          trainee_id:   string
          voucher_code: string | null
        }
        Insert: {
          attempt_no?:  number
          created_at?:  string
          exam_type:    Database["public"]["Enums"]["exam_type"]
          id?:          string
          issued_by?:   string | null
          issued_date:  string
          trainee_id:   string
          voucher_code?: string | null
        }
        Update: {
          attempt_no?:  number
          created_at?:  string
          exam_type?:   Database["public"]["Enums"]["exam_type"]
          id?:          string
          issued_by?:   string | null
          issued_date?: string
          trainee_id?:  string
          voucher_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_trainee_id_fkey"
            columns: ["trainee_id"]
            isOneToOne: false
            referencedRelation: "trainees"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_requests: {
        Row: {
          created_at: string
          id: string
          reason: string
          requester_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          status: Database["public"]["Enums"]["waiver_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          requester_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["waiver_status"]
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          requester_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["waiver_status"]
        }
        Relationships: []
      }
      question_bank_shares: {
        Row: {
          bank_id: string
          can_edit: boolean
          created_at: string
          id: string
          shared_by: string
          shared_with: string
        }
        Insert: {
          bank_id: string
          can_edit?: boolean
          created_at?: string
          id?: string
          shared_by: string
          shared_with: string
        }
        Update: {
          bank_id?: string
          can_edit?: boolean
          created_at?: string
          id?: string
          shared_by?: string
          shared_with?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_bank_shares_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "question_banks"
            referencedColumns: ["id"]
          },
        ]
      }
      webcam_snapshots: {
        Row: {
          attempt_id: string
          captured_at: string
          flagged: boolean
          flag_reason: string | null
          id: string
          storage_path: string
        }
        Insert: {
          attempt_id: string
          captured_at?: string
          flagged?: boolean
          flag_reason?: string | null
          id?: string
          storage_path: string
        }
        Update: {
          attempt_id?: string
          captured_at?: string
          flagged?: boolean
          flag_reason?: string | null
          id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "webcam_snapshots_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_notifications: {
        Row: {
          attempt_id: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          recipient_id: string
          sent_email: boolean
          title: string
          type: string
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          recipient_id: string
          sent_email?: boolean
          title: string
          type: string
        }
        Update: {
          attempt_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          recipient_id?: string
          sent_email?: boolean
          title?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_profile_by_email: {
        Args: { p_email: string }
        Returns: {
          user_id:   string
          role:      Database["public"]["Enums"]["user_role"]
          is_active: boolean
        }[]
      }
      get_cohort_attendance_summary: {
        Args: { p_cohort_id: string }
        Returns: {
          trainee_id:        string
          sessions_attended: number
          total_sessions:    number
        }[]
      }
      get_cohort_completion_by_week: {
        Args: { p_cohort_id: string }
        Returns: {
          trainee_id:  string
          week_number: number
          lab_count:   number
          kc_count:    number
        }[]
      }
      get_cohort_completion_summary: {
        Args: { p_cohort_id: string }
        Returns: {
          trainee_id:  string
          lab_count:   number
          kc_count:    number
          video_count: number
        }[]
      }
      get_cohort_leaderboard: {
        Args: { p_cohort_id: string }
        Returns: {
          trainee_id: string
          full_name: string
          kcs_completed: number
          avg_kc_score: number | null
          labs_completed: number
          total_lab_tasks: number
          rank: number
        }[]
      }
      has_cohort_access: { Args: { p_cohort_id: string }; Returns: boolean }
      is_cohort_owner: { Args: { p_cohort_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      my_trainee_id: { Args: never; Returns: string }
    }
    Enums: {
      access_request_status: "pending" | "approved" | "denied"
      attendance_status: "present" | "partial" | "brief" | "absent"
      cohort_access_role: "owner" | "trainer"
      cohort_level: "practitioner" | "associate" | "devops" | "general"
      cohort_status: "active" | "completed" | "archived" | "deleted"
      cohort_platform: "canvas" | "whizlabs" | "devops" | "general"
      cohort_type: "university" | "external" | "graduate"
      devops_lab_platform: "kodekloud" | "github" | "other"
      devops_outcome:
        | "placed_client"
        | "hired_fulltime"
        | "completed_left"
        | "dropped"
        | "suspended"
      devops_recommendation: "proceed" | "watch" | "drop"
      exam_outcome: "passed" | "failed" | "pending"
      exam_type: "CCP" | "SAA-C03" | "DVA-C02" | "SAP-C02" | "DOP-C02"
      ghana_region:
        | "Greater Accra"
        | "Ashanti"
        | "Western"
        | "Eastern"
        | "Central"
        | "Volta"
        | "Northern"
        | "Upper East"
        | "Upper West"
        | "Brong-Ahafo"
        | "Oti"
        | "Ahafo"
        | "Bono East"
        | "North East"
        | "Savannah"
        | "Western North"
      quiz_mode: "practice" | "exam"
      quiz_question_type: "mcq" | "multi_select" | "true_false" | "short_answer" | "code_input"
      quiz_violation_type:
        | "tab_switch"
        | "fullscreen_exit"
        | "blur"
        | "secondary_monitor"
        | "eye_away"
        | "lockout"
      session_platform: "zoom" | "teams"
      task_type: "kc" | "lab" | "video"
      trainee_status: "active" | "completed" | "dropped" | "suspended" | "disabled"
      user_role:
        | "super_admin"
        | "admin"
        | "trainer"
        | "trainee"
        | "quiz_creator"
        | "quiz_taker"
      waiver_status: "pending" | "approved" | "rejected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attendance_status: ["present", "partial", "brief", "absent"],
      cohort_access_role: ["owner", "trainer"],
      cohort_level: ["practitioner", "associate", "devops", "general"],
      cohort_platform: ["canvas", "whizlabs", "devops", "general"],
      cohort_type: ["university", "external", "graduate"],
      devops_lab_platform: ["kodekloud", "github", "other"],
      devops_outcome: [
        "placed_client",
        "hired_fulltime",
        "completed_left",
        "dropped",
        "suspended",
      ],
      devops_recommendation: ["proceed", "watch", "drop"],
      exam_outcome: ["passed", "failed", "pending"],
      exam_type: ["CCP", "SAA-C03", "DVA-C02"],
      ghana_region: [
        "Greater Accra",
        "Ashanti",
        "Western",
        "Eastern",
        "Central",
        "Volta",
        "Northern",
        "Upper East",
        "Upper West",
        "Brong-Ahafo",
        "Oti",
        "Ahafo",
        "Bono East",
        "North East",
        "Savannah",
        "Western North",
      ],
      quiz_mode: ["practice", "exam"],
      quiz_question_type: ["mcq", "multi_select", "true_false", "short_answer", "code_input"],
      quiz_violation_type: [
        "tab_switch",
        "fullscreen_exit",
        "blur",
        "secondary_monitor",
        "eye_away",
        "lockout",
      ],
      session_platform: ["zoom", "teams"],
      task_type: ["kc", "lab", "video"],
      trainee_status: ["active", "completed", "dropped", "suspended", "disabled"],
      user_role: [
        "super_admin",
        "admin",
        "trainer",
        "trainee",
        "quiz_creator",
        "quiz_taker",
      ],
      waiver_status: ["pending", "approved", "rejected"],
    },
  },
} as const

