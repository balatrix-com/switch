import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  FileClock,
  Headphones,
  LoaderCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiBaseUrl, authToken } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { Cdr, Customer, PaginatedCdr } from "../types";

const formatMoney = (value?: string | null, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(value || 0),
  );

const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(value))
    : "—";

export function CdrPage() {
  return (
    <div className="page cdr-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Billing records</div>
          <h1>Call detail records</h1>
          <p>
            Finalized one-row-per-call records with customer revenue, carrier
            cost, rating state, and call outcome.
          </p>
        </div>
      </header>
      <CdrTable />
    </div>
  );
}

export function CustomerCdr({ customer }: { customer: Customer }) {
  return (
    <CdrTable
      customerId={customer.id}
      title={`${customer.name} call detail records`}
    />
  );
}

function CdrTable({
  customerId,
  title = "All calls",
}: {
  customerId?: string;
  title?: string;
}) {
  const { user } = useAuth();
  const showVendor = user?.role === "SUPER_ADMIN";
  const [result, setResult] = useState<PaginatedCdr | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("");
  const [ratingStatus, setRatingStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (customerId) params.set("customerId", customerId);
    if (search.trim()) params.set("search", search.trim());
    if (direction) params.set("direction", direction);
    if (ratingStatus) params.set("ratingStatus", ratingStatus);
    try {
      setResult(await api.get<PaginatedCdr>(`/cdrs?${params}`));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load CDRs",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId, direction, page, ratingStatus, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [load, search]);

  const pageTotals = useMemo(
    () =>
      (result?.data || []).reduce(
        (totals, cdr) => ({
          revenue: totals.revenue + Number(cdr.customerCharge || 0),
          cost: totals.cost + Number(cdr.carrierCost || 0),
          rated: totals.rated + (cdr.ratingStatus === "RATED" ? 1 : 0),
        }),
        { revenue: 0, cost: 0, rated: 0 },
      ),
    [result],
  );

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setPage(1);
    setter(value);
  };

  return (
    <div className="cdr-stack">
      <div className="cdr-summary">
        <div className="cdr-summary-card">
          <div className="cdr-summary-icon green">
            <CircleDollarSign size={18} />
          </div>
          <div className="cdr-summary-content">
            <span className="cdr-summary-label">Page Revenue</span>
            <strong className="cdr-summary-val mono">{formatMoney(String(pageTotals.revenue))}</strong>
          </div>
        </div>
        {showVendor && (
          <div className="cdr-summary-card">
            <div className="cdr-summary-icon blue">
              <CircleDollarSign size={18} />
            </div>
            <div className="cdr-summary-content">
              <span className="cdr-summary-label">Carrier Cost</span>
              <strong className="cdr-summary-val mono">{formatMoney(String(pageTotals.cost))}</strong>
            </div>
          </div>
        )}
        <div className="cdr-summary-card">
          <div className="cdr-summary-icon violet">
            <FileClock size={18} />
          </div>
          <div className="cdr-summary-content">
            <span className="cdr-summary-label">Rated on Page</span>
            <strong className="cdr-summary-val mono">
              {pageTotals.rated} / {result?.data.length || 0}
            </strong>
          </div>
        </div>
        <div className="cdr-summary-card">
          <div className="cdr-summary-icon amber">
            <Clock3 size={18} />
          </div>
          <div className="cdr-summary-content">
            <span className="cdr-summary-label">Total Records</span>
            <strong className="cdr-summary-val mono">{result?.pagination.total || 0}</strong>
          </div>
        </div>
      </div>
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">Final CDR table</div>
            <h2>{title}</h2>
          </div>
          <button
            className="button ghost compact"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
        </div>
        <div className="toolbar cdr-toolbar">
          <label className="search-box">
            <Search size={15} />
            <input
              aria-label="Search CDRs"
              placeholder="UUID, caller, called number…"
              value={search}
              onChange={(event) => updateFilter(setSearch, event.target.value)}
            />
          </label>
          <label className="select-box">
            <select
              aria-label="Direction"
              value={direction}
              onChange={(event) =>
                updateFilter(setDirection, event.target.value)
              }
            >
              <option value="">All directions</option>
              <option value="INBOUND">Inbound</option>
              <option value="OUTBOUND">Outbound</option>
            </select>
          </label>
          <label className="select-box">
            <select
              aria-label="Rating status"
              value={ratingStatus}
              onChange={(event) =>
                updateFilter(setRatingStatus, event.target.value)
              }
            >
              <option value="">All rating states</option>
              <option value="RATED">Rated</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="ERROR">Error</option>
              <option value="REVIEW">Review</option>
            </select>
          </label>
          <span className="toolbar-spacer" />
          <span className="inventory-count">
            {result?.pagination.total || 0} records
          </span>
        </div>
        {loading && !result ? (
          <div className="loading-grid">
            <div />
            <div />
            <div />
            <div />
          </div>
        ) : error ? (
          <div className="empty-state error-state">
            <AlertTriangle />
            <h3>Could not load CDRs</h3>
            <p>{error}</p>
            <button className="button secondary" onClick={() => void load()}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="cdr-table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Direction</th>
                    <th>Caller → destination</th>
                    <th>Duration</th>
                    <th>Call</th>
                    <th>Rating</th>
                    <th>Customer</th>
                    {showVendor && <th>Carrier</th>}
                    {showVendor && <th>Margin</th>}
                    <th>Recording</th>
                    <th>Session</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.data.map((cdr) => (
                    <CdrRow key={cdr.id} cdr={cdr} showVendor={showVendor} />
                  ))}
                </tbody>
              </table>
              {!result?.data.length && (
                <div className="empty-state compact-empty">
                  <FileClock />
                  <h3>No CDRs found</h3>
                  <p>
                    Completed call records will appear after the live-call
                    promotion worker inserts them into the CDR table.
                  </p>
                </div>
              )}
            </div>
            <div className="pagination-bar">
              <span>
                Page {result?.pagination.page || 1} of{" "}
                {Math.max(result?.pagination.pages || 1, 1)}
              </span>
              <div>
                <button
                  className="button secondary compact"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
                <button
                  className="button secondary compact"
                  disabled={page >= (result?.pagination.pages || 1) || loading}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
        {loading && result && (
          <div className="table-refreshing">
            <LoaderCircle className="spin" size={14} /> Updating records
          </div>
        )}
      </section>
    </div>
  );
}

function CdrRow({ cdr, showVendor }: { cdr: Cdr; showVendor: boolean }) {
  const margin = Number(cdr.customerCharge || 0) - Number(cdr.carrierCost || 0);

  return (
    <tr>
      <td>
        <strong>{formatDate(cdr.startedAt)}</strong>
        <span className="table-sub">CDR #{cdr.id}</span>
      </td>
      <td>
        <span className={`direction ${cdr.direction.toLowerCase()}`}>
          {cdr.direction === "INBOUND" ? (
            <ArrowDownLeft size={13} />
          ) : (
            <ArrowUpRight size={13} />
          )}
          {cdr.direction}
        </span>
      </td>
      <td>
        <strong className="mono">{cdr.callerNumber || "—"}</strong>
        <span className="table-sub mono">→ {cdr.destinationNumber || "—"}</span>
      </td>
      <td className="mono">
        <strong>{cdr.billsec || 0}s</strong>
        <span className="table-sub">
          rated {cdr.ratedSeconds ?? "—"}s
          {showVendor && <> / cost {cdr.carrierRatedSeconds ?? "—"}s</>}
        </span>
      </td>
      <td>
        <span className={`call-state ${cdr.callStatus.toLowerCase()}`}>
          {cdr.callStatus}
        </span>
        <span className="table-sub">{cdr.hangupCause || "—"}</span>
      </td>
      <td>
        <span className={`rating-state ${cdr.ratingStatus.toLowerCase()}`}>
          {cdr.ratingStatus}
        </span>
        {cdr.ratingError && (
          <span className="table-sub rating-error" title={cdr.ratingError}>
            {cdr.ratingError}
          </span>
        )}
      </td>
      <td>
        <strong className="money-positive">
          {formatMoney(cdr.customerCharge, cdr.currency)}
        </strong>
        <span className="table-sub">{cdr.sellRatePerMinute || "—"} / min</span>
      </td>
      {showVendor && <td>
        <strong>
          {formatMoney(cdr.carrierCost, cdr.carrierCurrency || cdr.currency)}
        </strong>
        <span className="table-sub">
          {cdr.carrierRatePerMinute || "—"} / min
        </span>
      </td>}
      {showVendor && <td>
        <strong className={margin >= 0 ? "money-positive" : "money-negative"}>
          {formatMoney(String(margin), cdr.currency)}
        </strong>
      </td>}
      <td>
        {cdr.hasRecording ? (
          <div className="recording-cell">
            <span className="status-badge active"><span />Yes</span>
            <AuthenticatedRecording sessionUuid={cdr.sessionUuid} customerId={cdr.customerId} />
          </div>
        ) : (
          <span className="status-badge inactive"><span />No</span>
        )}
      </td>
      <td>
        <span className="mono session-id" title={cdr.sessionUuid}>
          {cdr.sessionUuid}
        </span>
        <span className="table-sub">customer {cdr.customerId}</span>
      </td>
    </tr>
  );
}

function AuthenticatedRecording({ sessionUuid, customerId }: { sessionUuid: string; customerId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/recordings/${encodeURIComponent(sessionUuid)}`, {
        headers: { Authorization: `Bearer ${authToken.get() || ''}`, 'X-Customer-ID': customerId },
      });
      if (!response.ok) throw new Error(`Recording unavailable (${response.status})`);
      setUrl(URL.createObjectURL(await response.blob()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load recording');
    } finally {
      setLoading(false);
    }
  };

  if (url) return <audio aria-label={`Recording ${sessionUuid}`} controls src={url} />;
  return <span className="recording-action"><button className="button ghost compact" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle className="spin" size={14} /> : <Headphones size={14} />} Play recording</button>{error && <span className="table-sub rating-error">{error}</span>}</span>;
}
