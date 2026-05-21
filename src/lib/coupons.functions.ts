import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/supabase-custom/auth-middleware";
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("forbidden");
}

// ---------- Admin: list coupons ----------
export const listCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("coupons" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      code: string;
      description: string | null;
      kind: "percent" | "fixed";
      value_pct: number | null;
      value_cents: number | null;
      min_amount_cents: number;
      max_uses: number | null;
      uses_count: number;
      active: boolean;
      valid_from: string;
      valid_until: string | null;
      applies_to_billing: string;
      created_at: string;
    }>;
  });

// ---------- Admin: upsert ----------
const couponInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, "Use apenas letras, números, _ e -"),
  description: z.string().max(200).nullable().optional(),
  kind: z.enum(["percent", "fixed"]),
  value_pct: z.number().min(0.01).max(100).nullable().optional(),
  value_cents: z.number().int().min(1).max(100_000_000).nullable().optional(),
  min_amount_cents: z.number().int().min(0).max(100_000_000).default(0),
  max_uses: z.number().int().min(1).max(1_000_000).nullable().optional(),
  active: z.boolean().default(true),
  valid_until: z.string().datetime().nullable().optional(),
  applies_to_billing: z.enum(["any", "monthly", "yearly"]).default("any"),
});

export const upsertCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => couponInput.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const payload = { ...data, code: data.code.toUpperCase() };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("coupons" as never)
        .update(payload as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin
      .from("coupons" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (ins as { id: string }).id };
  });

// ---------- Admin: delete ----------
export const deleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("coupons" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: redemptions for one coupon ----------
export const listCouponRedemptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ coupon_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("coupon_redemptions" as never)
      .select("*")
      .eq("coupon_id", data.coupon_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      coupon_id: string;
      order_id: string | null;
      customer_email: string | null;
      amount_cents_before: number;
      discount_cents: number;
      created_at: string;
    }>;
  });

// ---------- Public: validate ----------
const validateInput = z.object({
  code: z.string().min(1).max(40),
  amount_cents: z.number().int().min(1).max(100_000_000),
  billing: z.enum(["monthly", "yearly"]).default("monthly"),
});

export const validateCouponPublic = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => validateInput.parse(d))
  .handler(async ({ data }) => {
    const { data: res, error } = await supabaseAdmin.rpc("validate_coupon" as never, {
      _code: data.code,
      _amount_cents: data.amount_cents,
      _billing: data.billing,
    } as never);
    if (error) throw new Error(error.message);
    return res as {
      valid: boolean;
      reason?: string;
      coupon_id?: string;
      code?: string;
      kind?: "percent" | "fixed";
      value_pct?: number | null;
      value_cents?: number | null;
      discount_cents?: number;
      description?: string | null;
    };
  });
