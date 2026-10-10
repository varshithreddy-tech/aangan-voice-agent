// POST /api/telegram-webhook — the designer taps "Contacted ✓" (rubric §8.4).
// Records designer_contacted_at and moves the HubSpot deal to "Designer contacted".
import { getRepo } from "@/lib/db";
import { envOptional } from "@/lib/env";
import { moveDealToContacted } from "@/lib/hubspot";
import { answerCallback, CONTACTED_PREFIX, markButtonDone } from "@/lib/telegram";

export const runtime = "nodejs";

interface Update {
  callback_query?: {
    id: string;
    data?: string;
    from?: { first_name?: string };
    message?: { message_id: number; chat: { id: number } };
  };
}

export async function POST(request: Request) {
  const secret = envOptional("TELEGRAM_WEBHOOK_SECRET");
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const update = (await request.json().catch(() => ({}))) as Update;
  const q = update.callback_query;
  if (!q?.data?.startsWith(CONTACTED_PREFIX)) return Response.json({ ok: true });

  const callId = q.data.slice(CONTACTED_PREFIX.length);
  const repo = getRepo(false);
  try {
    const row = await repo.get(callId);
    if (!row) {
      await answerCallback(q.id, "Call not found");
      return Response.json({ ok: true });
    }
    const when = row.designer_contacted_at ? new Date(row.designer_contacted_at) : new Date();
    if (!row.designer_contacted_at) {
      await repo.update(callId, { designer_contacted_at: when.toISOString() });
      if (row.hubspot_id) await moveDealToContacted(row.hubspot_id).catch((e) => console.error("hubspot stage move failed", e));
    }
    const time = when.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
    await answerCallback(q.id, "Marked as contacted");
    if (q.message) {
      await markButtonDone(q.message.chat.id, q.message.message_id, `Contacted ✓ · ${q.from?.first_name ?? "designer"} · ${time}`);
    }
  } catch (e) {
    console.error("telegram webhook failed", e);
  }
  // Always 200 so Telegram doesn't retry forever.
  return Response.json({ ok: true });
}
