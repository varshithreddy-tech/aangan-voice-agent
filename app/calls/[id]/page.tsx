import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepo } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { handoffNote } from "@/lib/handoff";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getRepo(false).get(decodeURIComponent(id));
  if (!row) notFound();

  const qualified = row.route === "qualified" || row.route === "qualified_flag";
  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>{row.fields.name ?? "Caller"} · {row.caller_number ?? ""}</h1>
          <div className="muted">
            {new Date(row.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST
            {row.duration_s ? ` · ${Math.round(row.duration_s / 60)} min` : ""}
            {row.cost_inr !== null ? ` · AI cost ₹${Number(row.cost_inr).toFixed(2)}` : ""}
          </div>
        </div>
        <Link className="btn" href="/dashboard">← All calls</Link>
      </header>

      <div className="grid two">
        <section className="card">
          <h2>{qualified ? "Handoff note" : "Summary"}</h2>
          <pre className="note">{qualified ? handoffNote(row, `${appUrl()}/calls/${encodeURIComponent(row.call_id)}`) : row.summary ?? "—"}</pre>
        </section>
        <section className="card">
          <h2>Result</h2>
          <table>
            <tbody>
              <tr><th>Route</th><td>{row.route ?? "—"}{row.close_reason ? ` (${row.close_reason})` : ""}</td></tr>
              <tr><th>Outcome</th><td>{row.outcome ?? "in progress"}</td></tr>
              <tr><th>Criteria</th><td>{row.criteria ? Object.entries(row.criteria).map(([k, v]) => <span className="chip" key={k}>{k}: {v}</span>) : "—"}</td></tr>
              <tr><th>Flags</th><td>{row.flags.length ? row.flags.join(", ") : "none"}</td></tr>
              <tr><th>Telegram</th><td>{row.telegram_sent ? "sent" : "not sent"}</td></tr>
              <tr><th>HubSpot</th><td>{row.hubspot_id ?? "—"}</td></tr>
              <tr><th>Designer contacted</th><td>{row.designer_contacted_at ? new Date(row.designer_contacted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td></tr>
              {row.price_violation && (
                <tr><th>Price violation</th><td className="error">{row.price_violation_lines.join(" | ")}</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card transcript">
        <h2>Transcript</h2>
        {row.transcript?.length ? (
          row.transcript.map((t, i) => (
            <p key={i}><span className="who">{t.role === "agent" ? "Agent" : "Caller"}:</span>{t.text}</p>
          ))
        ) : (
          <p className="muted">Transcript pending.</p>
        )}
        {row.recording_url && <p><a href={row.recording_url}>Recording</a></p>}
      </section>
    </main>
  );
}
