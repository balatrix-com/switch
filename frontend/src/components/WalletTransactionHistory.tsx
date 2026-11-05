import { ArrowDownLeft, ArrowUpRight, Clock3, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import './WalletTransactionHistory.css';

type WalletTransaction = {
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
type Result = { data: WalletTransaction[]; pagination: { page: number; pages: number; total: number } };

const labels: Record<string, string> = {
  topup: 'Wallet top-up', adjustment: 'Admin adjustment', subscription: 'Plan minute credit',
  otc: 'One-time charge', mrc: 'Monthly recurring charge', cdr: 'Call usage', recording: 'Recording charge',
  number: 'Number charge', number_addition: 'Number addition',
};
const formatMoney = (value: number, code: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: code || 'USD' }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function minuteChanges(tx: WalletTransaction) {
  const changes: Array<[string, number]> = [
    ['TFN', Number(tx.tfnMinuteDelta || 0)],
    ['DID', Number(tx.didMinuteDelta || 0)],
    ['Outbound', Number(tx.obMinuteDelta || 0)],
  ];
  if (tx.freeMinutesUsed > 0 && tx.numberType) {
    changes.push([tx.numberType, -tx.freeMinutesUsed]);
  }
  return changes.filter(([, amount]) => amount !== 0).map(([kind, amount]) => `${kind} ${amount > 0 ? '+' : ''}${amount} min`);
}

export function WalletTransactionHistory({ customerId }: { customerId: string }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await api.get<Result>(`/billing/wallets/${encodeURIComponent(customerId)}/transactions?page=${page}&pageSize=25`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load transactions');
    } finally {
      setLoading(false);
    }
  }, [customerId, page]);
  useEffect(() => { void load(); }, [load]);

  return <section className="panel wallet-ledger">
    <header className="wallet-ledger-head">
      <div><span className="eyebrow">Account activity</span><h2>Transaction history</h2><p>Cash credits, charges, and minute changes recorded against this wallet.</p></div>
      <button type="button" className="button secondary compact" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</button>
    </header>
    {error && <p className="wallet-ledger-error" role="alert">{error}</p>}
    {loading && !result ? <p className="wallet-ledger-empty">Loading transactions…</p> : result?.data.length ? <div className="table-scroll"><table className="wallet-ledger-table"><thead><tr><th>Date & time</th><th>Transaction</th><th>Reason / reference</th><th>Minutes</th><th>Money</th><th>Balance after</th></tr></thead><tbody>{result.data.map((tx) => {
      const netDebit = Number(tx.fiatDebitAmount || 0) + Number(tx.creditDebitAmount || 0);
      const isCredit = netDebit < 0;
      const minutes = minuteChanges(tx);
      return <tr key={tx.id}>
        <td><span className="wallet-ledger-date"><Clock3 size={14} />{dateTime(tx.createdAt)}</span></td>
        <td><span className={`wallet-ledger-kind ${isCredit ? 'credit' : netDebit > 0 ? 'debit' : 'minutes'}`}>{isCredit ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}{labels[tx.sourceType] || tx.sourceType}</span></td>
        <td><strong>{tx.notes || labels[tx.sourceType] || 'Wallet transaction'}</strong>{tx.sourceRef && <small>Reference: {tx.sourceRef}</small>}</td>
        <td>{minutes.length ? minutes.map((change) => <span className="wallet-minute-change" key={change}>{change}</span>) : <span className="wallet-muted">—</span>}</td>
        <td className={`wallet-ledger-money ${isCredit ? 'credit' : netDebit > 0 ? 'debit' : ''}`}>{netDebit === 0 ? '—' : `${isCredit ? '+' : '−'}${formatMoney(Math.abs(netDebit), tx.currency)}`}</td>
        <td>{tx.balanceAfter == null ? '—' : formatMoney(Number(tx.balanceAfter), tx.currency)}</td>
      </tr>;
    })}</tbody></table></div> : !error && <p className="wallet-ledger-empty">No transactions have been recorded for this customer yet.</p>}
    {result && result.pagination.pages > 1 && <footer className="wallet-ledger-pagination"><span>{result.pagination.total} transactions · Page {result.pagination.page} of {result.pagination.pages}</span><div><button className="button secondary compact" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button><button className="button secondary compact" disabled={page >= result.pagination.pages || loading} onClick={() => setPage(page + 1)}>Next</button></div></footer>}
  </section>;
}
