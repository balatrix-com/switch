import { Activity, Download, PhoneCall, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { UiButton, UiField, UiSelect, UiSkeleton } from '../components/ui/Primitives';
import './AnalyticsPage.css';

type Stats = {
  total: number; answered: number; unanswered: number; busy: number; failed: number;
  asr: number; acdSeconds: number; billsec: number; minutes: number;
  revenue: number; carrierCost?: number; margin?: number | null; foreignCostCalls?: number;
};
type Ranking = Stats & { key: string; name: string | null; currency?: string };
type Analytics = {
  range: { from: string; to: string; direction: string };
  summary: Stats;
  money: { currency: string; revenue: number; carrierCost?: number; margin?: number | null; foreignCostCalls?: number }[];
  series: { day: string; total: number; answered: number }[];
  dids: Ranking[]; tenants: Ranking[]; carriers: Ranking[];
};
type Preset = 'today' | 'seven' | 'custom';
type Direction = 'ALL' | 'INBOUND' | 'OUTBOUND';

const dateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localMidnight = (day: string) => new Date(`${day}T00:00:00`);
const number = (value: number, digits = 0) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
const money = (value: number, currency: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
const duration = (seconds: number) => `${number(Math.floor(seconds / 60))}m ${number(Math.round(seconds % 60))}s`;

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? '');
  const safe = typeof value === 'string' && /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadCsv(data: Analytics, isAdmin: boolean) {
  const header = ['Group', 'Name / date', 'Currency', 'Total calls', 'Answered', 'Unanswered', 'Busy', 'Failed', 'ASR %', 'ACD seconds', 'Billsec', 'Minutes', 'Revenue', 'Carrier cost', 'Margin'];
  const rows: Array<Array<string | number | null | undefined>> = [header];
  const add = (group: string, name: string, row: Stats, currency?: string) => rows.push([group, name, currency, row.total, row.answered, row.unanswered, row.busy, row.failed, row.asr.toFixed(2), row.acdSeconds.toFixed(2), row.billsec, row.minutes.toFixed(2), currency ? row.revenue.toFixed(6) : '', currency && isAdmin ? row.carrierCost?.toFixed(6) : '', currency && isAdmin ? row.margin?.toFixed(6) : '']);
  add('Summary', `${data.range.from} – ${data.range.to}`, data.summary);
  data.money.forEach((row) => rows.push(['Billing currency', row.currency, row.currency, '', '', '', '', '', '', '', '', '', row.revenue.toFixed(6), isAdmin ? row.carrierCost?.toFixed(6) : '', isAdmin ? row.margin?.toFixed(6) : '']));
  data.dids.forEach((row) => add('DID', row.name || row.key, row, row.currency));
  if (isAdmin) {
    data.tenants.forEach((row) => add('Tenant', row.name || row.key, row, row.currency));
    data.carriers.forEach((row) => add('Carrier', row.name || row.key, row, row.currency));
  }
  data.series.forEach((row) => rows.push(['Daily volume', row.day, '', row.total, row.answered]));
  const content = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `call-analytics-${data.range.from.slice(0, 10)}-${data.range.to.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function RankingTable({ title, description, rows, financial = false }: { title: string; description: string; rows: Ranking[]; financial?: boolean }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * 25, currentPage * 25);
  return <section className="panel analytics-panel">
    <div className="analytics-panel-head">
      <div><span className="eyebrow">Call quality</span><h2>{title}</h2><p>{description}</p></div>
      <span className="analytics-row-count">{number(rows.length)} rows</span>
    </div>
    {rows.length ? <>
      <div className="table-scroll"><table className="analytics-table">
        <thead><tr>
          <th>Rank</th><th>{title === 'DID ranking' ? 'Number' : title === 'Tenant breakdown' ? 'Tenant' : 'Carrier'}</th>
          <th>Calls</th><th>Answered</th><th>ASR</th><th>ACD</th><th>Minutes</th>
          {financial && <><th>Revenue</th><th>Carrier cost</th><th>Margin</th></>}
        </tr></thead>
        <tbody>{visible.map((row, index) => <tr key={`${row.key}-${row.currency || ''}`}>
          <td>{(currentPage - 1) * 25 + index + 1}</td>
          <td><strong>{row.name || row.key}</strong>{row.currency && <small>{row.currency}</small>}</td>
          <td>{number(row.total)}</td><td>{number(row.answered)}</td><td>{number(row.asr, 1)}%</td>
          <td>{duration(row.acdSeconds)}</td><td>{number(row.minutes, 1)}</td>
          {financial && <>
            <td>{money(row.revenue, row.currency || 'USD')}</td>
            <td>{money(row.carrierCost ?? 0, row.currency || 'USD')}</td>
            <td>{row.margin == null ? '—' : money(row.margin, row.currency || 'USD')}</td>
          </>}
        </tr>)}</tbody>
      </table></div>
      {pages > 1 && <div className="analytics-pagination">
        <span>Page {currentPage} of {pages}</span>
        <UiButton disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</UiButton>
        <UiButton disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Next</UiButton>
      </div>}
    </> : <p className="analytics-empty">No calls in this range.</p>}
  </section>;
}

export function AnalyticsPage({ customerId }: { customerId?: string } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const [preset, setPreset] = useState<Preset>('seven');
  const [direction, setDirection] = useState<Direction>('ALL');
  const [start, setStart] = useState(dateInput(new Date(Date.now() - 6 * 86_400_000)));
  const [end, setEnd] = useState(dateInput(new Date()));
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const today = localMidnight(dateInput(new Date()));
    let from = new Date(today);
    let to = new Date(today);
    to.setDate(to.getDate() + 1);
    if (preset === 'seven') from.setDate(from.getDate() - 6);
    if (preset === 'custom') {
      from = localMidnight(start);
      to = localMidnight(end);
      to.setDate(to.getDate() + 1);
    }
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to || to.getTime() - from.getTime() > 366 * 86_400_000) {
      setError('Choose a valid date range of at most 366 days.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
    if (direction !== 'ALL') params.set('direction', direction);
    if (isAdmin && customerId) params.set('customerId', customerId);
    void api.get<Analytics>(`/analytics?${params}`).then((result) => { if (active) setData(result); }).catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : 'Analytics could not be loaded'); setData(null); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [preset, direction, start, end, revision, isAdmin, customerId]);

  const maxCalls = Math.max(1, ...(data?.series.map((row) => row.total) || []));
  return <main className="page analytics-page">
    <div className="analytics-heading"><div><span className="eyebrow">Traffic intelligence</span><h1>Call Analytics</h1><p>{isAdmin ? customerId ? `Customer ${customerId} traffic and DID performance.` : 'Platform-wide traffic, carrier quality and billing performance.' : 'Your call volume, pickup ratio, DID performance and billed spend.'}</p></div><div className="analytics-heading-actions"><UiButton onClick={() => setRevision((value) => value + 1)} disabled={loading}><RefreshCw size={16} /> Refresh</UiButton><UiButton variant="primary" disabled={!data || loading} onClick={() => data && downloadCsv(data, isAdmin)}><Download size={16} /> Export CSV</UiButton></div></div>
    <section className="panel analytics-filters" aria-label="Analytics filters"><UiField label="Date range"><UiSelect value={preset} onChange={(event) => setPreset(event.target.value as Preset)}><option value="today">Today</option><option value="seven">Last 7 days</option><option value="custom">Custom</option></UiSelect></UiField>{preset === 'custom' && <><UiField label="From"><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></UiField><UiField label="Through"><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></UiField></>}<UiField label="Traffic direction"><UiSelect value={direction} onChange={(event) => setDirection(event.target.value as Direction)}><option value="ALL">All calls</option><option value="INBOUND">Inbound</option><option value="OUTBOUND">Outbound</option></UiSelect></UiField></section>
    {error && <div className="analytics-error" role="alert">{error} <UiButton onClick={() => setRevision((value) => value + 1)}>Retry</UiButton></div>}
    {loading && !data && <UiSkeleton rows={5} />}
    {data && !error && <>
      <div className="analytics-metrics" aria-busy={loading}><div className="analytics-metric"><PhoneCall size={20} /><span>Total calls</span><strong>{number(data.summary.total)}</strong><small>{number(data.summary.answered)} answered · {number(data.summary.unanswered)} no answer · {number(data.summary.busy)} busy · {number(data.summary.failed)} failed</small></div><div className="analytics-metric"><Activity size={20} /><span>ASR · Pickup ratio</span><strong>{number(data.summary.asr, 1)}%</strong><small>Answered ÷ total call attempts</small></div><div className="analytics-metric"><Activity size={20} /><span>ACD · Average duration</span><strong>{duration(data.summary.acdSeconds)}</strong><small>Answered billsec ÷ answered calls</small></div><div className="analytics-metric"><PhoneCall size={20} /><span>Total minutes</span><strong>{number(data.summary.minutes, 1)}</strong><small>Actual answered billsec ÷ 60</small></div></div>
      <section className="panel analytics-panel"><div className="analytics-panel-head"><div><span className="eyebrow">Billing totals</span><h2>{isAdmin ? 'Revenue, cost & margin' : 'Total billed spend'}</h2><p>Only finalized charges present in the CDR are included. Currencies are never combined.</p></div></div>{data.money.length ? <div className="analytics-financials">{data.money.map((row) => <div className="analytics-financial" key={row.currency}><span className="analytics-currency">{row.currency}</span><div><small>{isAdmin ? 'Customer revenue' : 'Billed spend'}</small><strong>{money(row.revenue, row.currency)}</strong></div>{isAdmin && <><div><small>Carrier cost</small><strong>{money(row.carrierCost ?? 0, row.currency)}</strong></div><div><small>Margin</small><strong>{row.margin == null ? 'Not comparable' : money(row.margin, row.currency)}</strong></div></>}{(row.foreignCostCalls ?? 0) > 0 && isAdmin && <small className="analytics-warning">{row.foreignCostCalls} carrier costs use another currency; margin is hidden until conversion.</small>}</div>)}</div> : <p className="analytics-empty">No rated charges in this range.</p>}</section>
      <section className="panel analytics-panel"><div className="analytics-panel-head"><div><span className="eyebrow">Volume over time</span><h2>Daily calls</h2><p>UTC calendar days · total and answered calls</p></div></div>{data.series.length ? <div className="analytics-chart-scroll"><div className="analytics-chart" role="img" aria-label="Daily total and answered call volume chart">{data.series.map((row) => <div className="analytics-day" key={row.day} title={`${row.day}: ${row.total} calls, ${row.answered} answered`}><div className="analytics-bars"><span className="analytics-total-bar" style={{ height: `${row.total ? Math.max(2, row.total / maxCalls * 100) : 0}%` }} /><span className="analytics-answered-bar" style={{ height: `${row.answered ? Math.max(2, row.answered / maxCalls * 100) : 0}%` }} /></div><span>{row.day.slice(5)}</span></div>)}</div></div> : <p className="analytics-empty">No calls in this range.</p>}<div className="analytics-legend"><span><i className="analytics-total-key" />Total</span><span><i className="analytics-answered-key" />Answered</span></div></section>
      <table className="sr-only"><caption>Daily call volume data</caption><thead><tr><th>UTC day</th><th>Total calls</th><th>Answered calls</th></tr></thead><tbody>{data.series.map((row) => <tr key={row.day}><td>{row.day}</td><td>{row.total}</td><td>{row.answered}</td></tr>)}</tbody></table>
      <RankingTable title="DID ranking" description="Inbound calls by assigned DID; this table stays inbound even when the headline filter is outbound." rows={data.dids} />
      {isAdmin && !customerId && <><RankingTable title="Tenant breakdown" description="One row per tenant and billing currency." rows={data.tenants} financial /><RankingTable title="Carrier breakdown" description="Trunk quality by outbound/inbound carrier identification. Unmapped traffic is shown separately." rows={data.carriers} financial /></>}
    </>}
  </main>;
}
