import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Braces,
  ChartNoAxesCombined,
  Clock3,
  FileJson,
  FileSearch,
  ListFilter,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type { SipTraceDetail, SipTraceMessage, SipTraceSearchResponse } from "../types";

type TraceForm = {
  callId: string;
  method: string;
  caller: string;
  callee: string;
  srcIp: string;
  dstIp: string;
  srcPort: string;
  dstPort: string;
  responseCode: string;
  cseqMethod: string;
  correlationId: string;
  node: string;
  captureId: string;
  from: string;
  to: string;
};

type DetailTab = "trace" | "rtcp-reports" | "rtcp-stats" | "logs" | "raw";

const defaultCaptureId = import.meta.env.VITE_HOMER_CAPTURE_ID || "61";

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const initialForm = (): TraceForm => ({
  callId: "",
  method: "",
  caller: "",
  callee: "",
  srcIp: "",
  dstIp: "",
  srcPort: "",
  dstPort: "",
  responseCode: "",
  cseqMethod: "",
  correlationId: "",
  node: "",
  captureId: defaultCaptureId,
  from: localDateTime(new Date(Date.now() - 60 * 60 * 1000)),
  to: localDateTime(new Date()),
});

const displayTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    hour12: false,
  }).format(new Date(value));

const preciseTime = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(new Date(value));

export function SipTracePage() {
  const [urlParams, setUrlParams] = useSearchParams();
  const [form, setForm] = useState<TraceForm>(() => ({
    ...initialForm(),
    callId: urlParams.get("callId") || "",
    from: urlParams.get("from") ? localDateTime(new Date(urlParams.get("from")!)) : initialForm().from,
    to: urlParams.get("to") ? localDateTime(new Date(urlParams.get("to")!)) : initialForm().to,
  }));
  const [result, setResult] = useState<SipTraceSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (values: TraceForm = form) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (!value) return;
      params.set(key, key === "from" || key === "to" ? new Date(value).toISOString() : value);
    });
    params.set("limit", "500");
    try {
      setResult(await api.get<SipTraceSearchResponse>(`/sip-trace/search?${params}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to search SIP capture data");
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    if (!urlParams.get("selected")) void runSearch();
    // Initial query only; filters search on explicit submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch();
  };

  const selectCall = (message: SipTraceMessage) => {
    const next = new URLSearchParams(urlParams);
    next.set("selected", message.callId);
    next.set("from", new Date(message.timestampMs - 5 * 60_000).toISOString());
    next.set("to", new Date(message.timestampMs + 60 * 60_000).toISOString());
    next.delete("callIds");
    setUrlParams(next);
  };

  return (
    <div className="page sip-debug-page">
      <header className="page-header sip-debug-header">
        <div>
          <div className="eyebrow">Super Admin · Signaling observability</div>
          <h1>SIP call debugging</h1>
          <p>Search signaling only for numbers stored in your number inventory. External-only calls, unknown scanners, and unrelated INVITEs are excluded.</p>
        </div>
        <div className="capture-health"><span className="status-dot" /><span>HEP capture<strong>Homer 11 · Capture {defaultCaptureId}</strong></span></div>
      </header>

      <div className="sip-search-layout">
        <aside className="panel sip-filter-panel">
          <div className="panel-heading"><div><div className="eyebrow">Query builder</div><h2><ListFilter size={15} /> Search filters</h2></div></div>
          <form className="sip-filter-form" onSubmit={submit}>
            <TraceField label="Call-ID / Session" value={form.callId} onChange={(callId) => setForm({ ...form, callId })} placeholder="Full or partial Call-ID" />
            <div className="sip-filter-pair">
              <TraceField label="SIP method" value={form.method} onChange={(method) => setForm({ ...form, method })} placeholder="INVITE, BYE…" />
              <TraceField label="Response" value={form.responseCode} onChange={(responseCode) => setForm({ ...form, responseCode })} placeholder="200, 487…" />
            </div>
            <div className="sip-filter-pair">
              <TraceField label="Caller" value={form.caller} onChange={(caller) => setForm({ ...form, caller })} />
              <TraceField label="Callee" value={form.callee} onChange={(callee) => setForm({ ...form, callee })} />
            </div>
            <TraceField label="Source IP" value={form.srcIp} onChange={(srcIp) => setForm({ ...form, srcIp })} placeholder="51.79.127.124" />
            <TraceField label="Destination IP" value={form.dstIp} onChange={(dstIp) => setForm({ ...form, dstIp })} placeholder="91.99.251.61" />
            <div className="sip-filter-pair">
              <TraceField label="Source port" value={form.srcPort} onChange={(srcPort) => setForm({ ...form, srcPort })} inputMode="numeric" />
              <TraceField label="Destination port" value={form.dstPort} onChange={(dstPort) => setForm({ ...form, dstPort })} inputMode="numeric" />
            </div>
            <details className="advanced-filters">
              <summary>Advanced signaling fields</summary>
              <TraceField label="CSeq method" value={form.cseqMethod} onChange={(cseqMethod) => setForm({ ...form, cseqMethod })} />
              <TraceField label="Correlation ID / CTID" value={form.correlationId} onChange={(correlationId) => setForm({ ...form, correlationId })} />
              <TraceField label="Node" value={form.node} onChange={(node) => setForm({ ...form, node })} />
              <TraceField label="Capture ID" value={form.captureId} onChange={(captureId) => setForm({ ...form, captureId })} inputMode="numeric" />
            </details>
            <TraceField label="From" type="datetime-local" value={form.from} onChange={(from) => setForm({ ...form, from })} />
            <TraceField label="To" type="datetime-local" value={form.to} onChange={(to) => setForm({ ...form, to })} />
            <div className="sip-filter-actions">
              <button type="button" className="button secondary" onClick={() => setForm(initialForm())}>Reset</button>
              <button className="button primary" disabled={loading}>{loading ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} Search</button>
            </div>
          </form>
        </aside>

        <section className="panel sip-results-panel">
          <div className="panel-heading">
            <div><div className="eyebrow">Capture results</div><h2>Signaling messages</h2></div>
            <button className="button ghost compact" disabled={loading} onClick={() => void runSearch()}><RefreshCw className={loading ? "spin" : ""} size={14} /> Refresh</button>
          </div>
          <div className="sip-results-meta"><span>{result?.total ?? 0} messages</span><span>{result ? `${displayTime(result.window.from)} → ${displayTime(result.window.to)}` : "Select a time range"}</span></div>
          {error ? (
            <div className="empty-state error-state"><AlertTriangle /><h3>SIP capture query failed</h3><p>{error}</p><button className="button secondary" onClick={() => void runSearch()}><RefreshCw size={15} /> Retry</button></div>
          ) : loading && !result ? (
            <div className="loading-grid"><div /><div /><div /><div /></div>
          ) : (
            <div className="table-scroll sip-results-scroll">
              <table className="sip-results-table">
                <thead><tr><th>Timestamp</th><th>Method</th><th>Caller → callee</th><th>Source</th><th>Destination</th><th>Call-ID</th><th>Capture</th></tr></thead>
                <tbody>{result?.data.map((message) => (
                  <tr key={`${message.id}-${message.timestampMs}`} tabIndex={0} onClick={() => selectCall(message)} onKeyDown={(event) => { if (event.key === "Enter") selectCall(message); }}>
                    <td className="mono"><strong>{preciseTime(message.timestamp)}</strong><span className="table-sub">{message.protocol}</span></td>
                    <td><MethodBadge message={message} /></td>
                    <td><strong className="mono">{message.caller || "—"}</strong><span className="table-sub mono">→ {message.callee || "—"}</span></td>
                    <td className="mono">{message.srcIp}<span className="table-sub">:{message.srcPort}</span></td>
                    <td className="mono">{message.dstIp}<span className="table-sub">:{message.dstPort}</span></td>
                    <td><span className="mono trace-call-id" title={message.callId}>{message.callId}</span><span className="table-sub">CSeq {message.cseqMethod || "—"}</span></td>
                    <td><strong className="mono">{message.captureId ?? "—"}</strong><span className="table-sub">{message.node || "local"}</span></td>
                  </tr>
                ))}</tbody>
              </table>
              {!result?.data.length && !loading && <div className="empty-state compact-empty"><FileSearch /><h3>No owned-number SIP messages found</h3><p>Widen the time range or remove a filter. A trace is shown only when one of its numbers exists in Global Number Inventory.</p></div>}
            </div>
          )}
          {loading && result && <div className="table-refreshing"><LoaderCircle className="spin" size={14} /> Querying capture storage</div>}
        </section>
      </div>
      {urlParams.get("selected") && <GlobalSipCallDetail params={urlParams} close={() => { const next = new URLSearchParams(urlParams); next.delete("selected"); next.delete("callIds"); setUrlParams(next); }} />}
    </div>
  );
}

function TraceField({ label, value, onChange, placeholder, type = "text", inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; inputMode?: "numeric" }) {
  return <label className="trace-field"><span>{label}</span><input type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MethodBadge({ message }: { message: SipTraceMessage }) {
  const kind = message.responseCode && message.responseCode >= 400 ? "error" : message.responseCode ? "response" : ["BYE", "CANCEL"].includes(message.method) ? "terminate" : "request";
  return <span className={`sip-method ${kind}`}>{message.method}{message.hasSdp && <small>SDP</small>}</span>;
}

function GlobalSipCallDetail({ params, close }: { params: URLSearchParams; close: () => void }) {
  const callId = params.get("selected")!;
  const windowQuery = useMemo(() => {
    const query = new URLSearchParams();
    if (params.get("from")) query.set("from", params.get("from")!);
    if (params.get("to")) query.set("to", params.get("to")!);
    if (params.get("callIds")) query.set("callIds", params.get("callIds")!);
    return query.toString();
  }, [params]);
  return <SipTraceDetailDialog callId={callId} basePath={`/sip-trace/calls/${encodeURIComponent(callId)}`} query={windowQuery} close={close} />;
}

export function SipTraceDetailDialog({ callId, basePath, query = "", customerId, close }: { callId: string; basePath: string; query?: string; customerId?: string; close: () => void }) {
  const [detail, setDetail] = useState<SipTraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("trace");
  const [selectedMessage, setSelectedMessage] = useState<SipTraceMessage | null>(null);
  const [auxiliary, setAuxiliary] = useState<unknown>(null);
  const suffix = query ? `?${query}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<SipTraceDetail>(`${basePath}${suffix}`, customerId);
      setDetail(data);
      setSelectedMessage(data.messages[0] || null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load call trace");
    } finally {
      setLoading(false);
    }
  }, [basePath, customerId, suffix]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [close]);

  useEffect(() => {
    if (tab === "trace" || tab === "raw") return;
    const path = tab === "logs" ? "logs" : "rtcp";
    setAuxiliary(null);
    void api.get<unknown>(`${basePath}/${path}${suffix}`, customerId).then(setAuxiliary).catch((caught) => setAuxiliary({ error: caught instanceof Error ? caught.message : "Unable to load data" }));
  }, [basePath, customerId, suffix, tab]);

  return (
    <div className="trace-detail-layer" role="dialog" aria-modal="true" aria-label={`SIP trace ${callId}`}>
      <div className="trace-detail-shell">
        <header className="trace-detail-header">
          <div><div className="eyebrow">Call detail view</div><h2>SIP signaling trace</h2><span className="mono">{callId}</span></div>
          <button className="icon-button" onClick={close} aria-label="Close SIP trace"><X size={19} /></button>
        </header>
        {loading ? <div className="trace-detail-loading"><LoaderCircle className="spin" /><span>Loading complete call flow…</span></div> : error ? <div className="empty-state error-state"><AlertTriangle /><h3>Could not load SIP trace</h3><p>{error}</p><button className="button secondary" onClick={() => void load()}><RefreshCw size={15} /> Retry</button></div> : detail && <>
          <div className="trace-call-summary">
            <Summary icon={<Clock3 />} label="Duration" value={`${(detail.call.durationMs / 1000).toFixed(3)}s`} />
            <Summary icon={<ArrowRight />} label="Parties" value={`${detail.call.caller || "—"} → ${detail.call.callee || "—"}`} />
            <Summary icon={<Activity />} label="Messages" value={String(detail.call.messageCount)} />
            <Summary icon={<RadioTower />} label="Endpoints" value={String(detail.call.participantCount)} />
          </div>
          <div className="trace-detail-tabs" role="tablist">
            <Tab id="trace" active={tab} set={setTab} icon={<RadioTower />} label="SIP Trace" />
            <Tab id="rtcp-reports" active={tab} set={setTab} icon={<Activity />} label="RTCP Reports" />
            <Tab id="rtcp-stats" active={tab} set={setTab} icon={<ChartNoAxesCombined />} label="RTCP Stats" />
            <Tab id="logs" active={tab} set={setTab} icon={<ScrollText />} label="Logs" />
            <Tab id="raw" active={tab} set={setTab} icon={<FileJson />} label="Raw Data" />
          </div>
          <div className="trace-detail-body">
            {tab === "trace" && <div className="trace-inspector-grid"><SipLadder participants={detail.participants} messages={detail.messages} selected={selectedMessage?.id} onSelect={setSelectedMessage} /><RawMessage message={selectedMessage} /></div>}
            {tab === "raw" && <div className="raw-data-layout"><div className="raw-message-list">{detail.messages.map((message) => <button key={message.id} className={selectedMessage?.id === message.id ? "active" : ""} onClick={() => setSelectedMessage(message)}><MethodBadge message={message} /><span>{preciseTime(message.timestamp)}</span><small>{message.srcIp}:{message.srcPort} → {message.dstIp}:{message.dstPort}</small></button>)}</div><RawMessage message={selectedMessage} /></div>}
            {(tab === "rtcp-reports" || tab === "rtcp-stats" || tab === "logs") && <AuxiliaryData value={auxiliary} />}
          </div>
        </>}
      </div>
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div>{icon}<span>{label}<strong>{value}</strong></span></div>;
}

function Tab({ id, active, set, icon, label }: { id: DetailTab; active: DetailTab; set: (tab: DetailTab) => void; icon: React.ReactNode; label: string }) {
  return <button role="tab" aria-selected={active === id} className={active === id ? "active" : ""} onClick={() => set(id)}>{icon}{label}</button>;
}

function SipLadder({ participants, messages, selected, onSelect }: { participants: string[]; messages: SipTraceMessage[]; selected?: string; onSelect: (message: SipTraceMessage) => void }) {
  const left = 105;
  const column = 210;
  const width = Math.max(760, left + Math.max(participants.length - 1, 1) * column + 110);
  const row = 58;
  const top = 80;
  const height = top + messages.length * row + 30;
  const first = messages[0]?.timestampMs ?? 0;
  return <div className="sip-ladder-scroll" aria-label="SIP ladder diagram"><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
    <defs><marker id="arrow-request" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#a78bfa" /></marker><marker id="arrow-response" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#67e8f9" /></marker><marker id="arrow-error" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#fb7185" /></marker></defs>
    {participants.map((participant, index) => { const x = left + index * column; return <g key={participant}><text x={x} y={23} textAnchor="middle" className="ladder-party">{participant}</text><text x={x} y={42} textAnchor="middle" className="ladder-party-sub">endpoint {index + 1}</text><line x1={x} y1={54} x2={x} y2={height - 10} className="ladder-life" /></g>; })}
    {messages.map((message, index) => {
      const source = Math.max(0, participants.indexOf(`${message.srcIp}:${message.srcPort}`));
      const target = Math.max(0, participants.indexOf(`${message.dstIp}:${message.dstPort}`));
      const x1 = left + source * column;
      const x2 = left + target * column;
      const y = top + index * row;
      const error = (message.responseCode ?? 0) >= 400;
      const response = message.responseCode !== null;
      const color = error ? "#fb7185" : response ? "#67e8f9" : "#a78bfa";
      const marker = error ? "url(#arrow-error)" : response ? "url(#arrow-response)" : "url(#arrow-request)";
      return <g key={`${message.id}-${index}`} className={`ladder-message ${selected === message.id ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => onSelect(message)} onKeyDown={(event) => { if (event.key === "Enter") onSelect(message); }}>
        <rect x="2" y={y - 23} width={width - 4} height="48" rx="5" className="ladder-hit" />
        <text x="10" y={y - 5} className="ladder-time">{((message.timestampMs - first) / 1000).toFixed(3)}s</text>
        <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth="1.6" markerEnd={marker} strokeDasharray={response ? "5 4" : undefined} />
        <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" fill={color} className="ladder-method">{message.method}{message.hasSdp ? " (SDP)" : ""}</text>
        <text x={(x1 + x2) / 2} y={y + 17} textAnchor="middle" className="ladder-cseq">{message.cseqMethod ? `CSeq ${message.cseqMethod}` : message.protocol}</text>
      </g>;
    })}
  </svg></div>;
}

function RawMessage({ message }: { message: SipTraceMessage | null }) {
  return <aside className="raw-message-panel"><div className="raw-message-heading"><div><Braces size={15} /><strong>Raw SIP message</strong></div>{message && <MethodBadge message={message} />}</div>{message ? <><dl><div><dt>Source</dt><dd>{message.srcIp}:{message.srcPort}</dd></div><div><dt>Destination</dt><dd>{message.dstIp}:{message.dstPort}</dd></div><div><dt>Call-ID</dt><dd>{message.callId}</dd></div><div><dt>Captured</dt><dd>{displayTime(message.timestamp)}</dd></div></dl><pre>{message.raw || "Raw payload was not included by the capture query."}</pre></> : <div className="empty-state compact-empty"><Braces /><h3>Select a message</h3><p>Click an arrow in the ladder to inspect its complete SIP headers and SDP.</p></div>}</aside>;
}

function AuxiliaryData({ value }: { value: unknown }) {
  if (value === null) return <div className="trace-detail-loading"><LoaderCircle className="spin" /><span>Loading capture details…</span></div>;
  return <div className="auxiliary-data"><pre>{JSON.stringify(value, null, 2)}</pre></div>;
}
