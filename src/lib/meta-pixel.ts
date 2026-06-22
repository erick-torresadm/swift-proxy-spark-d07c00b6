// Meta Pixel (client-side) helpers
// Pixel ID is public — it's already exposed in the browser script tag.
export const META_PIXEL_ID = "1916111822410804";

type FbqFn = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

function fbq(...args: unknown[]) {
  if (typeof window === "undefined") return;
  if (!window.fbq) return; // pixel not loaded yet
  (window.fbq as FbqFn)(...args);
}

export function pixelTrack(
  event: string,
  params?: Record<string, unknown>,
  opts?: { eventID?: string },
) {
  fbq("track", event, params ?? {}, opts ?? {});
}

export function pixelTrackCustom(
  event: string,
  params?: Record<string, unknown>,
  opts?: { eventID?: string },
) {
  fbq("trackCustom", event, params ?? {}, opts ?? {});
}

// Stable event id used to deduplicate Pixel + CAPI for the same conversion.
export function purchaseEventId(orderId: string) {
  return `purchase_${orderId}`;
}
