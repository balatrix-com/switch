import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  FileSearch,
  RadioTower,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Customer, CustomerSipTrace, CustomerSipTraceList } from "../types";
import { SipTraceDetailDialog } from "./SipTracePage";

const callTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }).format(new Date(value));

export function CustomerLatestCalls({ customer }: { customer: Customer }) {
  const [result, setResult] = useState<CustomerSipTraceList | null>(null);
  const [selected, setSelected] = useState<CustomerSipTrace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(
        await api.get<CustomerSipTraceList>("/sip-trace/customer/latest", customer.id),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load latest customer calls",
      );
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="panel customer-latest-calls">
      <div className="panel-heading padded">
        <div>
          <span className="eyebrow">Tenant signaling · Latest 100</span>
          <h2>Latest Calls</h2>
          <p>
            Valid routed sessions for {customer.name}. Anonymous scanners and
            calls that cannot be mapped to this customer are excluded.
          </p>
        </div>
        <button className="button ghost" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={loading ? "spin" : ""} size={15} /> Refresh
        </button>
      </div>

      <div className="latest-calls-trust-note">
        <ShieldCheck size={17} />
        <span>
          <strong>Customer-scoped trace index</strong>
          Generated only from finalized calls matched to an actively assigned
          number for this customer; both SIP legs open together when available.
        </span>
        <span className="latest-count">{result?.total ?? 0} / 100 retained</span>
      </div>

      {error ? (
        <div className="empty-state error-state">
          <AlertTriangle />
          <h3>Could not load customer calls</h3>
          <p>{error}</p>
          <button className="button secondary" onClick={() => void load()}>
            <RefreshCw size={15} /> Retry
          </button>
        </div>
      ) : loading && !result ? (
        <div className="loading-grid"><div /><div /><div /><div /></div>
      ) : (
        <div className="table-scroll">
          <table className="latest-calls-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Direction</th>
                <th>Caller → called</th>
                <th>Customer number</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Source → destination</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {result?.data.map((trace) => (
                <tr key={trace.id}>
                  <td>
                    <strong>{callTime(trace.startedAt)}</strong>
                    <span className="table-sub mono">CDR #{trace.cdrId}</span>
                  </td>
                  <td>
                    <span className={`direction ${trace.direction.toLowerCase()}`}>
                      {trace.direction === "INBOUND" ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                      {trace.direction}
                    </span>
                  </td>
                  <td>
                    <strong className="mono">{trace.callerNumber || "—"}</strong>
                    <span className="table-sub mono">→ {trace.calledNumber || "—"}</span>
                  </td>
                  <td>
                    <strong className="mono">{trace.customerNumber || "Routed session"}</strong>
                    <span className="table-sub">{trace.callIds.length} linked SIP leg{trace.callIds.length === 1 ? "" : "s"}</span>
                  </td>
                  <td>
                    <span className={`call-state ${trace.status.toLowerCase()}`}>{trace.status}</span>
                    <span className="table-sub">SIP {trace.responseCode ?? "pending detail"}</span>
                  </td>
                  <td className="mono">
                    <strong>{trace.durationSeconds}s</strong>
                    <span className="table-sub"><Clock3 size={12} /> completed</span>
                  </td>
                  <td className="mono">
                    <strong>{trace.sourceIp || "—"}</strong>
                    <span className="table-sub">→ {trace.destinationIp || "—"}</span>
                  </td>
                  <td>
                    <button className="button ghost compact" onClick={() => setSelected(trace)}>
                      <RadioTower size={14} /> Open trace
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result?.data.length && !loading && (
            <div className="empty-state compact-empty">
              <FileSearch />
              <h3>No mapped customer calls yet</h3>
              <p>Completed calls will appear after the CDR pipeline assigns them to this customer.</p>
            </div>
          )}
        </div>
      )}

      {selected && (
        <SipTraceDetailDialog
          callId={selected.callIds[0] || selected.sessionUuid}
          basePath={`/sip-trace/customer/calls/${selected.id}`}
          customerId={customer.id}
          close={() => setSelected(null)}
        />
      )}
    </section>
  );
}
