export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      facility_managers: {
        Row: { user_id: string; is_active: boolean };
        Insert: { user_id: string; is_active?: boolean };
        Update: { user_id?: string; is_active?: boolean };
        ComputedFields: never;
        Relationships: [];
      };
      contracts: {
        Row: {
          id: string;
          site_id: string;
          revision: number;
          published_version_id: string | null;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id?: string;
          site_id: string;
          revision?: number;
          published_version_id?: string | null;
          created_at?: string;
          created_by: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          revision?: number;
          published_version_id?: string | null;
          created_at?: string;
          created_by?: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      contract_versions: {
        Row: {
          id: string;
          contract_id: string;
          version: number;
          details: Json;
          filename: string;
          byte_size: number;
          sha256: string;
          created_at: string;
          created_by: string;
        };
        Insert: {
          id: string;
          contract_id: string;
          version: number;
          details: Json;
          filename: string;
          byte_size: number;
          sha256: string;
          created_at: string;
          created_by: string;
        };
        Update: {
          id?: string;
          contract_id?: string;
          version?: number;
          details?: Json;
          filename?: string;
          byte_size?: number;
          sha256?: string;
          created_at?: string;
          created_by?: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      contract_events: {
        Row: {
          id: string;
          contract_id: string;
          version_id: string | null;
          actor_id: string;
          event_type: string;
          revision: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          contract_id: string;
          version_id: string | null;
          actor_id: string;
          event_type: string;
          revision?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          contract_id?: string;
          version_id?: string | null;
          actor_id?: string;
          event_type?: string;
          revision?: number;
          created_at?: string;
        };
        ComputedFields: never;
        Relationships: [];
      };
      sites: {
        Row: {
          id: string;
          name: string;
          address: string;
          created_at: string;
          customer_name: string;
          contact_name: string;
          contact_email: string;
          contact_phone: string;
          is_archived: boolean;
          version: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          name: string;
          address?: string;
          customer_name?: string;
          contact_name?: string;
          contact_email?: string;
          contact_phone?: string;
          is_archived?: boolean;
          version?: number;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          customer_name?: string;
          contact_name?: string;
          contact_email?: string;
          contact_phone?: string;
          is_archived?: boolean;
          version?: number;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      buildings: {
        Row: {
          id: string;
          site_id: string;
          name: string;
          address: string;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          site_id: string;
          name: string;
          address?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          site_id?: string;
          name?: string;
          address?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "buildings_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      site_memberships: {
        Row: {
          site_id: string;
          user_id: string;
          is_active: boolean;
          created_at: string;
        };
        ComputedFields: never;
        Insert: {
          site_id: string;
          user_id: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          site_id?: string;
          user_id?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_memberships_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          company: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          job_title: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          job_title?: string | null;
          updated_at?: string;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          job_title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      request_events: {
        Row: {
          actor_id: string | null;
          assigned_name: string | null;
          created_at: string;
          id: number;
          request_id: string;
          resolution: string | null;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          assigned_name?: string | null;
          created_at?: string;
          id?: never;
          request_id: string;
          resolution?: string | null;
          status: string;
        };
        Update: {
          actor_id?: string | null;
          assigned_name?: string | null;
          created_at?: string;
          id?: never;
          request_id?: string;
          resolution?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_events_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      service_requests: {
        Row: {
          assigned_to: string | null;
          closed_at: string | null;
          created_at: string;
          description: string;
          expected_version: number | null;
          id: string;
          operation_key: string | null;
          priority: string;
          resolution: string | null;
          site: string;
          status: string;
          system: string;
          updated_at: string;
          user_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          assigned_to?: string | null;
          closed_at?: string | null;
          created_at?: string;
          description: string;
          expected_version?: number | null;
          id?: string;
          operation_key?: string | null;
          priority?: string;
          resolution?: string | null;
          site: string;
          status?: string;
          system: string;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          assigned_to?: string | null;
          closed_at?: string | null;
          created_at?: string;
          description?: string;
          expected_version?: number | null;
          id?: string;
          operation_key?: string | null;
          priority?: string;
          resolution?: string | null;
          site?: string;
          status?: string;
          system?: string;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "service_requests_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "service_staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
      service_staff: {
        Row: {
          display_name: string;
          is_active: boolean;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          display_name: string;
          is_active?: boolean;
          user_id: string;
        };
        Update: {
          display_name?: string;
          is_active?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      contract_summaries: {
        Args: { p_site_id: string };
        Returns: {
          id: string;
          site_id: string;
          revision: number;
          published_version_id: string | null;
          created_at: string;
          title: string;
          contract_number: string;
        }[];
      };
      can_manage_facilities: { Args: Record<string, never>; Returns: boolean };
      save_site: {
        Args: { p_id: string; p_expected_version: number; p_details: Json };
        Returns: Json;
      };
      save_contract_version: {
        Args: {
          p_contract_id: string;
          p_site_id: string;
          p_version_id: string;
          p_expected_revision: number;
          p_details: Json;
          p_filename: string;
          p_pdf_base64: string;
        };
        Returns: Json;
      };
      publish_contract: {
        Args: {
          p_contract_id: string;
          p_expected_revision: number;
          p_version_id: string | null;
        };
        Returns: Json;
      };
      download_contract_file: {
        Args: { p_version_id: string };
        Returns: { filename: string; pdf_base64: string; sha256: string }[];
      };
      create_service_request: {
        Args: {
          p_description: string;
          p_operation_key: string;
          p_priority: string;
          p_site: string;
          p_system: string;
        };
        Returns: {
          assigned_to: string | null;
          closed_at: string | null;
          created_at: string;
          description: string;
          expected_version: number | null;
          id: string;
          operation_key: string | null;
          priority: string;
          resolution: string | null;
          site: string;
          status: string;
          system: string;
          updated_at: string;
          user_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "service_requests";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      process_service_request: {
        Args: {
          p_assigned_to: string;
          p_expected_version: number;
          p_request_id: string;
          p_resolution: string;
          p_status: string;
        };
        Returns: {
          assigned_to: string | null;
          closed_at: string | null;
          created_at: string;
          description: string;
          expected_version: number | null;
          id: string;
          operation_key: string | null;
          priority: string;
          resolution: string | null;
          site: string;
          status: string;
          system: string;
          updated_at: string;
          user_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "service_requests";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
