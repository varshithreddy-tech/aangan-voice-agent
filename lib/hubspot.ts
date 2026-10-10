// HubSpot CRM client (rubric §8.5): contact + deal for qualified calls only; no seed data.
import { env, envOptional } from "./env";

const BASE = "https://api.hubapi.com";

async function hs<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${env("HUBSPOT_TOKEN")}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(`HubSpot ${method} ${path} → ${res.status}: ${json.message ?? text}`) as Error & { status?: number; body?: unknown };
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json as T;
}

export { hs as hubspotRequest };

/** Look up the contact by phone first so repeat callers (T16, T17) aren't duplicated. */
export async function findContactByPhone(phone: string): Promise<string | null> {
  const r = await hs<{ results: { id: string }[] }>("POST", "/crm/v3/objects/contacts/search", {
    filterGroups: [
      { filters: [{ propertyName: "phone", operator: "EQ", value: phone }] },
      { filters: [{ propertyName: "mobilephone", operator: "EQ", value: phone }] },
    ],
    properties: ["phone"],
    limit: 1,
  });
  return r.results[0]?.id ?? null;
}

export async function createContact(name: string | null, phone: string): Promise<string> {
  const [first, ...rest] = (name ?? "").trim().split(/\s+/);
  const r = await hs<{ id: string }>("POST", "/crm/v3/objects/contacts", {
    properties: { firstname: first || "Caller", lastname: rest.join(" ") || undefined, phone },
  });
  return r.id;
}

export interface DealInput {
  dealname: string;
  stage: "booked" | "followup";
  amountInr: number | null; // only the caller's volunteered budget; never spoken
  closeDate: string | null; // the caller's completion date
  description: string;
}

export async function createDeal(d: DealInput, contactId: string): Promise<string> {
  const properties: Record<string, string> = {
    dealname: d.dealname,
    pipeline: env("HUBSPOT_PIPELINE_ID"),
    dealstage: d.stage === "booked" ? env("HUBSPOT_STAGE_ID") : env("HUBSPOT_FOLLOWUP_STAGE_ID"),
    description: d.description.slice(0, 5000),
  };
  if (d.amountInr) properties.amount = String(Math.round(d.amountInr));
  if (d.closeDate) properties.closedate = `${d.closeDate}T00:00:00.000Z`;
  const r = await hs<{ id: string }>("POST", "/crm/v3/objects/deals", {
    properties,
    associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }],
  });
  return r.id;
}

/** Telegram "Contacted ✓" moves the deal to "Designer contacted" (agreed with Varshith). */
export async function moveDealToContacted(dealId: string): Promise<boolean> {
  const stage = envOptional("HUBSPOT_CONTACTED_STAGE_ID");
  if (!stage || !dealId || dealId === "pending") return false;
  await hs("PATCH", `/crm/v3/objects/deals/${dealId}`, { properties: { dealstage: stage } });
  return true;
}
