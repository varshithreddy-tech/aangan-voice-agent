// Escalate (urgent) goes to Nikhil straight away from /qualify (§8.4), once per call.
import type { Repo } from "./db";
import { urgentNote } from "./handoff";
import { nikhilChat, sendMessage } from "./telegram";

export async function sendUrgentAlert(repo: Repo, callId: string): Promise<void> {
  if (!(await repo.claim(callId, "urgent_alert_sent"))) return;
  try {
    const row = await repo.get(callId);
    if (!row) return;
    await sendMessage(nikhilChat(), urgentNote(row));
  } catch (e) {
    console.error("urgent alert failed", e);
    await repo.release(callId, "urgent_alert_sent");
  }
}
