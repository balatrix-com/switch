import { Cable, FileClock, Hash, KeyRound, PhoneCall, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const money = (value: string | number | undefined, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0));

export function CustomerDashboardPage() {
  const { user } = useAuth();
  const customer = user?.customer;
  if (!customer) return <div className="page"><div className="empty-state">Customer account data is unavailable.</div></div>;

  const cards = [
    { icon: WalletCards, label: 'Credit balance', value: money(customer.creditBalance, customer.currency) },
    { icon: Hash, label: 'Assigned DIDs', value: String(customer._count?.numbers ?? 0) },
    { icon: Cable, label: 'SIP extensions', value: `${customer._count?.sipUsers ?? 0} / ${customer.extensionLimit}` },
    { icon: PhoneCall, label: 'Account status', value: customer.isActive ? 'Active' : 'Suspended' },
  ];
  return (
    <div className="page">
      <div className="customer-welcome">
        <div><p className="eyebrow">Customer workspace</p><h1>Welcome, {user?.name || customer.name}</h1><p>{customer.name} · Account {customer.accountCode}</p></div>
        <span className={`status-badge ${customer.isActive ? 'active' : 'inactive'}`}><span />{customer.isActive ? 'Active' : 'Suspended'}</span>
      </div>
      <div className="kpi-grid">
        {cards.map(({ icon: Icon, label, value }) => <div className="kpi-card" key={label}><div className="kpi-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong></div></div>)}
      </div>
      <section className="panel quick-actions-panel">
        <div className="panel-heading"><div><p className="eyebrow">Shortcuts</p><h2>Manage your phone service</h2></div></div>
        <div className="quick-action-grid">
          <Link to="/numbers"><Hash size={19} /><strong>Manage DIDs</strong><span>Routing destinations and number settings</span></Link>
          <Link to="/extensions"><KeyRound size={19} /><strong>IP Authentication</strong><span>IP sources, SIP users, and registration status</span></Link>
          <Link to="/cdr"><FileClock size={19} /><strong>Call Records</strong><span>Review completed calls and billing</span></Link>
          <Link to="/live-calls"><PhoneCall size={19} /><strong>Live Calls</strong><span>View and monitor active calls</span></Link>
        </div>
      </section>
    </div>
  );
}
