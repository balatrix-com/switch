import { ArrowDownLeft, ArrowUpRight, Clock3, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import './WalletTransactionHistory.css';

type WalletTransaction = {
  kind?: 'transaction';
  id: string;
  createdAt: string;
  sourceType: string;
  sourceRef?: string | null;
  notes?: string | null;
  status: string;
  currency: string;
  fiatDebitAmount: string | number;
  creditDebitAmount: string | number;
  balanceAfter?: string | number | null;
  freeMinutesUsed: number;
  numberType?: string | null;
  tfnMinuteDelta: number;
  didMinuteDelta: number;
  obMinuteDelta: number;
};
type DailyUsage = {
  kind: 'usage'; id: string; usageDate: string; currency: string;
  callCount: number; recordingBatches: number; freeMinutesUsed: number;
  callCharge: string; recordingCharge: string;
};
type Result = { data: Array<WalletTransaction | DailyUsage>; pagination: { page: number; pages: number; total: number } };

const labels: Record<string, string> = {
  topup: 'Wallet top-up', adjustment: 'Admin adjustment', subscription: 'Plan minute credit',
  otc: 'One-time charge', mrc: 'Monthly recurring charge', cdr: 'Call usage', recording: 'Recording charge',
  number: 'Number charge', number_addition: 'Number addition', credit_repayment: 'Debt repayment',
};
const formatMoney = (value: number, code: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: code || 'USD', maximumFractionDigits: 6 }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const usageDateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));

function minuteChanges(tx: WalletTransaction) {
  const changes: Array<[string, number]> = [
    ['DID', Number(tx.tfnMinuteDelta || 0) + Number(tx.didMinuteDelta || 0)],
    ['Outbound', Number(tx.obMinuteDelta || 0)],
  ];
  if (tx.freeMinutesUsed > 0 && tx.numberType && !tx.tfnMinuteDelta && !tx.didMinuteDelta && !tx.obMinuteDelta) {
    changes.push([tx.numberType === 'TFN' ? 'DID' : tx.numberType, -tx.freeMinutesUsed]);
  }
  return changes.filter(([, amount]) => amount !== 0).map(([kind, amount]) => `${kind} ${amount > 0 ? '+' : ''}${amount} min`);
}

export function WalletTransactionHistory({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'daily' | 'detailed'>('daily');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = view === 'daily' ? 'activity' : 'transactions';
      setResult(await api.get<Result>(`/billing/wallets/${encodeURIComponent(customerId)}/${endpoint}?page=${page}&pageSize=25`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load transactions');
    } finally {
      setLoading(false);
    }
  }, [customerId, page, view]);
  useEffect(() => { void load(); }, [load]);

  return <section className="panel wallet-ledger">
    <header className="wallet-ledger-head">
      <div><span className="eyebrow">Account activity</span><h2>Transaction history</h2><p>Daily call and recording totals, with original transactions available in the detailed ledger.</p></div>
      <button type="button" className="button secondary compact" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>
    </header>
    <div className="wallet-ledger-views" role="group" aria-label="Transaction history view">
      <button type="button" className={`button compact ${view === 'daily' ? 'primary' : 'secondary'}`} aria-pressed={view === 'daily'} onClick={() => { setResult(null); setLoading(true); setView('daily'); setPage(1); }}>Daily summary</button>
      <button type="button" className={`button compact ${view === 'detailed' ? 'primary' : 'secondary'}`} aria-pressed={view === 'detailed'} onClick={() => { setResult(null); setLoading(true); setView('detailed'); setPage(1); }}>Detailed ledger</button>
    </div>
    {error && <p className="wallet-ledger-error" role="alert">{error}</p>}
    {loading && !result ? <p className="wallet-ledger-empty">Loading transactions…</p> : result?.data.length ? <div className="table-scroll"><table className="wallet-ledger-table"><thead><tr><th>Date & time</th><th>Transaction</th><th>Reason / reference</th><th>Minutes</th><th>Money</th><th>Balance after</th></tr></thead><tbody>{result.data.map((tx) => {
      if (tx.kind === 'usage') {
        const callCharge = Number(tx.callCharge || 0);
        const recordingCharge = Number(tx.recordingCharge || 0);
        const total = callCharge + recordingCharge;
        const today = tx.usageDate === new Date().toISOString().slice(0, 10);
        return <tr key={tx.id}>
          <td><span className="wallet-ledger-date"><Clock3 size={14} />{usageDateLabel(tx.usageDate)} (UTC)</span></td>
          <td><span className="wallet-ledger-kind debit"><ArrowUpRight size={15} />Daily usage</span>{today && <small>Today so far</small>}</td>
          <td><strong>{tx.callCount} billed call{tx.callCount === 1 ? '' : 's'} · {tx.recordingBatches} recording billing batch{tx.recordingBatches === 1 ? '' : 'es'}</strong><small>Calls {formatMoney(callCharge, tx.currency)} · Recording {formatMoney(recordingCharge, tx.currency)}</small></td>
          <td>{tx.freeMinutesUsed ? <span className="wallet-minute-change">{tx.freeMinutesUsed} included min used</span> : <span className="wallet-muted">—</span>}</td>
          <td className="wallet-ledger-money debit">{total ? `−${formatMoney(total, tx.currency)}` : '—'}</td>
          <td className="wallet-muted" title="A daily usage total is not an end-of-day wallet balance">—</td>
        </tr>;
      }
      // For call/recording usage, the legacy fiat column is the total charge;
      // creditDebitAmount identifies the credit-funded portion, not a second charge.
      const netDebit = Number(tx.fiatDebitAmount || 0);
      const isCredit = netDebit < 0;
      const minutes = minuteChanges(tx);
      return <tr key={tx.id}>
        <td><span className="wallet-ledger-date"><Clock3 size={14} />{dateTime(tx.createdAt)}</span></td>
        <td><span className={`wallet-ledger-kind ${isCredit ? 'credit' : netDebit > 0 ? 'debit' : 'minutes'}`}>{isCredit ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}{labels[tx.sourceType] || tx.sourceType}</span></td>
        <td><strong>{tx.notes || labels[tx.sourceType] || 'Wallet transaction'}</strong>{tx.sourceRef && <small>Reference: {tx.sourceRef}</small>}{Number(tx.creditDebitAmount || 0) > 0 && <small>Credit-funded portion: {formatMoney(Number(tx.creditDebitAmount), tx.currency)}</small>}{tx.sourceType === 'credit_repayment' && <small>Previously billed debt settled; not a new usage charge.</small>}</td>
        <td>{minutes.length ? minutes.map((change) => <span className="wallet-minute-change" key={change}>{change}</span>) : <span className="wallet-muted">—</span>}</td>
        <td className={`wallet-ledger-money ${isCredit ? 'credit' : netDebit > 0 ? 'debit' : ''}`}>{netDebit === 0 ? '—' : `${isCredit ? '+' : '−'}${formatMoney(Math.abs(netDebit), tx.currency)}`}</td>
        <td>{tx.balanceAfter == null ? '—' : formatMoney(Number(tx.balanceAfter), tx.currency)}</td>
      </tr>;
    })}</tbody></table></div> : !error && <p className="wallet-ledger-empty">No transactions have been recorded for this customer yet.</p>}
    {result && result.pagination.pages > 1 && <footer className="wallet-ledger-pagination"><span>{result.pagination.total} {view === 'daily' ? 'activity rows' : 'transactions'} · Page {result.pagination.page} of {result.pagination.pages}</span><div><button className="button secondary compact" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><button className="button secondary compact" disabled={page >= result.pagination.pages || loading} onClick={() => setPage(page + 1)}>Next</button></div></footer>}
  </section>;
}
