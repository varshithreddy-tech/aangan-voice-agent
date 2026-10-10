// Nikhil's sales pipeline + forecast, read live from HubSpot (the "Aangan Enquiries" pipeline).
// Deal amount = the caller's volunteered budget only (often blank); close date = the caller's completion date.
import { envOptional } from "./env";
import { hubspotRequest as hs } from "./hubspot";

export interface StageSummary {
  id: string;
  label: string;
  probability: number;
  closed: boolean;
  deals: number;
  amount: number;
}

export interface Pipeline {
  stages: StageSummary[];
  openDeals: number;
  openWithAmount: number;
  openAmount: number;
  weightedForecast: number;
  wonDeals: number;
  wonAmount: number;
  byMonth: { month: string; deals: number; amount: number; weighted: number }[];
  noCloseDate: number;
}

interface Deal {
  properties: { amount?: string | null; dealstage?: string; closedate?: string | null };
}

export async function loadPipeline(): Promise<Pipeline | { error: string }> {
  const pipelineId = envOptional("HUBSPOT_PIPELINE_ID");
  if (!pipelineId || !envOptional("HUBSPOT_TOKEN")) return { error: "HubSpot is not configured." };
  try {
    const p = await hs<{ stages: { id: string; label: string; displayOrder: number; metadata: { probability?: string; isClosed?: string } }[] }>(
      "GET",
      `/crm/v3/pipelines/deals/${pipelineId}`,
    );
    const stages: StageSummary[] = p.stages
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((s) => {
        const probability = Number(s.metadata.probability ?? 0);
        return { id: s.id, label: s.label, probability, closed: s.metadata.isClosed === "true" || probability === 1 || probability === 0, deals: 0, amount: 0 };
      });
    const byId = new Map(stages.map((s) => [s.id, s]));

    // All deals in the pipeline (paged; ~200 enquiries/month keeps this small).
    const deals: Deal[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await hs<{ results: Deal[]; paging?: { next?: { after: string } } }>("POST", "/crm/v3/objects/deals/search", {
        filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: pipelineId }] }],
        properties: ["amount", "dealstage", "closedate"],
        limit: 100,
        ...(after ? { after } : {}),
      });
      deals.push(...r.results);
      after = r.paging?.next?.after;
      if (!after) break;
    }

    const months = new Map<string, { deals: number; amount: number; weighted: number }>();
    let openDeals = 0, openWithAmount = 0, openAmount = 0, weighted = 0, wonDeals = 0, wonAmount = 0, noCloseDate = 0;
    for (const d of deals) {
      const stage = byId.get(d.properties.dealstage ?? "");
      if (!stage) continue;
      const amount = Number(d.properties.amount ?? 0) || 0;
      stage.deals++;
      stage.amount += amount;
      if (stage.probability === 1) {
        wonDeals++;
        wonAmount += amount;
        continue;
      }
      if (stage.closed) continue; // lost
      openDeals++;
      if (amount) openWithAmount++;
      openAmount += amount;
      weighted += amount * stage.probability;
      if (!d.properties.closedate) {
        noCloseDate++;
        continue;
      }
      const month = d.properties.closedate.slice(0, 7);
      const m = months.get(month) ?? { deals: 0, amount: 0, weighted: 0 };
      m.deals++;
      m.amount += amount;
      m.weighted += amount * stage.probability;
      months.set(month, m);
    }

    return {
      stages,
      openDeals,
      openWithAmount,
      openAmount,
      weightedForecast: Math.round(weighted),
      wonDeals,
      wonAmount,
      byMonth: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v, weighted: Math.round(v.weighted) })),
      noCloseDate,
    };
  } catch (e) {
    console.error("HubSpot pipeline load failed", e);
    return { error: "Couldn't load the HubSpot pipeline right now." };
  }
}
