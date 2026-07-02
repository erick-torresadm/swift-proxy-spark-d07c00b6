// Config and pricing for checkout order-bumps.
// Kept as a pure module so both the client (for preview) and the server
// (as source of truth) compute exactly the same amounts.

export type Bumps = {
  /** Extra proxies added to the main subscription quantity (recurring). */
  extraProxies?: number;
  /** One-time prepay of N extra months at a discount. Only offered when billing=monthly. */
  extendMonths?: number;
  /** Add VIP support one-time fee on first invoice. */
  vipSupport?: boolean;
  /** One-time assisted-setup fee on first invoice. */
  setupAssist?: boolean;
};

export const BUMP_CONFIG = {
  extraProxies: {
    /** Discount applied to the unit price of the additional proxies (recurring). */
    discount: 0.2,
    defaultCount: 3,
  },
  extendMonths: {
    /** Discount applied to the monthly price when prepaying extra months. */
    discount: 0.3,
    months: 6,
  },
  vipSupport: {
    // charged one-time on the first invoice; subsequent months are handled
    // manually by ops (kept simple — no separate recurring product yet).
    firstInvoiceCents: 1900,
  },
  setupAssist: {
    oneTimeCents: 9700,
  },
} as const;

/**
 * Extra units to add to the main subscription's quantity.
 * Uses the same recurring unit price → PostgreSQL orders.quantity stays in sync
 * with allocation, and the Stripe subscription bills the extra units forever.
 * The discount is applied by generating a coupon or (simpler) by lowering the
 * effective unit price — we chose the simplest path: quantity increase at full
 * price + a proportional one-time credit on the first invoice.
 */
export function extraProxyOneTimeDiscountCents(
  extraProxies: number,
  unitMonthlyCents: number,
): number {
  if (!extraProxies || extraProxies <= 0) return 0;
  return Math.round(extraProxies * unitMonthlyCents * BUMP_CONFIG.extraProxies.discount);
}

export function extendMonthsChargeCents(
  months: number,
  unitMonthlyCents: number,
  quantity: number,
): number {
  if (!months || months <= 0) return 0;
  const gross = months * unitMonthlyCents * quantity;
  return Math.round(gross * (1 - BUMP_CONFIG.extendMonths.discount));
}

/** Sums every one-time bump amount that hits the first invoice. */
export function computeBumpsTotals(opts: {
  billing: "monthly" | "yearly";
  unitMonthlyCents: number;
  quantity: number;
  bumps: Bumps;
}) {
  const { billing, unitMonthlyCents, quantity, bumps } = opts;
  const extraProxies = Math.max(0, Math.min(50, bumps.extraProxies ?? 0));
  const extendMonths =
    billing === "monthly" ? Math.max(0, Math.min(24, bumps.extendMonths ?? 0)) : 0;

  const extraProxiesRecurringCents = extraProxies * unitMonthlyCents;
  const extraProxiesFirstInvoiceCreditCents = extraProxyOneTimeDiscountCents(
    extraProxies,
    unitMonthlyCents,
  );
  const extendMonthsCents = extendMonthsChargeCents(extendMonths, unitMonthlyCents, quantity);
  const vipSupportCents = bumps.vipSupport ? BUMP_CONFIG.vipSupport.firstInvoiceCents : 0;
  const setupAssistCents = bumps.setupAssist ? BUMP_CONFIG.setupAssist.oneTimeCents : 0;

  return {
    extraProxies,
    extendMonths,
    extraProxiesRecurringCents,
    extraProxiesFirstInvoiceCreditCents,
    extendMonthsCents,
    vipSupportCents,
    setupAssistCents,
    /** Sum of everything added on top of the base subscription's first invoice. */
    firstInvoiceExtraCents:
      extendMonthsCents + vipSupportCents + setupAssistCents,
  };
}
