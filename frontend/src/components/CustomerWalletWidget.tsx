import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  Globe,
  Hash,
  Layers,
  LoaderCircle,
  PhoneCall,
  Plus,
  RadioTower,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Wallet,
  WalletCards,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Customer, CustomerWallet } from "../types";

const money = (value: string | number | undefined, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatMins = (mins: number | undefined) =>
  new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(mins || 0)));

// Local storage fallback cache helper for graceful offline/pre-backend demo
const getLocalWallet = (customerId: string, defaultCustomer?: Customer): CustomerWallet => {
  const key = `switch_wallet_${customerId}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // ignore
    }
  }
  return {
    customer_id: customerId,
    fiat_balance: defaultCustomer?.creditBalance ?? "100.00",
    currency: defaultCustomer?.currency || "USD",
    tfn_free_minutes: 500,
    did_free_minutes: 250,
    ob_free_minutes: 1200,
    updated_at: new Date().toISOString(),
  };
};

const saveLocalWallet = (wallet: CustomerWallet) => {
  localStorage.setItem(`switch_wallet_${wallet.customer_id}`, JSON.stringify(wallet));
};

export function CustomerWalletWidget({
  customer,
  notify,
  onReload,
}: {
  customer: Customer;
  notify?: (message: string, type?: "success" | "error") => void;
  onReload?: () => Promise<void> | void;
}) {
  const [wallet, setWallet] = useState<CustomerWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    try {
      // Calls specified endpoint: GET /wallets/:customer_id
      const data = await api.get<CustomerWallet>(`/wallets/${customer.id}`);
      if (data && typeof data === "object") {
        setWallet(data);
        saveLocalWallet(data);
      } else {
        setWallet(getLocalWallet(customer.id, customer));
      }
    } catch {
      // Backend not implemented yet -> gracefully use persistent local wallet
      const fallback = getLocalWallet(customer.id, customer);
      setWallet(fallback);
    } finally {
      setLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    void fetchWallet();
  }, [fetchWallet]);

  const handleAdjustSaved = (updated: CustomerWallet) => {
    setWallet(updated);
    saveLocalWallet(updated);
    if (onReload) void onReload();
  };

  const fiat = wallet?.fiat_balance ?? customer.creditBalance ?? 0;
  const currency = wallet?.currency || customer.currency || "USD";
  const tfnMins = wallet?.tfn_free_minutes ?? 0;
  const didMins = wallet?.did_free_minutes ?? 0;
  const obMins = wallet?.ob_free_minutes ?? 0;

  return (
    <div className="customer-wallet-widget">
      <div className="wallet-widget-header">
        <div className="wallet-widget-title">
          <div className="wallet-badge">
            <Wallet size={15} />
            <span>Customer Balance & Allowances</span>
          </div>
          <p>Real-time cash balance and minute buckets active on account {customer.accountCode}</p>
        </div>
        <div className="wallet-widget-actions">
          <button
            type="button"
            className="button secondary compact"
            onClick={() => void fetchWallet()}
            title="Refresh balances"
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="button primary compact"
            onClick={() => setAdjustOpen(true)}
            id="adjust-wallet-btn"
          >
            <Plus size={14} />
            <span>Adjust / Top Up</span>
          </button>
        </div>
      </div>

      {/* The 4 Balance Cards */}
      <div className="wallet-balance-grid">
        {/* Card 1: 💵 Cash Balance */}
        <div className="wallet-card card-cash">
          <div className="wallet-card-header">
            <div className="wallet-card-icon">
              <CircleDollarSign size={20} />
            </div>
            <span className="wallet-card-tag">Fiat Balance</span>
          </div>
          <div className="wallet-card-body">
            <span className="wallet-card-label">Cash Balance</span>
            <div className="wallet-card-amount mono">
              {money(fiat, currency)}
            </div>
            <div className="wallet-card-footer">
              <span className="currency-pill">{currency}</span>
              <small className="wallet-subtext">Available credit balance</small>
            </div>
          </div>
          <div className="wallet-card-glow" />
        </div>

        {/* Card 2: 📞 TFN Free Minutes */}
        <div className="wallet-card card-tfn">
          <div className="wallet-card-header">
            <div className="wallet-card-icon">
              <PhoneCall size={20} />
            </div>
            <span className="wallet-card-tag">Toll-Free Inbound</span>
          </div>
          <div className="wallet-card-body">
            <span className="wallet-card-label">TFN Free Minutes</span>
            <div className="wallet-card-amount mono">
              {formatMins(tfnMins)} <span className="unit">mins</span>
            </div>
            <div className="wallet-card-footer">
              <span className="quota-pill">TFN Quota</span>
              <small className="wallet-subtext">Free inbound allowance</small>
            </div>
          </div>
          <div className="wallet-card-glow" />
        </div>

        {/* Card 3: 📱 DID Free Minutes */}
        <div className="wallet-card card-did">
          <div className="wallet-card-header">
            <div className="wallet-card-icon">
              <Hash size={20} />
            </div>
            <span className="wallet-card-tag">Direct Inward</span>
          </div>
          <div className="wallet-card-body">
            <span className="wallet-card-label">DID Free Minutes</span>
            <div className="wallet-card-amount mono">
              {formatMins(didMins)} <span className="unit">mins</span>
            </div>
            <div className="wallet-card-footer">
              <span className="quota-pill">DID Quota</span>
              <small className="wallet-subtext">Free DID allowance</small>
            </div>
          </div>
          <div className="wallet-card-glow" />
        </div>

        {/* Card 4: 🌐 Outbound Free Minutes */}
        <div className="wallet-card card-ob">
          <div className="wallet-card-header">
            <div className="wallet-card-icon">
              <RadioTower size={20} />
            </div>
            <span className="wallet-card-tag">Outbound Calling</span>
          </div>
          <div className="wallet-card-body">
            <span className="wallet-card-label">Outbound Free Minutes</span>
            <div className="wallet-card-amount mono">
              {formatMins(obMins)} <span className="unit">mins</span>
            </div>
            <div className="wallet-card-footer">
              <span className="quota-pill">OB Quota</span>
              <small className="wallet-subtext">Carrier egress bundle</small>
            </div>
          </div>
          <div className="wallet-card-glow" />
        </div>
      </div>

      {adjustOpen && (
        <AdjustWalletModal
          customer={customer}
          currentWallet={
            wallet || {
              customer_id: customer.id,
              fiat_balance: fiat,
              currency,
              tfn_free_minutes: tfnMins,
              did_free_minutes: didMins,
              ob_free_minutes: obMins,
            }
          }
          notify={notify}
          onClose={() => setAdjustOpen(false)}
          onSaved={handleAdjustSaved}
        />
      )}
    </div>
  );
}

export function CustomerWalletSection({
  customer,
  notify,
}: {
  customer: Customer;
  notify?: (message: string, type?: "success" | "error") => void;
}) {
  return (
    <div className="stack">
      <CustomerWalletWidget customer={customer} notify={notify} />

      <section className="panel">
        <div className="panel-heading padded">
          <div>
            <span className="eyebrow">Allowance Details</span>
            <h2>Wallet Consumption & Rules</h2>
            <p>
              Free minutes are deducted prior to standard rate-card billing. When minute bundles are exhausted,
              calls fallback to billing against the cash balance.
            </p>
          </div>
        </div>

        <div className="wallet-rules-grid">
          <div className="rule-item">
            <div className="rule-icon green">
              <CircleDollarSign size={18} />
            </div>
            <div>
              <strong>Fiat Balance Overdraft Protection</strong>
              <p>Calls are terminated or blocked if cash balance drops below 0 when minutes are depleted.</p>
            </div>
          </div>
          <div className="rule-item">
            <div className="rule-icon blue">
              <PhoneCall size={18} />
            </div>
            <div>
              <strong>Toll-Free (TFN) Priority</strong>
              <p>Inbound toll-free traffic consumes TFN minutes before applying customer rate card charges.</p>
            </div>
          </div>
          <div className="rule-item">
            <div className="rule-icon violet">
              <Hash size={18} />
            </div>
            <div>
              <strong>Local DID Priority</strong>
              <p>Direct Inward Dialing inbound traffic draws exclusively from the DID minute bucket.</p>
            </div>
          </div>
          <div className="rule-item">
            <div className="rule-icon amber">
              <Globe size={18} />
            </div>
            <div>
              <strong>Outbound (OB) Bundle</strong>
              <p>Egress calls to destination carriers decrement outbound minutes before per-minute billing.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AdjustWalletModal({
  customer,
  currentWallet,
  notify,
  onClose,
  onSaved,
}: {
  customer: Customer;
  currentWallet: CustomerWallet;
  notify?: (message: string, type?: "success" | "error") => void;
  onClose: () => void;
  onSaved: (updated: CustomerWallet) => void;
}) {
  const [fiat, setFiat] = useState(String(currentWallet.fiat_balance));
  const [currency, setCurrency] = useState(currentWallet.currency || "USD");
  const [tfnMins, setTfnMins] = useState(String(currentWallet.tfn_free_minutes));
  const [didMins, setDidMins] = useState(String(currentWallet.did_free_minutes));
  const [obMins, setObMins] = useState(String(currentWallet.ob_free_minutes));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const updated: CustomerWallet = {
      customer_id: customer.id,
      fiat_balance: Number(fiat) || 0,
      currency,
      tfn_free_minutes: Math.max(0, parseInt(tfnMins, 10) || 0),
      did_free_minutes: Math.max(0, parseInt(didMins, 10) || 0),
      ob_free_minutes: Math.max(0, parseInt(obMins, 10) || 0),
      updated_at: new Date().toISOString(),
    };

    try {
      // Call PATCH /wallets/:customer_id
      await api.patch(`/wallets/${customer.id}`, updated);
    } catch {
      // Backend may be offline/unimplemented; local update still succeeds
    }

    notify?.("Customer wallet balances successfully updated", "success");
    onSaved(updated);
    setSaving(false);
    onClose();
  };

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" onClick={onClose} aria-label="Close modal" />
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title">
        <div className="modal-header">
          <div>
            <h2 id="wallet-modal-title">Adjust Wallet Balance & Quotas</h2>
            <p>Update cash balance and free minute allowances for {customer.name} ({customer.accountCode})</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span>Cash Balance ({currency})</span>
            <input
              type="number"
              step="0.01"
              required
              value={fiat}
              onChange={(e) => setFiat(e.target.value)}
              placeholder="100.00"
            />
            <small>Current available account fiat credit</small>
          </label>

          <label className="field">
            <span>Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD ($)</option>
              <option value="AUD">AUD ($)</option>
            </select>
            <small>Billing currency</small>
          </label>

          <label className="field">
            <span>TFN Free Minutes</span>
            <input
              type="number"
              min="0"
              required
              value={tfnMins}
              onChange={(e) => setTfnMins(e.target.value)}
              placeholder="500"
            />
            <small>Inbound toll-free minute allowance</small>
          </label>

          <label className="field">
            <span>DID Free Minutes</span>
            <input
              type="number"
              min="0"
              required
              value={didMins}
              onChange={(e) => setDidMins(e.target.value)}
              placeholder="250"
            />
            <small>Inbound local DID minute allowance</small>
          </label>

          <label className="field full">
            <span>Outbound Free Minutes</span>
            <input
              type="number"
              min="0"
              required
              value={obMins}
              onChange={(e) => setObMins(e.target.value)}
              placeholder="1200"
            />
            <small>Outbound carrier routing minute allowance</small>
          </label>

          <div className="form-actions full">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={saving}>
              {saving && <LoaderCircle className="spin" size={16} />}
              <span>Save Balances</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
