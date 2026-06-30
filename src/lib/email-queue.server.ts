// Server-only: worker que drena email_queue respeitando os limites do
// plano gratuito do Resend (3000/mês, 100/dia, 2 req/s).
import { supabaseAdmin } from "@/lib/supabase-custom/admin.server";
import { RESEND_FREE_LIMITS, sendNow } from "@/lib/email.server";

interface ProcessResult {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
  rateLimited: boolean;
  dailyCount: number;
  monthlyCount: number;
  remainingToday: number;
  remainingMonth: number;
  errors: Array<{ id: string; error: string }>;
}

interface QueueRow {
  id: string;
  to_email: string;
  subject: string;
  html: string;
  text_body: string | null;
  from_email: string | null;
  reply_to: string | null;
  tags: Array<{ name: string; value: string }> | null;
  metadata: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
}

function startOfDayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonthUtc(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function countSent(sinceIso: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("email_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", sinceIso);
  return count ?? 0;
}

async function updateDunningResendId(queueId: string, realResendId: string | undefined) {
  if (!realResendId) return;
  await supabaseAdmin
    .from("dunning_emails")
    .update({ resend_id: realResendId })
    .eq("queue_id", queueId);
}

export async function processEmailQueue(): Promise<ProcessResult> {
  const result: ProcessResult = {
    scanned: 0, sent: 0, failed: 0, skipped: 0,
    rateLimited: false,
    dailyCount: 0, monthlyCount: 0,
    remainingToday: 0, remainingMonth: 0,
    errors: [],
  };

  const dailyStart = startOfDayUtc();
  const monthStart = startOfMonthUtc();
  let dailyCount = await countSent(dailyStart);
  let monthlyCount = await countSent(monthStart);
  result.dailyCount = dailyCount;
  result.monthlyCount = monthlyCount;
  result.remainingToday = Math.max(0, RESEND_FREE_LIMITS.daily - dailyCount);
  result.remainingMonth = Math.max(0, RESEND_FREE_LIMITS.monthly - monthlyCount);

  if (dailyCount >= RESEND_FREE_LIMITS.daily || monthlyCount >= RESEND_FREE_LIMITS.monthly) {
    result.rateLimited = true;
    return result;
  }

  const budget = Math.min(
    RESEND_FREE_LIMITS.batchPerRun,
    RESEND_FREE_LIMITS.daily - dailyCount,
    RESEND_FREE_LIMITS.monthly - monthlyCount,
  );
  if (budget <= 0) {
    result.rateLimited = true;
    return result;
  }

  // Pega pendentes prontas para envio
  const { data: rows, error } = await supabaseAdmin
    .from("email_queue")
    .select("id, to_email, subject, html, text_body, from_email, reply_to, tags, metadata, attempts, max_attempts")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("priority", { ascending: true })
    .order("scheduled_at", { ascending: true })
    .limit(budget);
  if (error) {
    result.errors.push({ id: "*", error: error.message });
    return result;
  }

  for (const row of (rows ?? []) as QueueRow[]) {
    result.scanned++;
    if (dailyCount >= RESEND_FREE_LIMITS.daily || monthlyCount >= RESEND_FREE_LIMITS.monthly) {
      result.rateLimited = true;
      break;
    }

    // Lock otimista — marca como "sending" para evitar reentrância
    const { data: locked } = await supabaseAdmin
      .from("email_queue")
      .update({ status: "sending", attempts: row.attempts + 1 })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .single();
    if (!locked) { result.skipped++; continue; }

    const send = await sendNow({
      to: row.to_email,
      subject: row.subject,
      html: row.html,
      text: row.text_body ?? undefined,
      from: row.from_email ?? undefined,
      replyTo: row.reply_to ?? undefined,
      tags: row.tags ?? undefined,
    });

    if (send.ok) {
      const sentAt = new Date().toISOString();
      await supabaseAdmin
        .from("email_queue")
        .update({
          status: "sent",
          sent_at: sentAt,
          resend_id: send.id ?? null,
          last_error: null,
        })
        .eq("id", row.id);
      await updateDunningResendId(row.metadata, send.id);
      result.sent++;
      dailyCount++;
      monthlyCount++;
    } else {
      const shouldRetry = row.attempts + 1 < row.max_attempts;
      // Backoff exponencial: 2^attempts minutos (máx 60min)
      const delayMin = Math.min(60, Math.pow(2, row.attempts + 1));
      const nextAt = new Date(Date.now() + delayMin * 60_000).toISOString();
      await supabaseAdmin
        .from("email_queue")
        .update({
          status: shouldRetry ? "pending" : "failed",
          scheduled_at: shouldRetry ? nextAt : new Date().toISOString(),
          last_error: send.error ?? `HTTP ${send.status}`,
        })
        .eq("id", row.id);
      result.failed++;
      result.errors.push({ id: row.id, error: send.error ?? `HTTP ${send.status}` });
      // Se o erro foi rate-limit (429), pára o batch
      if (send.status === 429) {
        result.rateLimited = true;
        break;
      }
    }

    // Espaçamento entre envios para ficar abaixo de 2 req/s
    await new Promise((r) => setTimeout(r, RESEND_FREE_LIMITS.minIntervalMs));
  }

  result.dailyCount = dailyCount;
  result.monthlyCount = monthlyCount;
  result.remainingToday = Math.max(0, RESEND_FREE_LIMITS.daily - dailyCount);
  result.remainingMonth = Math.max(0, RESEND_FREE_LIMITS.monthly - monthlyCount);
  return result;
}
