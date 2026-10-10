// Sends the Telegram note and the HubSpot record, at most once each (§8.4, §8.5).
// Used by /call-ended and by the backup cron job.
import { isoDate, type CallRow, type Repo } from "./db";
import { appUrl } from "./env";
import { consultationLine, escalationNote, handoffNote } from "./handoff";
import * as hubspot from "./hubspot";
import * as telegram from "./telegram";

export interface DeliveryDeps {
  telegram: Pick<typeof telegram, "sendMessage" | "contactedButton" | "designerChat" | "nikhilChat">;
  hubspot: Pick<typeof hubspot, "findContactByPhone" | "createContact" | "createDeal">;
}

export const liveDeliveryDeps: DeliveryDeps = { telegram, hubspot };

export function transcriptLink(row: CallRow): string {
  const own = `${appUrl()}/calls/${encodeURIComponent(row.call_id)}`;
  return row.transcript ? own : `${own} (transcript pending)`;
}

const QUALIFIED = new Set(["qualified", "qualified_flag"]);

export interface DeliveryReport {
  telegram: "sent" | "skipped" | "not_needed" | "failed";
  hubspot: "created" | "skipped" | "not_needed" | "failed";
  errors: string[];
}

export async function deliver(repo: Repo, callId: string, deps: DeliveryDeps = liveDeliveryDeps): Promise<DeliveryReport> {
  const report: DeliveryReport = { telegram: "not_needed", hubspot: "not_needed", errors: [] };
  const row = await repo.get(callId);
  if (!row) return report;
  const route = row.route ?? "";
  const qualified = QUALIFIED.has(route);
  if (!qualified && route !== "escalate_normal") return report;

  const link = transcriptLink(row);

  // ---- Telegram (claim first so a second /call-ended or the cron can't double-send) ----
  if (await repo.claim(callId, "telegram_sent")) {
    try {
      const msg = qualified
        ? await deps.telegram.sendMessage(deps.telegram.designerChat(), handoffNote(row, link), deps.telegram.contactedButton(callId))
        : await deps.telegram.sendMessage(deps.telegram.nikhilChat(), escalationNote(row, link));
      await repo.update(callId, { telegram_message_id: String(msg.message_id) });
      report.telegram = "sent";
    } catch (e) {
      await repo.release(callId, "telegram_sent");
      report.telegram = "failed";
      report.errors.push(String(e));
    }
  } else {
    report.telegram = "skipped";
  }

  // ---- HubSpot: qualified + qualified_flag only ----
  if (qualified) {
    if (await repo.claimHubspot(callId)) {
      try {
        const phone = row.caller_number ?? "";
        const contactId = (phone && (await deps.hubspot.findContactByPhone(phone))) || (await deps.hubspot.createContact(row.fields.name ?? null, phone));
        const f = row.fields;
        const dealId = await deps.hubspot.createDeal(
          {
            dealname: [f.name ?? "Caller", f.scope ?? f.space_type ?? "project", f.locality].filter(Boolean).join(" · "),
            stage: row.booking_status === "booked" ? "booked" : "followup",
            amountInr: row.volunteered_budget_inr ? Number(row.volunteered_budget_inr) : null,
            closeDate: isoDate(row.completion_date),
            description: [
              row.summary ?? "",
              `Flags: ${row.flags.join(", ") || "none"}`,
              `Consultation: ${consultationLine(row)}`,
              `Transcript: ${link}`,
            ].join("\n"),
          },
          contactId,
        );
        await repo.update(callId, { hubspot_id: dealId, hubspot_contact_id: contactId });
        report.hubspot = "created";
      } catch (e) {
        await repo.update(callId, { hubspot_id: null });
        report.hubspot = "failed";
        report.errors.push(String(e));
      }
    } else {
      report.hubspot = "skipped";
    }
  }
  return report;
}
