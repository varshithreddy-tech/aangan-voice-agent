// Backup delivery (rubric §8.5, v6): rows older than 15 min with a qualified or escalate_normal
// route whose Telegram note hasn't gone out. Run by the daily Vercel cron (Hobby plan allows
// only daily crons) AND in the background after every Vaani webhook, so a missed note is
// normally sent within minutes while calls are coming in.
import type { Repo } from "./db";
import { deliver, type DeliveryReport } from "./delivery";

export async function sweepPending(repo: Repo, limit = 10): Promise<({ call_id: string } & DeliveryReport)[]> {
  const pending = (await repo.pendingDeliveries(15)).slice(0, limit);
  const results = [];
  for (const row of pending) {
    if (!row.outcome) {
      const outcome =
        row.route === "escalate_normal"
          ? "escalated"
          : row.booking_status === "booked"
            ? row.route === "qualified" ? "booked" : "booked_flag"
            : "qualified_not_booked";
      await repo.update(row.call_id, { outcome });
    }
    results.push({ call_id: row.call_id, ...(await deliver(repo, row.call_id)) });
  }
  return results;
}
