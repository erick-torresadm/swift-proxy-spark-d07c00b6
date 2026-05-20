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
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          request: Json | null
          response: Json | null
          source: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          request?: Json | null
          response?: Json | null
          source: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          request?: Json | null
          response?: Json | null
          source?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      customer_proxies: {
        Row: {
          allocated_at: string
          created_at: string
          id: string
          ip_rotations_used: number
          order_id: string
          provider_order_id: string | null
          released_at: string | null
          rotations_reset_at: string
          status: Database["public"]["Enums"]["allocation_status"]
          stock_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allocated_at?: string
          created_at?: string
          id?: string
          ip_rotations_used?: number
          order_id: string
          provider_order_id?: string | null
          released_at?: string | null
          rotations_reset_at?: string
          status?: Database["public"]["Enums"]["allocation_status"]
          stock_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allocated_at?: string
          created_at?: string
          id?: string
          ip_rotations_used?: number
          order_id?: string
          provider_order_id?: string | null
          released_at?: string | null
          rotations_reset_at?: string
          status?: Database["public"]["Enums"]["allocation_status"]
          stock_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_proxies_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_proxies_provider_order_id_fkey"
            columns: ["provider_order_id"]
            isOneToOne: false
            referencedRelation: "provider_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_proxies_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "proxy_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_cents: number
          billing_cycle: string
          created_at: string
          current_period_end: string | null
          discount_cents: number
          grace_until: string | null
          id: string
          last_payment_check_at: string | null
          product_id: string
          promo_code: string | null
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          billing_cycle?: string
          created_at?: string
          current_period_end?: string | null
          discount_cents?: number
          grace_until?: string | null
          id?: string
          last_payment_check_at?: string | null
          product_id: string
          promo_code?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          billing_cycle?: string
          created_at?: string
          current_period_end?: string | null
          discount_cents?: number
          grace_until?: string | null
          id?: string
          last_payment_check_at?: string | null
          product_id?: string
          promo_code?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          block_size: number
          category: Database["public"]["Enums"]["product_category"]
          country_code: string
          created_at: string
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          description: string | null
          duration_days: number
          id: string
          ip_rotations_per_month: number
          name: string
          price_monthly_cents: number
          price_yearly_cents: number | null
          provider_tariff_id: string | null
          slug: string
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          block_size?: number
          category: Database["public"]["Enums"]["product_category"]
          country_code?: string
          created_at?: string
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          description?: string | null
          duration_days?: number
          id?: string
          ip_rotations_per_month?: number
          name: string
          price_monthly_cents: number
          price_yearly_cents?: number | null
          provider_tariff_id?: string | null
          slug: string
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          block_size?: number
          category?: Database["public"]["Enums"]["product_category"]
          country_code?: string
          created_at?: string
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          description?: string | null
          duration_days?: number
          id?: string
          ip_rotations_per_month?: number
          name?: string
          price_monthly_cents?: number
          price_yearly_cents?: number | null
          provider_tariff_id?: string | null
          slug?: string
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_orders: {
        Row: {
          auto_renew: boolean
          cost_cents: number | null
          country_code: string | null
          created_at: string
          expires_at: string | null
          external_order_id: string | null
          id: string
          product_id: string | null
          purchased_at: string
          quantity: number
          raw_payload: Json | null
          status: Database["public"]["Enums"]["provider_order_status"]
        }
        Insert: {
          auto_renew?: boolean
          cost_cents?: number | null
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          external_order_id?: string | null
          id?: string
          product_id?: string | null
          purchased_at?: string
          quantity: number
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["provider_order_status"]
        }
        Update: {
          auto_renew?: boolean
          cost_cents?: number | null
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          external_order_id?: string | null
          id?: string
          product_id?: string | null
          purchased_at?: string
          quantity?: number
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["provider_order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "provider_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      proxy_stock: {
        Row: {
          country_code: string | null
          created_at: string
          expires_at: string | null
          external_proxy_id: string | null
          host: string
          id: string
          password: string | null
          port: number
          product_id: string
          protocol: string | null
          provider_order_id: string | null
          purchased_at: string
          status: Database["public"]["Enums"]["stock_status"]
          updated_at: string
          username: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          external_proxy_id?: string | null
          host: string
          id?: string
          password?: string | null
          port: number
          product_id: string
          protocol?: string | null
          provider_order_id?: string | null
          purchased_at?: string
          status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          expires_at?: string | null
          external_proxy_id?: string | null
          host?: string
          id?: string
          password?: string | null
          port?: number
          product_id?: string
          protocol?: string | null
          provider_order_id?: string | null
          purchased_at?: string
          status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proxy_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxy_stock_provider_order_id_fkey"
            columns: ["provider_order_id"]
            isOneToOne: false
            referencedRelation: "provider_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      restock_rules: {
        Row: {
          batch_quantity: number
          created_at: string
          enabled: boolean
          id: string
          min_stock: number
          product_id: string
          updated_at: string
        }
        Insert: {
          batch_quantity?: number
          created_at?: string
          enabled?: boolean
          id?: string
          min_stock?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          batch_quantity?: number
          created_at?: string
          enabled?: boolean
          id?: string
          min_stock?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restock_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      release_expired_grace_proxies: {
        Args: never
        Returns: {
          released_count: number
        }[]
      }
    }
    Enums: {
      allocation_status: "active" | "grace" | "released" | "cancelled"
      app_role: "admin" | "customer"
      delivery_mode: "stock" | "direct"
      order_status:
        | "pending"
        | "paid"
        | "past_due"
        | "grace"
        | "cancelled"
        | "expired"
      product_category: "ipv6" | "ipv6_fb" | "ipv4" | "isp"
      provider_order_status: "pending" | "active" | "expired" | "failed"
      stock_status: "available" | "allocated" | "expired" | "removed"
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
      allocation_status: ["active", "grace", "released", "cancelled"],
      app_role: ["admin", "customer"],
      delivery_mode: ["stock", "direct"],
      order_status: [
        "pending",
        "paid",
        "past_due",
        "grace",
        "cancelled",
        "expired",
      ],
      product_category: ["ipv6", "ipv6_fb", "ipv4", "isp"],
      provider_order_status: ["pending", "active", "expired", "failed"],
      stock_status: ["available", "allocated", "expired", "removed"],
    },
  },
} as const
