import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";

export const IPV6_BR_SLUGS = ["ipv6-br", "ipv6-fb-br", "ipv6-rot-br"] as const;

export type ParsedProxyLine = {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  raw: string;
};

export async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

/**
 * Tolerant parser: accepts one proxy per line, in any of:
 *   host:port
 *   host:port:user:pass
 *   user:pass@host:port
 *   host,port,user,pass  (comma or semicolon separated)
 * Ignores blank lines and lines starting with '#'.
 */
export function parseManualProxyList(input: string): { rows: ParsedProxyLine[]; errors: string[] } {
  const rows: ParsedProxyLine[] = [];
  const errors: string[] = [];
  const lines = input.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    let host: string | null = null;
    let port: number | null = null;
    let user: string | null = null;
    let pass: string | null = null;

    if (line.includes("@")) {
      const [creds, hostPort] = line.split("@");
      const [u, p] = creds.split(":");
      const [h, prt] = hostPort.split(":");
      user = u ?? null;
      pass = p ?? null;
      host = h ?? null;
      port = prt ? Number(prt) : null;
    } else {
      const parts = line.split(/[:,;\s]+/).filter(Boolean);
      if (parts.length >= 2) {
        host = parts[0];
        port = Number(parts[1]);
        if (parts.length >= 4) {
          user = parts[2];
          pass = parts[3];
        }
      }
    }

    if (!host || !port || Number.isNaN(port) || port < 1 || port > 65535) {
      errors.push(`inválido: "${line}"`);
      continue;
    }
    rows.push({ host, port, username: user, password: pass, raw: line });
  }
  return { rows, errors };
}