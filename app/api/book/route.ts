// POST /api/book — slots and booking, only after a qualified route (rubric §8.2b, §6.11).
import { getRepo } from "@/lib/db";
import { createBooking, getSlots } from "@/lib/calcom";
import { debugLogRequest, parseBookRequest, toolResponse, verifyRequest } from "@/lib/vaani";
import { normalisePhone } from "@/lib/phone";

export const runtime = "nodejs";
export const maxDuration = 30;

const QUALIFIED = new Set(["qualified", "qualified_flag"]);

export async function POST(request: Request) {
  if (!verifyRequest(request.headers, request.url)) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  debugLogRequest("book", request.headers, body);
  const req = parseBookRequest(body, request.headers);
  const isTest = (body as { is_test?: boolean })?.is_test === true;
  const repo = getRepo(isTest);
  const row = req.call_id ? await repo.get(req.call_id) : null;
  if (!row) return Response.json({ error: "unknown call_id" }, { status: 404 });
  if (!QUALIFIED.has(row.route ?? "")) return toolResponse({ status: "not_qualified" });

  const failed = async (detail: unknown) => {
    console.error("booking failed", detail);
    await repo.update(row.call_id, { booking_status: "failed", booking_type: req.consultation_type });
    // The agent says: "Your designer will call you to fix a time that works." The route stays qualified.
    return toolResponse({ status: "booking_failed" });
  };

  if (req.action === "slots") {
    try {
      const slots = await getSlots(req.consultation_type);
      if (!slots.length) return failed("no slots");
      await repo.update(row.call_id, { offered_slots: slots, booking_type: req.consultation_type });
      return toolResponse({ status: "slots", slots: slots.map((s, i) => ({ index: i + 1, spoken: s.spoken, start: s.start })) });
    } catch (e) {
      return failed(e);
    }
  }

  // action === "book"
  const offered = row.offered_slots ?? [];
  const chosen =
    typeof req.slot === "number" || /^\d$/.test(String(req.slot ?? ""))
      ? offered[Number(req.slot) - 1]
      : offered.find((s) => s.start === req.slot || s.spoken.toLowerCase() === String(req.slot ?? "").toLowerCase());
  if (!chosen) {
    return toolResponse({ status: "unknown_slot", slots: offered.map((s, i) => ({ index: i + 1, spoken: s.spoken })) });
  }
  const siteAddress = req.site_address ?? row.site_address ?? row.fields.site_address ?? null;
  if (req.consultation_type === "site_visit" && !siteAddress) return toolResponse({ status: "need_site_address" });

  const phone = normalisePhone(req.phone || row.caller_number || "");
  try {
    const booking = await createBooking({
      type: req.consultation_type,
      start: chosen.start,
      name: req.name || row.fields.name || "Caller",
      phone,
      siteAddress,
      callId: row.call_id,
    });
    await repo.update(row.call_id, {
      booking_status: "booked",
      booking_id: booking.uid || booking.id,
      booking_type: req.consultation_type,
      booking_slot: booking.start,
      booking_slot_spoken: chosen.spoken,
      site_address: siteAddress,
    });
    return toolResponse({ status: "booked", slot: chosen.spoken });
  } catch (e) {
    return failed(e);
  }
}
