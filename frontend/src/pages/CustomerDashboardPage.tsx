import { Cable, FileClock, Hash, KeyRound, PhoneCall, Sparkles, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { useCustomerPackages } from '../lib/packagesApi';
import { minuteAllowances } from '../lib/minuteAllowances';
import { CustomerRecordingBillingSection } from '../components/CustomerRecordingBillingSection';
import { CustomerPackagesSection } from '../components/CustomerPackagesSection';

const money = (value: string | number | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));

export function CustomerDashboardPage({ notify }: { notify?: (message: string, type?: 'success' | 'error') => void } = {}) {
  const { user } = useAuth();
  const customer = user?.customer;
  const { packages, error: packagesError } = useCustomerPackages(customer?.id);
  const [wallet, setWallet] = useState<{ tfnFreeMinutes: number; didFreeMinutes: number; obFreeMinutes: number } | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  useEffect(() => {
    if (!customer?.id) return;
    let active = true;
    api.get<{ tfnFreeMinutes: number; didFreeMinutes: number; obFreeMinutes: number }>(`/billing/wallets/${encodeURIComponent(customer.id)}`)
      .then((data) => { if (active) setWallet(data); })
      .catch((cause) => { if (active) setWalletError(cause instanceof Error ? cause.message : 'Wallet unavailable'); });
    return () => { active = false; };
  }, [customer?.id]);
  if (!customer) {
    return (
      <div className="page">
        <div className="empty-state">Customer account data is unavailable.</div>
      </div>
    );
  }

  const allowances = minuteAllowances(packages);
  const minuteCards = [
    { label: 'DID minutes (TFN + Local)', total: allowances.did, remaining: wallet ? wallet.didFreeMinutes + wallet.tfnFreeMinutes : undefined, tone: 'blue' },
    { label: 'Outbound minutes', total: allowances.outbound, remaining: wallet?.obFreeMinutes, tone: 'violet' },
    { label: 'General plan minutes', total: allowances.general, remaining: undefined, tone: 'amber' },
  ].filter((card) => card.total > 0);

  const cards = [
    {
      icon: WalletCards,
      label: 'Credit Balance',
      value: money(customer.creditBalance, customer.currency),
      meta: 'Available purchasing power & overdraft',
      badge: customer.currency || 'USD',
      tone: 'green',
    },
    {
      icon: Hash,
      label: 'Assigned DIDs',
      value: String(customer._count?.numbers ?? 0),
      meta: 'Active inbound telephone numbers',
      badge: 'Assigned',
      tone: 'violet',
      link: '/numbers',
    },
    {
      icon: Cable,
      label: 'SIP Extensions',
      value: `${customer._count?.sipUsers ?? 0} / ${customer.extensionLimit}`,
      meta: 'Configured PBX / monitoring users',
      badge: 'Capacity',
      tone: 'blue',
      link: '/extensions',
    },
    {
      icon: PhoneCall,
      label: 'Account Status',
      value: customer.isActive ? 'Active' : 'Suspended',
      meta: customer.isActive ? 'Direct routing enabled' : 'Service currently paused',
      badge: customer.isActive ? 'Operational' : 'Paused',
      tone: customer.isActive ? 'green' : 'amber',
      link: '/account',
    },
  ];

  return (
    <div className="page">
      <div className="customer-welcome">
        <div>
          <div className="eyebrow">Customer Workspace</div>
          <h1>Welcome, {user?.name || customer.name}</h1>
          <p>{customer.name} · Customer ID <strong className="mono">{customer.id}</strong> · Account Code <strong className="mono">{customer.accountCode}</strong></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`status-badge ${customer.isActive ? 'active' : 'inactive'}`}>
            <span />
            {customer.isActive ? 'Account Active' : 'Suspended'}
          </span>
        </div>
      </div>

      <div className="kpi-grid">
        {cards.map(({ icon: Icon, label, value, meta, badge, tone, link }) => {
          const content = (
            <>
              <div className="kpi-card-top">
                <div className="kpi-label-row">
                  <div className="kpi-icon">
                    <Icon size={18} />
                  </div>
                  <span className="kpi-title">{label}</span>
                </div>
                <span className="kpi-card-meta-badge">{badge}</span>
              </div>
              <div className="kpi-value-block">
                <strong className="kpi-main-number mono">{value}</strong>
                <span className="kpi-sub-label">{meta}</span>
              </div>
            </>
          );

          if (link) {
            return (
              <Link to={link} className={`kpi-card clickable ${tone}`} key={label} title={`View ${label}`}>
                {content}
              </Link>
            );
          }

          return (
            <div className={`kpi-card ${tone}`} key={label}>
              {content}
            </div>
          );
        })}
      </div>

      {minuteCards.length > 0 && <section className="dashboard-allowances" aria-label="Plan minute allowances">
        <div className="panel-heading"><div><span className="eyebrow">Your plan</span><h2>Minute allowances</h2><p>Total included in active plans and current wallet balance.</p></div></div>
        <div className="kpi-grid">{minuteCards.map((card) => <div className={`kpi-card ${card.tone}`} key={card.label}>
          <div className="kpi-card-top"><div className="kpi-label-row"><div className="kpi-icon"><PhoneCall size={18} /></div><span className="kpi-title">{card.label}</span></div></div>
          <div className="kpi-value-block"><strong className="kpi-main-number mono">{card.total.toLocaleString()} <small>total min</small></strong><span className="kpi-sub-label">{card.remaining === undefined ? 'Remaining pool not reported by the plan API' : `${card.remaining.toLocaleString()} min remaining`}</span></div>
        </div>)}</div>
      </section>}
      {(packagesError || walletError) && <p className="wallet-data-error" role="alert">{packagesError || walletError}</p>}

      <section className="panel quick-actions-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Shortcuts</span>
            <h2>Manage Your Telecom Service</h2>
          </div>
          <span className="live-pill">
            <Sparkles size={13} />
            <span>Direct Control</span>
          </span>
        </div>
        <div className="quick-action-grid">
          <Link to="/numbers">
            <Hash size={19} />
            <strong>Manage DIDs</strong>
            <span>Configure routing destinations, forward numbers, and call recording</span>
          </Link>
          <Link to="/extensions">
            <KeyRound size={19} />
            <strong>IP Authentication</strong>
            <span>Authorized IP sources, SIP user credentials, and registration state</span>
          </Link>
          <Link to="/cdr">
            <FileClock size={19} />
            <strong>Call Records (CDR)</strong>
            <span>Audit completed calls, billsec duration, and minute deductions</span>
          </Link>
          <Link to="/live-calls">
            <PhoneCall size={19} />
            <strong>Live Calls</strong>
            <span>Monitor ongoing active calls with real-time audio listen-in</span>
          </Link>
        </div>
      </section>

      <CustomerPackagesSection
        customer={customer}
        customerId={customer.id}
        notify={notify}
      />

      <CustomerRecordingBillingSection
        customerId={customer.id}
        customerAccountCode={customer.accountCode}
        notify={notify}
      />
    </div>
  );
}
