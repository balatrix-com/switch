import {
  ArrowDownLeft,
  ArrowUpRight,
  LoaderCircle,
  Headphones,
  PhoneOff,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Customer } from "../types";

type LiveCall = {
  uuid: string;
  bUuid?: string | null;
  direction: string;
  accountcode?: string | null;
  callerName?: string | null;
  callerNumber?: string | null;
  destinationNumber?: string | null;
  state?: string | null;
  createdEpoch: number;
  durationSeconds: number;
  readCodec?: string | null;
  writeCodec?: string | null;
  carrierIp?: string | null;
  customer?: { id: string; accountCode: string; name: string } | null;
  carrier?: { id: string; name: string } | null;
};

type LiveCallsPayload = {
  calls: LiveCall[];
  summary: {
    activeCalls: number;
    activeChannels: number;
    inbound: number;
    outbound: number;
    activeTenants: number;
  };
  polledAt: number;
};

const intervals = [3, 5, 10, 0] as const;

export function LiveCallsPage({
  customer,
  notify,
}: {
  customer?: Customer;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [payload, setPayload] = useState<LiveCallsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshSeconds, setRefreshSeconds] = useState<number>(3);
  const [countdown, setCountdown] = useState(3);
  const [customerFilter, setCustomerFilter] = useState("");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [direction, setDirection] = useState("");
  const [search, setSearch] = useState("");
  const [, tick] = useState(0);
  const [listeningUuid, setListeningUuid] = useState<string | null>(null);

  const listen = async (call: LiveCall) => {
    const customerId = customer?.id || call.customer?.id;
    if (!customerId) {
      notify("This call is not attributed to a customer.", "error");
      return;
    }
    setListeningUuid(call.uuid);
    try {
      const result = await api.post<{ extension: string }>(
        `/live-calls/${call.uuid}/listen`,
        {},
        customerId,
      );
      notify(
        `Ringing monitor extension ${result.extension}... Answer your softphone to listen.`,
      );
    } catch (caught) {
      notify(
        caught instanceof Error ? caught.message : "Unable to start listening",
        "error",
      );
    } finally {
      setListeningUuid(null);
    }
  };

  // --- CHANGE 1: Removed setCountdown from 'finally' and removed refreshSeconds from dependencies ---
  const load = useCallback(async () => {
    setError(null);
    try {
      setPayload(await api.get<LiveCallsPayload>("/live-calls", customer?.id));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load live calls",
      );
    } finally {
      setLoading(false);
    }
  }, [customer?.id]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  // --- CHANGE 2: Added immediate reset of countdown when interval changes ---
  useEffect(() => {
    if (!refreshSeconds) {
      setCountdown(0);
      return;
    }

    // Reset countdown immediately when a new interval is selected
    setCountdown(refreshSeconds);

    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          void load();
          return refreshSeconds;
        }
        return value - 1;
      });
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [load, refreshSeconds]);

  const calls = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (payload?.calls ?? []).filter(
      (call) =>
        (!customerFilter || call.customer?.id === customerFilter) &&
        (!carrierFilter || call.carrier?.id === carrierFilter) &&
        (!direction || call.direction === direction) &&
        (!needle ||
          [
            call.uuid,
            call.bUuid,
            call.callerName,
            call.callerNumber,
            call.destinationNumber,
          ].some((value) => value?.toLowerCase().includes(needle))),
    );
  }, [payload, customerFilter, carrierFilter, direction, search]);
  const customers = uniqueOptions(payload?.calls ?? [], "customer");
  const carriers = uniqueOptions(payload?.calls ?? [], "carrier");

  return (
    <div className="page live-calls-page">
      <div className="page-header">
        <div>
          <h1>{customer ? `${customer.name} live calls` : "Live Calls"}</h1>
          <p>
            Current FreeSWITCH calls, refreshed directly from the Event Socket.
          </p>
        </div>
        <div className="live-refresh-controls">
          <select
            value={refreshSeconds}
            onChange={(event) => setRefreshSeconds(Number(event.target.value))}
            aria-label="Refresh interval"
          >
            {intervals.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds ? `${seconds}s` : "Paused"}
              </option>
            ))}
          </select>
          <span>
            {refreshSeconds
              ? `Refresh in ${countdown}s`
              : "Auto-refresh paused"}
          </span>
          {/* --- CHANGE 3: Manual refresh button now also resets the countdown timer --- */}
          <button
            className="button secondary compact"
            onClick={() => {
              void load();
              setCountdown(refreshSeconds);
            }}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      <section className="live-metrics">
        <Metric
          label="Active calls"
          value={payload?.summary.activeCalls ?? 0}
        />
        <Metric
          label="Active channels"
          value={payload?.summary.activeChannels ?? 0}
        />
        <Metric
          label="Inbound / Outbound"
          value={`${payload?.summary.inbound ?? 0} / ${payload?.summary.outbound ?? 0}`}
        />
        <Metric
          label="Active tenants"
          value={payload?.summary.activeTenants ?? 0}
        />
      </section>

      <section className="panel table-panel">
        <div className="toolbar live-call-filters">
          <label className="search-box">
            <Search size={15} />
            <input
              aria-label="Search live calls"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Caller, number, or UUID"
            />
          </label>
          {!customer && (
            <select
              aria-label="Filter by customer"
              value={customerFilter}
              onChange={(event) => setCustomerFilter(event.target.value)}
            >
              <option value="">All customers</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Filter by carrier"
            value={carrierFilter}
            onChange={(event) => setCarrierFilter(event.target.value)}
          >
            <option value="">All carriers</option>
            {carriers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by direction"
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="">All directions</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        {loading && !payload ? (
          <div className="empty-state">
            <LoaderCircle className="spin" />
            <h3>Loading live calls</h3>
          </div>
        ) : error ? (
          <div className="empty-state error-state">
            <PhoneOff />
            <h3>Live monitoring unavailable</h3>
            <p>{error}</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="empty-state">
            <PhoneOff />
            <h3>No active calls</h3>
            <p>Calls will appear here within the selected refresh interval.</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="live-calls-table">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Caller</th>
                  <th>Destination</th>
                  <th>Customer</th>
                  <th>Carrier</th>
                  <th>State</th>
                  <th>Duration</th>
                  <th>Codecs</th>
                  <th>Monitor</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.uuid}>
                    <td>
                      <span
                        className={`direction ${call.direction === "inbound" ? "inbound" : "outbound"}`}
                      >
                        {call.direction === "inbound" ? (
                          <ArrowDownLeft size={13} />
                        ) : (
                          <ArrowUpRight size={13} />
                        )}
                        {call.direction}
                      </span>
                    </td>
                    <td>
                      {call.callerName || "Unknown"}
                      <span className="table-sub">
                        {call.callerNumber || "—"}
                      </span>
                    </td>
                    <td>
                      {call.destinationNumber || "—"}
                      <span className="table-sub">{call.uuid}</span>
                    </td>
                    <td>
                      {call.customer?.name || "Unattributed"}
                      <span className="table-sub">
                        {call.customer
                          ? `${call.customer.accountCode} · ID: ${call.customer.id}`
                          : (call.accountcode || "—")}
                      </span>
                    </td>
                    <td>
                      {call.carrier?.name || "Unknown"}
                      <span className="table-sub">{call.carrierIp || "—"}</span>
                    </td>
                    <td>
                      <span className="status-badge active">
                        <span />
                        {call.state || "Active"}
                      </span>
                    </td>
                    <td className="live-duration">
                      {formatDuration(
                        Math.max(
                          call.durationSeconds,
                          Math.floor(Date.now() / 1000) - call.createdEpoch,
                        ),
                      )}
                    </td>
                    <td>
                      {call.readCodec || "—"}
                      <span className="table-sub">
                        {call.writeCodec || "—"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button secondary compact"
                        disabled={listeningUuid === call.uuid}
                        onClick={() => void listen(call)}
                      >
                        <Headphones size={15} />{" "}
                        {listeningUuid === call.uuid ? "Calling..." : "Listen"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel live-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function uniqueOptions(calls: LiveCall[], key: "customer" | "carrier") {
  const options = calls
    .map((call) => call[key])
    .filter((value): value is { id: string; name: string } => Boolean(value));
  return [...new Map(options.map((value) => [value.id, value])).values()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );
}