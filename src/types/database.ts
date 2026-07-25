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
      league_attributes: {
        Row: {
          code: string
          id: string
          is_active: boolean
          label: string
          league_id: string
          points: number
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean
          label: string
          league_id: string
          points: number
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean
          label?: string
          league_id?: string
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_attributes_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          created_at: string
          id: string
          league_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_metrics: {
        Row: {
          code: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          league_id: string
          maximum_score: number
          minimum_score: number
        }
        Insert: {
          code: string
          display_order: number
          id?: string
          is_active?: boolean
          label: string
          league_id: string
          maximum_score?: number
          minimum_score?: number
        }
        Update: {
          code?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          league_id?: string
          maximum_score?: number
          minimum_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_metrics_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          category: Database["public"]["Enums"]["league_category"]
          created_at: string
          id: string
          market_constant_gbp: number
          status: Database["public"]["Enums"]["league_status"]
          title: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["league_category"]
          created_at?: string
          id?: string
          market_constant_gbp?: number
          status?: Database["public"]["Enums"]["league_status"]
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["league_category"]
          created_at?: string
          id?: string
          market_constant_gbp?: number
          status?: Database["public"]["Enums"]["league_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      match_players: {
        Row: {
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          created_at: string
          id: string
          match_id: string
          player_id: string
          team_side: Database["public"]["Enums"]["team_side"]
        }
        Insert: {
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          created_at?: string
          id?: string
          match_id: string
          player_id: string
          team_side?: Database["public"]["Enums"]["team_side"]
        }
        Update: {
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          created_at?: string
          id?: string
          match_id?: string
          player_id?: string
          team_side?: Database["public"]["Enums"]["team_side"]
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_market_values"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_metric_averages"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_team_name: string
          created_at: string
          home_team_name: string
          id: string
          league_id: string
          location: string
          played_at: string
          results_imported_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          title: string
          updated_at: string
        }
        Insert: {
          away_team_name: string
          created_at?: string
          home_team_name: string
          id?: string
          league_id: string
          location: string
          played_at: string
          results_imported_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          title: string
          updated_at?: string
        }
        Update: {
          away_team_name?: string
          created_at?: string
          home_team_name?: string
          id?: string
          league_id?: string
          location?: string
          played_at?: string
          results_imported_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_score_attributes: {
        Row: {
          created_at: string
          id: string
          league_attribute_id: string
          player_match_score_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_attribute_id: string
          player_match_score_id: string
        }
        Update: {
          created_at?: string
          id?: string
          league_attribute_id?: string
          player_match_score_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_match_score_attributes_league_attribute_id_fkey"
            columns: ["league_attribute_id"]
            isOneToOne: false
            referencedRelation: "league_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_score_attributes_player_match_score_id_fkey"
            columns: ["player_match_score_id"]
            isOneToOne: false
            referencedRelation: "player_match_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_scores: {
        Row: {
          attribute_points: number
          base_score: number
          created_at: string
          final_score: number
          id: string
          imported_by: string | null
          match_id: string
          metric_scores: Json
          player_id: string
          updated_at: string
        }
        Insert: {
          attribute_points?: number
          base_score: number
          created_at?: string
          final_score: number
          id?: string
          imported_by?: string | null
          match_id: string
          metric_scores: Json
          player_id: string
          updated_at?: string
        }
        Update: {
          attribute_points?: number
          base_score?: number
          created_at?: string
          final_score?: number
          id?: string
          imported_by?: string | null
          match_id?: string
          metric_scores?: Json
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_match_scores_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_market_values"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_match_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_metric_averages"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "player_match_scores_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          avatar_path: string | null
          created_at: string
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          league_id: string
          nickname: string | null
          player_code: string
          preferred_position: Database["public"]["Enums"]["player_position"]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          league_id: string
          nickname?: string | null
          player_code: string
          preferred_position: Database["public"]["Enums"]["player_position"]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          league_id?: string
          nickname?: string | null
          player_code?: string
          preferred_position?: Database["public"]["Enums"]["player_position"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      player_cards: {
        Row: {
          attribute_counts: Json | null
          attribute_total: number | null
          avatar_path: string | null
          card_rating: number | null
          career_average: number | null
          created_at: string | null
          display_name: string | null
          first_name: string | null
          id: string | null
          is_active: boolean | null
          last_name: string | null
          latest_score: number | null
          league_id: string | null
          market_value_gbp: number | null
          matches_played: number | null
          metric_averages: Json | null
          metric_card_stats: Json | null
          nickname: string | null
          player_code: string | null
          preferred_position:
            | Database["public"]["Enums"]["player_position"]
            | null
          updated_at: string | null
          weighted_performance_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      player_market_values: {
        Row: {
          card_rating: number | null
          career_average: number | null
          latest_score: number | null
          league_id: string | null
          market_value_gbp: number | null
          matches_played: number | null
          player_id: string | null
          weighted_performance_score: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      player_metric_averages: {
        Row: {
          card_stat: number | null
          career_average: number | null
          display_order: number | null
          league_id: string | null
          metric_code: string | null
          metric_label: string | null
          player_id: string | null
          scored_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      import_match_scores: {
        Args: { p_match_id: string; p_rows: Json }
        Returns: Json
      }
      is_league_admin: { Args: { p_league_id: string }; Returns: boolean }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      match_league_id: { Args: { p_match_id: string }; Returns: string }
      score_league_id: { Args: { p_score_id: string }; Returns: string }
      to_card_stat: { Args: { p_average: number }; Returns: number }
    }
    Enums: {
      attendance_status: "called_up" | "confirmed" | "played" | "absent"
      league_category: "football_7"
      league_status: "active" | "inactive"
      match_status: "draft" | "scheduled" | "played" | "scored" | "cancelled"
      member_role: "admin" | "member"
      player_position:
        | "GK"
        | "CB"
        | "LB"
        | "RB"
        | "CDM"
        | "CM"
        | "CAM"
        | "LW"
        | "RW"
        | "ST"
        | "UT"
      team_side: "home" | "away" | "unassigned"
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
      attendance_status: ["called_up", "confirmed", "played", "absent"],
      league_category: ["football_7"],
      league_status: ["active", "inactive"],
      match_status: ["draft", "scheduled", "played", "scored", "cancelled"],
      member_role: ["admin", "member"],
      player_position: [
        "GK",
        "CB",
        "LB",
        "RB",
        "CDM",
        "CM",
        "CAM",
        "LW",
        "RW",
        "ST",
        "UT",
      ],
      team_side: ["home", "away", "unassigned"],
    },
  },
} as const

