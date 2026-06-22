// Meta Conversions API (server-side). Mirrors Pixel events so we don't lose
// conversions to ad-blockers, iOS ITP, etc. Always send the same event_id you
// fired client-side so Meta deduplicates.
import { createHash } from "crypto";
import { META_PIXEL_ID } from "./meta-pixel";

const CAPI_URL = `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events`;

function sha256(v: string) {
  return createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
}

type UserData = {
  email?: string | null;
  name?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null; // _fbp cookie
  fbc?: string | null; // _fbc cookie
};

type CapiEvent = {
  event_name: string;
  event_id?: string;
  event_time?: number; // unix seconds
  event_source_url?: string;
  action_source?: "website" | "system_generated";
  user_data: UserData;
  custom_data?: Record<string, unknown>;
};

function buildUserData(u: UserData) {
  const out: Record<string, unknown> = {};
  if (u.email) out.em = [sha256(u.email)];
  if (u.name) {
    const parts = u.name.trim().split(/\s+/);
    out.fn = [sha256(parts[0])];
    if (parts.length > 1) out.ln = [sha256(parts.slice(1).join(" "))];
  }
  if (u.ip) out.client_ip_address = u.ip;
  if (u.userAgent) out.client_user_agent = u.userAgent;
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  return out;
}

export async function sendCapiEvent(ev: CapiEvent): Promise<void> {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) {
    // eslint-disable-next-line no-console
    console.warn("[meta-capi] META_CAPI_ACCESS_TOKEN not set; skipping");
    return;
  }
  const payload = {
    data: [
      {
        event_name: ev.event_name,
        event_time: ev.event_time ?? Math.floor(Date.now() / 1000),
        event_id: ev.event_id,
        event_source_url: ev.event_source_url,
        action_source: ev.action_source ?? "website",
        user_data: buildUserData(ev.user_data),
        custom_data: ev.custom_data ?? {},
      },
    ],
  };
  try {
    const res = await fetch(`${CAPI_URL}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      // eslint-disable-next-line no-console
      console.error("[meta-capi] failed", res.status, body);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[meta-capi] error", err);
  }
}
