import { ArrowRight, Cable, FileClock, Hash, KeyRound, PhoneCall, Sparkles, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const money = (value: string | number | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));

export function CustomerDashboardPage() {
  const { user } = useAuth();
  const customer = user?.customer;
  if (!customer) {
    return (
      <div className="page">
        <div className="empty-state">Customer account data is unavailable.</div>
      </div>
    );
  }

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
          <p>{customer.name} · Account Code <strong className="mono">{customer.accountCode}</strong></p>
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
    </div>
  );
}
