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
      blog_ads: {
        Row: {
          active: boolean
          click_count: number
          created_at: string
          cta_label: string | null
          description: string | null
          ends_at: string | null
          html: string | null
          id: string
          image_url: string | null
          impression_count: number
          link_url: string
          position: Database["public"]["Enums"]["blog_ad_position"]
          sort_order: number
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          click_count?: number
          created_at?: string
          cta_label?: string | null
          description?: string | null
          ends_at?: string | null
          html?: string | null
          id?: string
          image_url?: string | null
          impression_count?: number
          link_url: string
          position: Database["public"]["Enums"]["blog_ad_position"]
          sort_order?: number
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          click_count?: number
          created_at?: string
          cta_label?: string | null
          description?: string | null
          ends_at?: string | null
          html?: string | null
          id?: string
          image_url?: string | null
          impression_count?: number
          link_url?: string
          position?: Database["public"]["Enums"]["blog_ad_position"]
          sort_order?: number
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      blog_ingest_nonces: {
        Row: {
          created_at: string
          nonce: string
        }
        Insert: {
          created_at?: string
          nonce: string
        }
        Update: {
          created_at?: string
          nonce?: string
        }
        Relationships: []
      }
      blog_ingest_rate: {
        Row: {
          count: number
          ip: string
          window_start: string
        }
        Insert: {
          count?: number
          ip: string
          window_start: string
        }
        Update: {
          count?: number
          ip?: string
          window_start?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          assigned_admin_id: string | null
          created_at: string
          guest_email: string | null
          guest_ip: string | null
          guest_name: string | null
          guest_phone: string | null
          guest_token: string | null
          id: string
          last_message_at: string
          last_message_preview: string | null
          status: Database["public"]["Enums"]["chat_status"]
          subject: string | null
          unread_admin: number
          unread_client: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_admin_id?: string | null
          created_at?: string
          guest_email?: string | null
          guest_ip?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_token?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          status?: Database["public"]["Enums"]["chat_status"]
          subject?: string | null
          unread_admin?: number
          unread_client?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_admin_id?: string | null
          created_at?: string
          guest_email?: string | null
          guest_ip?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_token?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          status?: Database["public"]["Enums"]["chat_status"]
          subject?: string | null
          unread_admin?: number
          unread_client?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender: Database["public"]["Enums"]["chat_sender"]
          sender_user_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender: Database["public"]["Enums"]["chat_sender"]
          sender_user_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender?: Database["public"]["Enums"]["chat_sender"]
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          amount_cents_before: number
          coupon_id: string
          created_at: string
          customer_email: string | null
          discount_cents: number
          id: string
          order_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_cents_before: number
          coupon_id: string
          created_at?: string
          customer_email?: string | null
          discount_cents: number
          id?: string
          order_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_cents_before?: number
          coupon_id?: string
          created_at?: string
          customer_email?: string | null
          discount_cents?: number
          id?: string
          order_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          applies_to_billing: string
          code: string
          created_at: string
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["coupon_kind"]
          max_uses: number | null
          min_amount_cents: number
          stripe_coupon_id: string | null
          updated_at: string
          uses_count: number
          valid_from: string
          valid_until: string | null
          value_cents: number | null
          value_pct: number | null
        }
        Insert: {
          active?: boolean
          applies_to_billing?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["coupon_kind"]
          max_uses?: number | null
          min_amount_cents?: number
          stripe_coupon_id?: string | null
          updated_at?: string
          uses_count?: number
          valid_from?: string
          valid_until?: string | null
          value_cents?: number | null
          value_pct?: number | null
        }
        Update: {
          active?: boolean
          applies_to_billing?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["coupon_kind"]
          max_uses?: number | null
          min_amount_cents?: number
          stripe_coupon_id?: string | null
          updated_at?: string
          uses_count?: number
          valid_from?: string
          valid_until?: string | null
          value_cents?: number | null
          value_pct?: number | null
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
      dunning_emails: {
        Row: {
          bounced_at: string | null
          campaign: string
          clicked_at: string | null
          complained_at: string | null
          converted_at: string | null
          delivered_at: string | null
          email: string | null
          error_message: string | null
          id: string
          opened_at: string | null
          order_id: string
          queue_id: string | null
          resend_id: string | null
          sent_at: string
          stage: string
          trigger: string
          user_id: string
        }
        Insert: {
          bounced_at?: string | null
          campaign: string
          clicked_at?: string | null
          complained_at?: string | null
          converted_at?: string | null
          delivered_at?: string | null
          email?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          order_id: string
          queue_id?: string | null
          resend_id?: string | null
          sent_at?: string
          stage: string
          trigger?: string
          user_id: string
        }
        Update: {
          bounced_at?: string | null
          campaign?: string
          clicked_at?: string | null
          complained_at?: string | null
          converted_at?: string | null
          delivered_at?: string | null
          email?: string | null
          error_message?: string | null
          id?: string
          opened_at?: string | null
          order_id?: string
          queue_id?: string | null
          resend_id?: string | null
          sent_at?: string
          stage?: string
          trigger?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dunning_emails_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          attempts: number
          created_at: string
          from_email: string | null
          html: string
          id: string
          last_error: string | null
          max_attempts: number
          metadata: Json | null
          priority: number
          reply_to: string | null
          resend_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string
          tags: Json | null
          text_body: string | null
          to_email: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          from_email?: string | null
          html: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          metadata?: Json | null
          priority?: number
          reply_to?: string | null
          resend_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject: string
          tags?: Json | null
          text_body?: string | null
          to_email: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          from_email?: string | null
          html?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          metadata?: Json | null
          priority?: number
          reply_to?: string | null
          resend_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          tags?: Json | null
          text_body?: string | null
          to_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          currency: string
          fetched_at: string
          id: string
          rate_brl: number
          source: string | null
        }
        Insert: {
          currency: string
          fetched_at?: string
          id?: string
          rate_brl: number
          source?: string | null
        }
        Update: {
          currency?: string
          fetched_at?: string
          id?: string
          rate_brl?: number
          source?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string | null
          email_status: Database["public"]["Enums"]["notification_status"]
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string | null
          metadata: Json | null
          push_status: Database["public"]["Enums"]["notification_status"]
          read_at: string | null
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key?: string | null
          email_status?: Database["public"]["Enums"]["notification_status"]
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          metadata?: Json | null
          push_status?: Database["public"]["Enums"]["notification_status"]
          read_at?: string | null
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          email_status?: Database["public"]["Enums"]["notification_status"]
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string | null
          metadata?: Json | null
          push_status?: Database["public"]["Enums"]["notification_status"]
          read_at?: string | null
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_cents: number
          billing_cycle: string
          bumps: Json
          created_at: string
          current_period_end: string | null
          customer_email: string | null
          customer_name: string | null
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
          upsell_offered_at: string | null
          upsell_order_id: string | null
          upsell_taken: boolean
          user_id: string | null
          vip_support: boolean
        }
        Insert: {
          amount_cents: number
          billing_cycle?: string
          bumps?: Json
          created_at?: string
          current_period_end?: string | null
          customer_email?: string | null
          customer_name?: string | null
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
          upsell_offered_at?: string | null
          upsell_order_id?: string | null
          upsell_taken?: boolean
          user_id?: string | null
          vip_support?: boolean
        }
        Update: {
          amount_cents?: number
          billing_cycle?: string
          bumps?: Json
          created_at?: string
          current_period_end?: string | null
          customer_email?: string | null
          customer_name?: string | null
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
          upsell_offered_at?: string | null
          upsell_order_id?: string | null
          upsell_taken?: boolean
          user_id?: string | null
          vip_support?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_upsell_order_id_fkey"
            columns: ["upsell_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      post_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          parent_id: string | null
          post_id: string
          status: Database["public"]["Enums"]["comment_status"]
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["comment_status"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["comment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tag_map: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tag_map_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tag_map_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "post_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      post_translations: {
        Row: {
          content_md: string
          cover_image_url: string | null
          created_at: string
          display_author_name: string | null
          excerpt: string | null
          faq: Json
          id: string
          keyword_primary: string | null
          keywords_secondary: Json
          locale: string
          meta_description: string | null
          meta_title: string | null
          post_id: string
          reading_time_minutes: number | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content_md: string
          cover_image_url?: string | null
          created_at?: string
          display_author_name?: string | null
          excerpt?: string | null
          faq?: Json
          id?: string
          keyword_primary?: string | null
          keywords_secondary?: Json
          locale: string
          meta_description?: string | null
          meta_title?: string | null
          post_id: string
          reading_time_minutes?: number | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content_md?: string
          cover_image_url?: string | null
          created_at?: string
          display_author_name?: string | null
          excerpt?: string | null
          faq?: Json
          id?: string
          keyword_primary?: string | null
          keywords_secondary?: Json
          locale?: string
          meta_description?: string | null
          meta_title?: string | null
          post_id?: string
          reading_time_minutes?: number | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_translations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string | null
          auto_publish_at: string | null
          canonical_url: string | null
          category_id: string | null
          content_md: string
          cover_image_url: string | null
          created_at: string
          display_author_name: string
          excerpt: string | null
          faq: Json
          id: string
          keyword_primary: string | null
          keywords_secondary: string[]
          meta_description: string | null
          meta_title: string | null
          noindex: boolean
          published_at: string | null
          reading_time_minutes: number
          slug: string
          source: string | null
          status: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_id?: string | null
          auto_publish_at?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content_md?: string
          cover_image_url?: string | null
          created_at?: string
          display_author_name?: string
          excerpt?: string | null
          faq?: Json
          id?: string
          keyword_primary?: string | null
          keywords_secondary?: string[]
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          published_at?: string | null
          reading_time_minutes?: number
          slug: string
          source?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_id?: string | null
          auto_publish_at?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content_md?: string
          cover_image_url?: string | null
          created_at?: string
          display_author_name?: string
          excerpt?: string | null
          faq?: Json
          id?: string
          keyword_primary?: string | null
          keywords_secondary?: string[]
          meta_description?: string | null
          meta_title?: string | null
          noindex?: boolean
          published_at?: string | null
          reading_time_minutes?: number
          slug?: string
          source?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "post_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_rules: {
        Row: {
          auto_sync_stripe: boolean
          created_at: string
          id: string
          markup_pct: number
          min_margin_pct: number
          product_id: string
          updated_at: string
        }
        Insert: {
          auto_sync_stripe?: boolean
          created_at?: string
          id?: string
          markup_pct?: number
          min_margin_pct?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          auto_sync_stripe?: boolean
          created_at?: string
          id?: string
          markup_pct?: number
          min_margin_pct?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          auto_renew_at_provider: boolean
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
          notify_expiry_days: number[]
          price_monthly_cents: number
          price_yearly_cents: number | null
          provider: string
          provider_tariff_id: string | null
          restock_threshold: number
          slug: string
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          stripe_product_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_renew_at_provider?: boolean
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
          notify_expiry_days?: number[]
          price_monthly_cents: number
          price_yearly_cents?: number | null
          provider?: string
          provider_tariff_id?: string | null
          restock_threshold?: number
          slug: string
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_renew_at_provider?: boolean
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
          notify_expiry_days?: number[]
          price_monthly_cents?: number
          price_yearly_cents?: number | null
          provider?: string
          provider_tariff_id?: string | null
          restock_threshold?: number
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
      programmatic_pages: {
        Row: {
          active: boolean
          content_md: string
          created_at: string
          excerpt: string | null
          group_name: string | null
          id: string
          keyword_primary: string | null
          keywords_secondary: string[]
          meta_description: string | null
          meta_title: string | null
          slug: string
          title: string
          updated_at: string
          variables: Json
          view_count: number
        }
        Insert: {
          active?: boolean
          content_md?: string
          created_at?: string
          excerpt?: string | null
          group_name?: string | null
          id?: string
          keyword_primary?: string | null
          keywords_secondary?: string[]
          meta_description?: string | null
          meta_title?: string | null
          slug: string
          title: string
          updated_at?: string
          variables?: Json
          view_count?: number
        }
        Update: {
          active?: boolean
          content_md?: string
          created_at?: string
          excerpt?: string | null
          group_name?: string | null
          id?: string
          keyword_primary?: string | null
          keywords_secondary?: string[]
          meta_description?: string | null
          meta_title?: string | null
          slug?: string
          title?: string
          updated_at?: string
          variables?: Json
          view_count?: number
        }
        Relationships: []
      }
      provider_balance_snapshots: {
        Row: {
          balance_usd: number
          fetched_at: string
          id: string
          provider: string
        }
        Insert: {
          balance_usd: number
          fetched_at?: string
          id?: string
          provider?: string
        }
        Update: {
          balance_usd?: number
          fetched_at?: string
          id?: string
          provider?: string
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
          provider: string
          purchased_at: string
          quantity: number
          raw_payload: Json | null
          status: Database["public"]["Enums"]["provider_order_status"]
          triggered_by_order_id: string | null
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
          provider?: string
          purchased_at?: string
          quantity: number
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["provider_order_status"]
          triggered_by_order_id?: string | null
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
          provider?: string
          purchased_at?: string
          quantity?: number
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["provider_order_status"]
          triggered_by_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_settings: {
        Row: {
          alert_email: string | null
          auto_purchase_enabled: boolean
          dry_run: boolean
          id: string
          min_balance_usd: number
          provider: string
          updated_at: string
        }
        Insert: {
          alert_email?: string | null
          auto_purchase_enabled?: boolean
          dry_run?: boolean
          id?: string
          min_balance_usd?: number
          provider?: string
          updated_at?: string
        }
        Update: {
          alert_email?: string | null
          auto_purchase_enabled?: boolean
          dry_run?: boolean
          id?: string
          min_balance_usd?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      proxy_health_events: {
        Row: {
          details: Json | null
          detected_at: string
          event: string
          external_proxy_id: string | null
          id: string
          resolved_at: string | null
          stock_id: string | null
        }
        Insert: {
          details?: Json | null
          detected_at?: string
          event: string
          external_proxy_id?: string | null
          id?: string
          resolved_at?: string | null
          stock_id?: string | null
        }
        Update: {
          details?: Json | null
          detected_at?: string
          event?: string
          external_proxy_id?: string | null
          id?: string
          resolved_at?: string | null
          stock_id?: string | null
        }
        Relationships: []
      }
      proxy_metrics: {
        Row: {
          country_seen: string | null
          error: string | null
          id: string
          latency_ms: number | null
          ok: boolean
          source: string
          stock_id: string
          ts: string
        }
        Insert: {
          country_seen?: string | null
          error?: string | null
          id?: string
          latency_ms?: number | null
          ok: boolean
          source?: string
          stock_id: string
          ts?: string
        }
        Update: {
          country_seen?: string | null
          error?: string | null
          id?: string
          latency_ms?: number | null
          ok?: boolean
          source?: string
          stock_id?: string
          ts?: string
        }
        Relationships: []
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
            foreignKeyName: "proxy_stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
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
      purchase_locks: {
        Row: {
          created_at: string
          locked_by: string | null
          locked_until: string
          product_id: string
        }
        Insert: {
          created_at?: string
          locked_by?: string | null
          locked_until: string
          product_id: string
        }
        Update: {
          created_at?: string
          locked_by?: string | null
          locked_until?: string
          product_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failed_count: number
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failed_count?: number
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failed_count?: number
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_hits: {
        Row: {
          bucket: string
          count: number
          key: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          key: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "restock_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          amount_cents: number | null
          charge_id: string | null
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_id: string | null
          id: string
          invoice_id: string | null
          livemode: boolean
          occurred_at: string
          order_id: string | null
          payment_intent_id: string | null
          processed_at: string
          raw: Json | null
          reason: string | null
          session_id: string | null
          status: string | null
          subscription_id: string | null
          type: string
        }
        Insert: {
          amount_cents?: number | null
          charge_id?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_id?: string | null
          id: string
          invoice_id?: string | null
          livemode?: boolean
          occurred_at?: string
          order_id?: string | null
          payment_intent_id?: string | null
          processed_at?: string
          raw?: Json | null
          reason?: string | null
          session_id?: string | null
          status?: string | null
          subscription_id?: string | null
          type: string
        }
        Update: {
          amount_cents?: number | null
          charge_id?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          livemode?: boolean
          occurred_at?: string
          order_id?: string | null
          payment_intent_id?: string | null
          processed_at?: string
          raw?: Json | null
          reason?: string | null
          session_id?: string | null
          status?: string | null
          subscription_id?: string | null
          type?: string
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
      products_public: {
        Row: {
          active: boolean | null
          block_size: number | null
          category: Database["public"]["Enums"]["product_category"] | null
          country_code: string | null
          delivery_mode: Database["public"]["Enums"]["delivery_mode"] | null
          description: string | null
          duration_days: number | null
          id: string | null
          ip_rotations_per_month: number | null
          name: string | null
          price_monthly_cents: number | null
          price_yearly_cents: number | null
          slug: string | null
        }
        Insert: {
          active?: boolean | null
          block_size?: number | null
          category?: Database["public"]["Enums"]["product_category"] | null
          country_code?: string | null
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"] | null
          description?: string | null
          duration_days?: number | null
          id?: string | null
          ip_rotations_per_month?: number | null
          name?: string | null
          price_monthly_cents?: number | null
          price_yearly_cents?: number | null
          slug?: string | null
        }
        Update: {
          active?: boolean | null
          block_size?: number | null
          category?: Database["public"]["Enums"]["product_category"] | null
          country_code?: string | null
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"] | null
          description?: string | null
          duration_days?: number | null
          id?: string | null
          ip_rotations_per_month?: number | null
          name?: string | null
          price_monthly_cents?: number | null
          price_yearly_cents?: number | null
          slug?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      bump_blog_ingest_rate: {
        Args: { _ip: string; _window_minutes?: number }
        Returns: number
      }
      bump_rate_hit: {
        Args: {
          _bucket: string
          _key: string
          _limit: number
          _window_seconds: number
        }
        Returns: {
          allowed: boolean
          count: number
          retry_after: number
        }[]
      }
      can_manage_blog: { Args: { _user_id: string }; Returns: boolean }
      can_moderate_comments: { Args: { _user_id: string }; Returns: boolean }
      get_db_total_size: { Args: never; Returns: number }
      get_db_usage: {
        Args: never
        Returns: {
          dead_rows: number
          row_count: number
          table_name: string
          total_size_bytes: number
          total_size_pretty: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_coupon_uses: {
        Args: { _coupon_id: string }
        Returns: undefined
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      pick_consolidated_stock: {
        Args: { _limit: number; _product_ids: string[] }
        Returns: {
          occupancy: number
          provider_order_id: string
          stock_id: string
        }[]
      }
      prune_proxy_metrics: { Args: never; Returns: undefined }
      release_expired_grace_proxies: {
        Args: never
        Returns: {
          released_count: number
        }[]
      }
      run_cleanup: {
        Args: {
          _audit_days?: number
          _closed_chats_days?: number
          _metrics_days?: number
          _notifications_days?: number
          _vacuum?: boolean
        }
        Returns: Json
      }
      validate_coupon: {
        Args: { _amount_cents: number; _billing?: string; _code: string }
        Returns: Json
      }
    }
    Enums: {
      allocation_status: "active" | "grace" | "released" | "cancelled"
      app_role: "admin" | "customer" | "editor" | "moderator"
      blog_ad_position: "top" | "middle" | "bottom"
      chat_sender: "client" | "admin" | "system"
      chat_status: "waiting" | "active" | "closed"
      comment_status: "visible" | "hidden" | "flagged"
      coupon_kind: "percent" | "fixed"
      delivery_mode: "stock" | "direct"
      notification_kind:
        | "expiring_soon"
        | "expired"
        | "payment_failed"
        | "payment_succeeded"
        | "grace_ending"
        | "rotation_reset"
        | "promo"
        | "system"
      notification_status: "pending" | "sent" | "failed" | "read"
      order_status:
        | "pending"
        | "paid"
        | "past_due"
        | "grace"
        | "cancelled"
        | "expired"
      post_status: "draft" | "published" | "archived"
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
      app_role: ["admin", "customer", "editor", "moderator"],
      blog_ad_position: ["top", "middle", "bottom"],
      chat_sender: ["client", "admin", "system"],
      chat_status: ["waiting", "active", "closed"],
      comment_status: ["visible", "hidden", "flagged"],
      coupon_kind: ["percent", "fixed"],
      delivery_mode: ["stock", "direct"],
      notification_kind: [
        "expiring_soon",
        "expired",
        "payment_failed",
        "payment_succeeded",
        "grace_ending",
        "rotation_reset",
        "promo",
        "system",
      ],
      notification_status: ["pending", "sent", "failed", "read"],
      order_status: [
        "pending",
        "paid",
        "past_due",
        "grace",
        "cancelled",
        "expired",
      ],
      post_status: ["draft", "published", "archived"],
      product_category: ["ipv6", "ipv6_fb", "ipv4", "isp"],
      provider_order_status: ["pending", "active", "expired", "failed"],
      stock_status: ["available", "allocated", "expired", "removed"],
    },
  },
} as const
