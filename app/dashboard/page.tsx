import Link from "next/link";
import { getRepo, type CallRow } from "@/lib/db";
import { computeMetrics } from "@/lib/metrics";
import { loadPipeline, type Pipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90];
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const inr = (v: number | null) => (v === null ? "—" : `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const ist = (v: string) =>
  new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const ROUTE_LABEL: Record<string, string> = {
  qualified: "Qualified",
  qualified_flag: "Qualified + flag",
  ask_one_question: "Asking",
  close: "Closed",
  escalate_urgent: "Urgent",
  escalate_normal: "Escalated",
};
const OUTCOME_CLASS: Record<string, string> = {
  booked: "good",
  booked_flag: "good",
  qualified_not_booked: "warn",
  escalated: "warn",
  closed: "",
  incomplete: "",
  dropped: "bad",
};

function Bars({ title, data, keepOrder = false }: { title: string; data: Record<string, number>; keepOrder?: boolean }) {
  const entries = keepOrder ? Object.entries(data) : Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <section className="card">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="muted">No data yet.</p>
      ) : (
        <div className="bars" role="table" aria-label={title}>
          {entries.map(([k, v]) => (
            <div className="bar-row" role="row" key={k} title={`${k.replaceAll("_", " ")}: ${v}`}>
              <span role="cell" className="secondary">{k.replaceAll("_", " ")}</span>
              <span role="cell" className="bar-track"><span className="bar" style={{ display: "block", width: `${(v / max) * 100}%` }} /></span>
              <span role="cell" className="num">{v}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const monthLabel = (ym: string) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

function PipelineSection({ pipeline }: { pipeline: Pipeline | { error: string } }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 17, margin: "8px 0 10px" }}>Sales pipeline · HubSpot (all time)</h2>
      {"error" in pipeline ? (
        <p className="muted">{pipeline.error}</p>
      ) : (
        <>
          <div className="grid tiles">
            <Tile label="Open deals" value={String(pipeline.openDeals)} sub={`${pipeline.openWithAmount} with a caller-stated budget`} />
            <Tile label="Open pipeline value" value={inr(pipeline.openAmount)} sub="sum of caller-stated budgets only" />
            <Tile label="Weighted forecast" value={inr(pipeline.weightedForecast)} sub="value × stage probability" />
            <Tile label="Won" value={String(pipeline.wonDeals)} sub={inr(pipeline.wonAmount)} />
          </div>
          <div className="grid two">
            <Bars title="Deals by stage" keepOrder data={Object.fromEntries(pipeline.stages.map((s) => [`${s.label} (${Math.round(s.probability * 100)}%)`, s.deals]))} />
            <section className="card">
              <h2>Forecast by expected completion month</h2>
              {pipeline.byMonth.length === 0 ? (
                <p className="muted">No open deals with a completion date yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr><th>Month</th><th className="num">Deals</th><th className="num">Value</th><th className="num">Weighted</th></tr>
                  </thead>
                  <tbody>
                    {pipeline.byMonth.map((r) => (
                      <tr key={r.month}>
                        <td>{monthLabel(r.month)}</td>
                        <td className="num">{r.deals}</td>
                        <td className="num">{inr(r.amount)}</td>
                        <td className="num">{inr(r.weighted)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pipeline.noCloseDate > 0 && <p className="muted">{pipeline.noCloseDate} open deal(s) have no completion date.</p>}
              <p className="muted" style={{ marginBottom: 0 }}>
                Values exist only where a caller volunteered a budget; designers can add amounts in HubSpot after the consultation.
              </p>
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function CallLog({ rows }: { rows: CallRow[] }) {
  return (
    <section className="card">
      <h2>Call log</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>When (IST)</th><th>Caller</th><th>Project</th><th>Route</th><th>Outcome</th><th>Flags</th><th>Consultation</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.call_id}>
                <td>{ist(r.started_at)}{r.is_after_hours ? <div className="muted">after hours</div> : null}</td>
                <td>{r.fields.name ?? "—"}<div className="muted">{r.caller_number ?? ""}</div></td>
                <td>{[r.fields.scope ?? r.fields.space_type, r.fields.locality].filter(Boolean).join(" · ") || "—"}</td>
                <td>{ROUTE_LABEL[r.route ?? ""] ?? "—"}{r.close_reason ? <div className="muted">{r.close_reason.replaceAll("_", " ")}</div> : null}</td>
                <td><span className={`chip ${OUTCOME_CLASS[r.outcome ?? ""] ?? ""}`}>{(r.outcome ?? "in progress").replaceAll("_", " ")}</span></td>
                <td>{r.flags.map((f) => <span className="chip" key={f}>{f.replaceAll("_", " ")}</span>)}{r.price_violation ? <span className="chip bad">price said</span> : null}</td>
                <td>
                  {r.booking_status === "booked" ? `${r.booking_slot_spoken ?? ""} · ${r.booking_type === "site_visit" ? "site visit" : "studio"}` : r.booking_status === "failed" ? "booking failed" : "—"}
                  {r.designer_contacted_at ? <div className="muted">contacted {ist(r.designer_contacted_at)}</div> : null}
                </td>
                <td><Link href={`/calls/${encodeURIComponent(r.call_id)}`}>Open</Link></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="muted">No calls in this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days: daysParam } = await searchParams;
  const days = PERIODS.includes(Number(daysParam)) ? Number(daysParam) : 30;
  const [rows, pipeline] = await Promise.all([getRepo(false).list({ limit: 2000, sinceDays: days }), loadPipeline()]);
  const m = computeMetrics(rows);

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Phone enquiries</h1>
          <div className="muted">Aangan Studio · call log and metrics</div>
        </div>
      </header>

      <nav className="filters" aria-label="Period">
        <span className="secondary">Period:</span>
        {PERIODS.map((p) => (
          <Link key={p} className="btn" href={`/dashboard?days=${p}`} aria-current={p === days}>{`Last ${p} days`}</Link>
        ))}
      </nav>

      <>
          <p className="secondary" style={{ marginTop: 0 }}>
            Every call is answered by the agent within seconds, day or night, so “answered within 5 minutes” is ~100% by design.
          </p>
          <div className="grid tiles">
            <Tile label="Calls" value={String(m.calls)} sub={`${m.afterHours} after hours (outside 10am–7pm)`} />
            <Tile label="Ended in a booking" value={pct(m.bookingRate)} sub={`${m.booked} booked · ${m.bookedSiteVisit} site visit · ${m.bookedStudio} studio`} />
            <Tile label="Qualified" value={pct(m.qualifiedRate)} sub={`${m.qualified} of ${m.calls} calls`} />
            <Tile label="After-hours bookings" value={String(m.afterHoursBooked)} sub={`of ${m.afterHours} after-hours calls`} />
            <Tile
              label="Booking → designer contact"
              value={m.medianHoursToContact === null ? "—" : `${m.medianHoursToContact.toFixed(1)} h`}
              sub={`median, ${m.contactedCount} contacted`}
            />
            <Tile label="Awaiting follow-up" value={String(m.awaitingFollowUp.length)} sub="qualified, not booked, not yet contacted" />
            <Tile label="AI cost · total" value={inr(m.costTotal)} sub={`${m.voiceMinutes} voice min · ${m.llmTokens.toLocaleString("en-IN")} tokens`} />
            <Tile label="AI cost · per call" value={inr(m.costPerCall)} sub={`per booking ${inr(m.costPerBooking)}`} />
            <Tile label="Price violations" value={String(m.priceViolations)} sub="agent lines that mentioned a price" />
          </div>
          <div className="grid two">
            <Bars title="Outcomes" data={m.outcomes} />
            <Bars title="Closed, by reason" data={m.closedByReason} />
            <Bars title="Flags" data={m.flagCounts} />
            <section className="card">
              <h2>Qualified, not booked — follow up</h2>
              {m.awaitingFollowUp.length === 0 ? (
                <p className="muted">Nobody waiting.</p>
              ) : (
                <table>
                  <tbody>
                    {m.awaitingFollowUp.slice(0, 10).map((r) => (
                      <tr key={r.call_id}>
                        <td>{ist(r.started_at)}</td>
                        <td>{r.fields.name ?? r.caller_number}</td>
                        <td>{r.booking_status === "failed" ? "booking failed" : "didn't book"}</td>
                        <td><Link href={`/calls/${encodeURIComponent(r.call_id)}`}>Open</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
      </>

      <PipelineSection pipeline={pipeline} />

      <CallLog rows={rows} />
    </main>
  );
}
