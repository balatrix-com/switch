import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
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
  ShieldCheck,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import type {
  GlobalSipTrace,
  GlobalSipTraceList,
  SipTraceDetail,
  SipTraceFlowMessage,
  SipTraceRawMessageResponse,
} from "../types";

type TraceForm = {
  callId: string;
  customerId: string;
  caller: string;
  callee: string;
  customerNumber: string;
  srcIp: string;
  dstIp: string;
  responseCode: string;
  direction: string;
  from: string;
  to: string;
  limit: string;
};

type DetailTab = "trace" | "rtcp-reports" | "rtcp-stats" | "logs" | "raw";
type RawPayload = SipTraceRawMessageResponse["data"];

const defaultCaptureId = import.meta.env.VITE_HOMER_CAPTURE_ID || "61";

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const initialForm = (): TraceForm => ({
  callId: "",
  customerId: "",
  caller: "",
  callee: "",
  customerNumber: "",
  srcIp: "",
  dstIp: "",
  responseCode: "",
  direction: "",
  from: localDateTime(new Date(Date.now() - 24 * 60 * 60 * 1000)),
  to: localDateTime(new Date()),
  limit: "200",
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
    from: urlParams.get("from")
      ? localDateTime(new Date(urlParams.get("from")!))
      : initialForm().from,
    to: urlParams.get("to")
      ? localDateTime(new Date(urlParams.get("to")!))
      : initialForm().to,
  }));
  const [result, setResult] = useState<GlobalSipTraceList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(
    async (values: TraceForm = form) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      Object.entries(values).forEach(([key, value]) => {
        if (!value) return;
        params.set(
          key,
          key === "from" || key === "to"
            ? new Date(value).toISOString()
            : value,
        );
      });
      try {
        setResult(
          await api.get<GlobalSipTraceList>(
            `/sip-trace/indexed-calls?${params}`,
          ),
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load indexed SIP calls",
        );
      } finally {
        setLoading(false);
      }
    },
    [form],
  );

  useEffect(() => {
    void runSearch();
    // Initial query only; later filter changes run on explicit submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void runSearch();
  };

  const selectCall = (trace: GlobalSipTrace) => {
    const next = new URLSearchParams(urlParams);
    next.set("selected", trace.id);
    next.set("selectedCallId", trace.callIds[0] || trace.sessionUuid);
    setUrlParams(next);
  };

  const closeDetail = () => {
    const next = new URLSearchParams(urlParams);
    next.delete("selected");
    next.delete("selectedCallId");
    setUrlParams(next);
  };

  return (
    <div className="page sip-debug-page">
      <header className="page-header sip-debug-header">
        <div>
          <div className="eyebrow">Super Admin · Merged call observability</div>
          <h1>SIP call debugging</h1>
          <p>
            One row per routed call, with A-leg and B-leg Call-IDs opened in a
            single ladder. Unknown scanners are excluded by the customer-owned
            call index.
          </p>
        </div>
        <div className="capture-health">
          <span className="status-dot" />
          <span>
            HEP capture
            <strong>Homer 11 · Capture {defaultCaptureId}</strong>
          </span>
        </div>
      </header>

      <div className="sip-search-layout">
        <aside className="panel sip-filter-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Logical call index</div>
              <h2>
                <ListFilter size={15} /> Search filters
              </h2>
            </div>
          </div>
          <form className="sip-filter-form" onSubmit={submit}>
            <TraceField
              label="Call-ID / session"
              value={form.callId}
              onChange={(callId) => setForm({ ...form, callId })}
              placeholder="Session or exact leg Call-ID"
            />
            <TraceField
              label="Customer ID"
              value={form.customerId}
              onChange={(customerId) => setForm({ ...form, customerId })}
              placeholder="Tenant UUID"
            />
            <div className="sip-filter-pair">
              <TraceField
                label="Caller"
                value={form.caller}
                onChange={(caller) => setForm({ ...form, caller })}
              />
              <TraceField
                label="Called"
                value={form.callee}
                onChange={(callee) => setForm({ ...form, callee })}
              />
            </div>
            <TraceField
              label="Owned DID / TFN"
              value={form.customerNumber}
              onChange={(customerNumber) =>
                setForm({ ...form, customerNumber })
              }
            />
            <div className="sip-filter-pair">
              <TraceField
                label="Source IP"
                value={form.srcIp}
                onChange={(srcIp) => setForm({ ...form, srcIp })}
              />
              <TraceField
                label="Destination IP"
                value={form.dstIp}
                onChange={(dstIp) => setForm({ ...form, dstIp })}
              />
            </div>
            <div className="sip-filter-pair">
              <TraceSelect
                label="Direction"
                value={form.direction}
                onChange={(direction) => setForm({ ...form, direction })}
                options={[
                  ["", "All"],
                  ["INBOUND", "Inbound"],
                  ["OUTBOUND", "Outbound"],
                ]}
              />
              <TraceField
                label="Final response"
                value={form.responseCode}
                onChange={(responseCode) =>
                  setForm({ ...form, responseCode })
                }
                placeholder="200, 487…"
                inputMode="numeric"
              />
            </div>
            <TraceField
              label="From"
              type="datetime-local"
              value={form.from}
              onChange={(from) => setForm({ ...form, from })}
            />
            <TraceField
              label="To"
              type="datetime-local"
              value={form.to}
              onChange={(to) => setForm({ ...form, to })}
            />
            <TraceSelect
              label="Maximum calls"
              value={form.limit}
              onChange={(limit) => setForm({ ...form, limit })}
              options={[
                ["50", "50 calls"],
                ["100", "100 calls"],
                ["200", "200 calls"],
              ]}
            />
            <div className="sip-filter-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setForm(initialForm())}
              >
                Reset
              </button>
              <button className="button primary" disabled={loading}>
                {loading ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Search size={15} />
                )}
                Search
              </button>
            </div>
          </form>
        </aside>

        <section className="panel sip-results-panel">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">Merged signaling sessions</div>
              <h2>Latest routed calls</h2>
            </div>
            <button
              className="button ghost compact"
              disabled={loading}
              onClick={() => void runSearch()}
            >
              <RefreshCw className={loading ? "spin" : ""} size={14} />
              Refresh
            </button>
          </div>
          <div className="latest-calls-trust-note">
            <ShieldCheck size={17} />
            <span>
              <strong>Owned-number call index</strong>
              Built from finalized CDRs mapped to active customer numbers. SIP
              packet bodies load only after a ladder message is selected.
            </span>
            <span className="latest-count">
              {result?.total ?? 0} / {result?.limit ?? 200}
            </span>
          </div>
          {error ? (
            <div className="empty-state error-state">
              <AlertTriangle />
              <h3>Indexed call query failed</h3>
              <p>{error}</p>
              <button
                className="button secondary"
                onClick={() => void runSearch()}
              >
                <RefreshCw size={15} /> Retry
              </button>
            </div>
          ) : loading && !result ? (
            <div className="loading-grid">
              <div />
              <div />
              <div />
              <div />
            </div>
          ) : (
            <div className="table-scroll sip-results-scroll">
              <table className="latest-calls-table global-trace-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Customer</th>
                    <th>Direction</th>
                    <th>Caller → called</th>
                    <th>Owned number</th>
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
                        <strong>{displayTime(trace.startedAt)}</strong>
                        <span className="table-sub mono">CDR #{trace.cdrId}</span>
                      </td>
                      <td>
                        <strong>{trace.customer.name}</strong>
                        <span className="table-sub mono">
                          {trace.customer.accountCode} · ID: {trace.customer.id}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`direction ${trace.direction.toLowerCase()}`}
                        >
                          {trace.direction === "INBOUND" ? (
                            <ArrowDownLeft size={13} />
                          ) : (
                            <ArrowUpRight size={13} />
                          )}
                          {trace.direction}
                        </span>
                      </td>
                      <td>
                        <strong className="mono">
                          {trace.callerNumber || "—"}
                        </strong>
                        <span className="table-sub mono">
                          → {trace.calledNumber || "—"}
                        </span>
                      </td>
                      <td>
                        <strong className="mono">
                          {trace.customerNumber || "—"}
                        </strong>
                        <span className="table-sub">
                          {trace.callIds.length} linked leg
                          {trace.callIds.length === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td>
                        <span className={`call-state ${trace.status.toLowerCase()}`}>
                          {trace.status}
                        </span>
                        <span className="table-sub">
                          SIP {trace.responseCode ?? "open trace"}
                        </span>
                      </td>
                      <td className="mono">
                        <strong>{trace.durationSeconds}s</strong>
                      </td>
                      <td className="mono">
                        <strong>{trace.sourceIp || "—"}</strong>
                        <span className="table-sub">
                          → {trace.destinationIp || "—"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="button ghost compact"
                          onClick={() => selectCall(trace)}
                        >
                          <RadioTower size={14} /> Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!result?.data.length && !loading && (
                <div className="empty-state compact-empty">
                  <FileSearch />
                  <h3>No routed calls found</h3>
                  <p>
                    Widen the time range. Only finalized calls matched to an
                    active customer DID or TFN are indexed here.
                  </p>
                </div>
              )}
            </div>
          )}
          {loading && result && (
            <div className="table-refreshing">
              <LoaderCircle className="spin" size={14} /> Refreshing call index
            </div>
          )}
        </section>
      </div>

      {urlParams.get("selected") && (
        <SipTraceDetailDialog
          callId={urlParams.get("selectedCallId") || "Merged SIP call"}
          basePath={`/sip-trace/indexed-calls/${urlParams.get("selected")}`}
          close={closeDetail}
        />
      )}
    </div>
  );
}

function TraceField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="trace-field">
      <span>{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TraceSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="trace-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, text]) => (
          <option key={optionValue || "all"} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function MethodBadge({ message }: { message: SipTraceFlowMessage }) {
  const kind =
    message.responseCode && message.responseCode >= 400
      ? "error"
      : message.responseCode
        ? "response"
        : ["BYE", "CANCEL"].includes(message.method)
          ? "terminate"
          : "request";
  return (
    <span className={`sip-method ${kind}`}>
      {message.method}
      {message.hasSdp && <small>SDP</small>}
    </span>
  );
}

export function SipTraceDetailDialog({
  callId,
  basePath,
  query = "",
  customerId,
  close,
}: {
  callId: string;
  basePath: string;
  query?: string;
  customerId?: string;
  close: () => void;
}) {
  const [detail, setDetail] = useState<SipTraceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("trace");
  const [selectedMessage, setSelectedMessage] =
    useState<SipTraceFlowMessage | null>(null);
  const [rawPayload, setRawPayload] = useState<RawPayload | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);
  const [auxiliary, setAuxiliary] = useState<unknown>(null);
  const rawRequest = useRef(0);
  const suffix = query ? `?${query}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<SipTraceDetail>(
        `${basePath}/flow${suffix}`,
        customerId,
      );
      setDetail(data);
      setSelectedMessage(null);
      setRawPayload(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load call trace",
      );
    } finally {
      setLoading(false);
    }
  }, [basePath, customerId, suffix]);

  const selectMessage = useCallback(
    async (message: SipTraceFlowMessage) => {
      setSelectedMessage(message);
      setRawPayload(null);
      setRawError(null);
      if (!message.rawAvailable) return;
      const requestId = ++rawRequest.current;
      setRawLoading(true);
      try {
        const response = await api.get<SipTraceRawMessageResponse>(
          `${basePath}/messages/${encodeURIComponent(message.id)}/raw${suffix}`,
          customerId,
        );
        if (rawRequest.current === requestId) setRawPayload(response.data);
      } catch (caught) {
        if (rawRequest.current === requestId) {
          setRawError(
            caught instanceof Error
              ? caught.message
              : "Unable to load raw SIP message",
          );
        }
      } finally {
        if (rawRequest.current === requestId) setRawLoading(false);
      }
    },
    [basePath, customerId, suffix],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [close]);

  useEffect(() => {
    if (tab === "trace" || tab === "raw") return;
    const path = tab === "logs" ? "logs" : "rtcp";
    setAuxiliary(null);
    void api
      .get<unknown>(`${basePath}/${path}${suffix}`, customerId)
      .then(setAuxiliary)
      .catch((caught) =>
        setAuxiliary({
          error:
            caught instanceof Error ? caught.message : "Unable to load data",
        }),
      );
  }, [basePath, customerId, suffix, tab]);

  return (
    <div
      className="trace-detail-layer"
      role="dialog"
      aria-modal="true"
      aria-label={`SIP trace ${callId}`}
    >
      <div className="trace-detail-shell">
        <header className="trace-detail-header">
          <div>
            <div className="eyebrow">Merged call detail</div>
            <h2>SIP signaling trace</h2>
            <span className="mono">{callId}</span>
          </div>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close SIP trace"
          >
            <X size={19} />
          </button>
        </header>
        {loading ? (
          <div className="trace-detail-loading">
            <LoaderCircle className="spin" />
            <span>Loading merged call flow…</span>
          </div>
        ) : error ? (
          <div className="empty-state error-state">
            <AlertTriangle />
            <h3>Could not load SIP trace</h3>
            <p>{error}</p>
            <button className="button secondary" onClick={() => void load()}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        ) : (
          detail && (
            <>
              <div className="trace-call-summary">
                <Summary
                  icon={<Clock3 />}
                  label="Signaling span"
                  value={`${(detail.call.durationMs / 1000).toFixed(3)}s`}
                />
                <Summary
                  icon={<ArrowRight />}
                  label="Parties"
                  value={`${detail.call.caller || "—"} → ${detail.call.callee || "—"}`}
                />
                <Summary
                  icon={<Activity />}
                  label="Messages"
                  value={String(detail.call.messageCount)}
                />
                <Summary
                  icon={<RadioTower />}
                  label="Endpoints"
                  value={String(detail.call.participantCount)}
                />
              </div>
              <div className="trace-detail-tabs" role="tablist">
                <Tab id="trace" active={tab} set={setTab} icon={<RadioTower />} label="SIP Trace" />
                <Tab id="rtcp-reports" active={tab} set={setTab} icon={<Activity />} label="RTCP Reports" />
                <Tab id="rtcp-stats" active={tab} set={setTab} icon={<ChartNoAxesCombined />} label="RTCP Stats" />
                <Tab id="logs" active={tab} set={setTab} icon={<ScrollText />} label="Logs" />
                <Tab id="raw" active={tab} set={setTab} icon={<FileJson />} label="Raw Data" />
              </div>
              <div className="trace-detail-body">
                {tab === "trace" && (
                  <div className="trace-inspector-grid">
                    <SipLadder participants={detail.participants} messages={detail.messages} selected={selectedMessage?.id} onSelect={(message) => void selectMessage(message)} />
                    <RawMessage message={selectedMessage} payload={rawPayload} loading={rawLoading} error={rawError} retry={() => selectedMessage && void selectMessage(selectedMessage)} />
                  </div>
                )}
                {tab === "raw" && (
                  <div className="raw-data-layout">
                    <div className="raw-message-list">
                      {detail.messages.map((message) => (
                        <button key={message.id} className={selectedMessage?.id === message.id ? "active" : ""} onClick={() => void selectMessage(message)}>
                          <MethodBadge message={message} />
                          <span>{preciseTime(message.timestamp)}</span>
                          <small>{message.srcIp}:{message.srcPort} → {message.dstIp}:{message.dstPort}</small>
                        </button>
                      ))}
                    </div>
                    <RawMessage message={selectedMessage} payload={rawPayload} loading={rawLoading} error={rawError} retry={() => selectedMessage && void selectMessage(selectedMessage)} />
                  </div>
                )}
                {(tab === "rtcp-reports" || tab === "rtcp-stats" || tab === "logs") && <AuxiliaryData value={auxiliary} />}
              </div>
            </>
          )
        )}
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

function SipLadder({ participants, messages, selected, onSelect }: { participants: string[]; messages: SipTraceFlowMessage[]; selected?: string; onSelect: (message: SipTraceFlowMessage) => void }) {
  const left = 105;
  const column = 210;
  const width = Math.max(760, left + Math.max(participants.length - 1, 1) * column + 110);
  const row = 58;
  const top = 80;
  const height = top + messages.length * row + 30;
  return <div className="sip-ladder-scroll" aria-label="SIP ladder diagram"><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img">
    <defs><marker id="arrow-request" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#a78bfa" /></marker><marker id="arrow-response" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#67e8f9" /></marker><marker id="arrow-error" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#fb7185" /></marker></defs>
    {participants.map((participant, index) => { const x = left + index * column; return <g key={participant}><text x={x} y={23} textAnchor="middle" className="ladder-party">{participant}</text><text x={x} y={42} textAnchor="middle" className="ladder-party-sub">endpoint {index + 1}</text><line x1={x} y1={54} x2={x} y2={height - 10} className="ladder-life" /></g>; })}
    {messages.map((message, index) => {
      const source = Math.max(0, message.fromIndex);
      const target = Math.max(0, message.toIndex);
      const x1 = left + source * column;
      const x2 = left + target * column;
      const y = top + index * row;
      const isError = (message.responseCode ?? 0) >= 400;
      const isResponse = message.responseCode !== null;
      const color = isError ? "#fb7185" : isResponse ? "#67e8f9" : "#a78bfa";
      const marker = isError ? "url(#arrow-error)" : isResponse ? "url(#arrow-response)" : "url(#arrow-request)";
      return <g key={`${message.id}-${index}`} className={`ladder-message ${selected === message.id ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => onSelect(message)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(message); } }}>
        <rect x="2" y={y - 23} width={width - 4} height="48" rx="5" className="ladder-hit" />
        <text x="10" y={y - 5} className="ladder-time">{(message.elapsedMs / 1000).toFixed(3)}s</text>
        <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth="1.6" markerEnd={marker} strokeDasharray={isResponse ? "5 4" : undefined} />
        <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" fill={color} className="ladder-method">{message.method}{message.hasSdp ? " (SDP)" : ""}</text>
        <text x={(x1 + x2) / 2} y={y + 17} textAnchor="middle" className="ladder-cseq">{message.cseqMethod ? `CSeq ${message.cseqMethod}` : message.protocol}</text>
      </g>;
    })}
  </svg></div>;
}

function RawMessage({ message, payload, loading, error, retry }: { message: SipTraceFlowMessage | null; payload: RawPayload | null; loading: boolean; error: string | null; retry: () => void }) {
  return <aside className="raw-message-panel"><div className="raw-message-heading"><div><Braces size={15} /><strong>Raw SIP message</strong></div>{message && <MethodBadge message={message} />}</div>{message ? <><dl><div><dt>Source</dt><dd>{message.srcIp}:{message.srcPort}</dd></div><div><dt>Destination</dt><dd>{message.dstIp}:{message.dstPort}</dd></div><div><dt>Call-ID</dt><dd>{message.callId}</dd></div><div><dt>Captured</dt><dd>{displayTime(message.timestamp)}</dd></div></dl>{loading ? <div className="trace-detail-loading raw-loading"><LoaderCircle className="spin" size={18} /><span>Loading selected packet…</span></div> : error ? <div className="empty-state compact-empty error-state"><AlertTriangle /><h3>Raw packet unavailable</h3><p>{error}</p><button className="button secondary compact" onClick={retry}>Retry</button></div> : payload ? <pre>{payload.raw || "Capture did not include a raw payload."}</pre> : <div className="empty-state compact-empty"><Braces /><h3>No packet body loaded</h3><p>{message.rawAvailable ? "Select this ladder message to load only its raw SIP body." : "The capture record does not contain a raw SIP body."}</p></div>}</> : <div className="empty-state compact-empty"><Braces /><h3>Select a message</h3><p>Click an arrow in the ladder to fetch that packet's complete SIP headers and SDP.</p></div>}</aside>;
}

function AuxiliaryData({ value }: { value: unknown }) {
  if (value === null) return <div className="trace-detail-loading"><LoaderCircle className="spin" /><span>Loading capture details…</span></div>;
  return <div className="auxiliary-data"><pre>{JSON.stringify(value, null, 2)}</pre></div>;
}
