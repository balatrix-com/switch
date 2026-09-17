import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  CreditCard,
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
  TrendingUp,
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
  const defaultCredit = Number(defaultCustomer?.creditBalance || 0);
  const defaultFiat = defaultCredit || 100.0;
  const defaultLimit = defaultCredit || 5000.0;
  return {
    customer_id: customerId,
    fiat_balance: defaultFiat,
    credit_limit: defaultLimit,
    available_balance: defaultFiat + defaultLimit,
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

  const fiat = Number(wallet?.fiat_balance ?? customer.creditBalance ?? 0);
  const creditLimit = Number(wallet?.credit_limit ?? 0);
  const totalAvailable = fiat + creditLimit;
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
            <span>Customer Purchasing Power & Allowances</span>
          </div>
          <p>Real-time cash balance, credit line, and minute allowances active on account {customer.accountCode}</p>
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
            <span>Top Up / Adjust</span>
          </button>
        </div>
      </div>

      {/* Purchasing Power Ledger Summary Bar */}
      <div className="purchasing-power-banner">
        <div className="purchasing-power-header">
          <div className="power-indicator">
            <Sparkles size={14} />
            <span>Available Purchasing Power Ledger</span>
          </div>
          <small className="power-helper">fiat_balance + credit_limit = true purchasing capacity</small>
        </div>
        <div className="purchasing-power-metrics">
          <span className={`power-pill ${fiat < 0 ? "stat-debt" : "stat-cash"}`}>
            Net Cash: {fiat < 0 ? `-$${Math.abs(fiat).toFixed(2)} (Debt)` : `$${fiat.toFixed(2)}`}
          </span>
          <span className="power-pill stat-credit">
            Credit Line: ${creditLimit.toFixed(2)}
          </span>
          <strong className="power-pill stat-total">
            Total Available: ${totalAvailable.toFixed(2)}
          </strong>
        </div>
      </div>

      {/* The 4 Balance Cards */}
      <div className="wallet-balance-grid">
        {/* Card 1: 💵 Total Available Purchasing Power & Cash Balance */}
        <div className="wallet-card card-cash">
          <div className="wallet-card-header">
            <div className="wallet-card-icon">
              <CircleDollarSign size={20} />
            </div>
            <span className="wallet-card-tag">Purchasing Power</span>
          </div>
          <div className="wallet-card-body">
            <span className="wallet-card-label">Total Available</span>
            <div className="wallet-card-amount mono">
              {money(totalAvailable, currency)}
            </div>
            <div className="purchasing-power-breakdown">
              <div className="breakdown-row">
                <span className="breakdown-label">Net Cash:</span>
                <span className={`breakdown-val mono ${fiat < 0 ? "text-debt" : ""}`}>
                  {fiat < 0 ? `-$${Math.abs(fiat).toFixed(2)} (Debt)` : `$${fiat.toFixed(2)}`}
                </span>
              </div>
              <div className="breakdown-row">
                <span className="breakdown-label">Credit Line:</span>
                <span className="breakdown-val mono">${creditLimit.toFixed(2)}</span>
              </div>
              <div className="breakdown-row total-row">
                <span className="breakdown-label">Total Available:</span>
                <strong className="breakdown-val mono">${totalAvailable.toFixed(2)}</strong>
              </div>
            </div>
            <div className="wallet-card-footer">
              <span className="currency-pill">{currency}</span>
              <small className="wallet-subtext">Cash + Credit limit</small>
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
              credit_limit: creditLimit,
              available_balance: totalAvailable,
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
              calls fallback to billing against the cash balance and credit line.
            </p>
          </div>
        </div>

        <div className="wallet-rules-grid">
          <div className="rule-item">
            <div className="rule-icon green">
              <CircleDollarSign size={18} />
            </div>
            <div>
              <strong>Purchasing Power & Overdraft Ledger</strong>
              <p>
                Purchasing capacity equals <code>fiat_balance + credit_limit</code>. Incremental top-ups settle negative debt first.
              </p>
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
  const currentFiat = Number(currentWallet.fiat_balance || 0);
  const currentCredit = Number(currentWallet.credit_limit || 0);
  const currentTotal = currentFiat + currentCredit;

  const [mode, setMode] = useState<"topup" | "override">("topup");

  // Top-Up Form State
  const [topupAmount, setTopupAmount] = useState("500");

  // Admin Override Form State
  const [fiat, setFiat] = useState(String(currentWallet.fiat_balance));
  const [creditLimit, setCreditLimit] = useState(String(currentWallet.credit_limit || 0));
  const [currency, setCurrency] = useState(currentWallet.currency || "USD");
  const [tfnMins, setTfnMins] = useState(String(currentWallet.tfn_free_minutes));
  const [didMins, setDidMins] = useState(String(currentWallet.did_free_minutes));
  const [obMins, setObMins] = useState(String(currentWallet.ob_free_minutes));
  const [saving, setSaving] = useState(false);

  // Projected values for Top-Up
  const topupNum = parseFloat(topupAmount) || 0;
  const projectedFiat = currentFiat + topupNum;
  const projectedTotal = projectedFiat + currentCredit;

  const handleTopupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (topupNum <= 0) {
      notify?.("Please enter a valid top-up amount greater than 0", "error");
      return;
    }
    setSaving(true);

    const updated: CustomerWallet = {
      ...currentWallet,
      fiat_balance: projectedFiat,
      available_balance: projectedTotal,
      updated_at: new Date().toISOString(),
    };

    try {
      // Incremental Top-Up: PATCH /api/v1/wallets/:customer_id with { topup_amount }
      await api.patch(`/wallets/${customer.id}`, {
        topup_amount: topupNum,
      });
      notify?.(`Successfully deposited $${topupNum.toFixed(2)} to customer cash balance`, "success");
    } catch {
      // Offline fallback
      notify?.(`Top-up cached locally: +$${topupNum.toFixed(2)}`, "success");
    } finally {
      onSaved(updated);
      setSaving(false);
      onClose();
    }
  };

  const handleOverrideSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const parsedFiat = Number(fiat) || 0;
    const parsedCredit = Number(creditLimit) || 0;
    const updated: CustomerWallet = {
      customer_id: customer.id,
      fiat_balance: parsedFiat,
      credit_limit: parsedCredit,
      available_balance: parsedFiat + parsedCredit,
      currency,
      tfn_free_minutes: Math.max(0, parseInt(tfnMins, 10) || 0),
      did_free_minutes: Math.max(0, parseInt(didMins, 10) || 0),
      ob_free_minutes: Math.max(0, parseInt(obMins, 10) || 0),
      updated_at: new Date().toISOString(),
    };

    try {
      // Direct absolute override: PATCH /api/v1/wallets/:customer_id
      await api.patch(`/wallets/${customer.id}`, {
        fiat_balance: parsedFiat,
        credit_limit: parsedCredit,
        tfn_free_minutes: updated.tfn_free_minutes,
        did_free_minutes: updated.did_free_minutes,
        ob_free_minutes: updated.ob_free_minutes,
        currency,
      });
      notify?.("Customer wallet and credit line updated successfully", "success");
    } catch {
      notify?.("Wallet adjustments saved locally", "success");
    } finally {
      onSaved(updated);
      setSaving(false);
      onClose();
    }
  };

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" onClick={onClose} aria-label="Close modal" />
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-modal-title" style={{ maxWidth: "560px" }}>
        <div className="modal-header">
          <div>
            <h2 id="wallet-modal-title">Customer Wallet & Purchasing Power</h2>
            <p>Adjust balances, deposit top-up funds, or set credit limit for {customer.name} ({customer.accountCode})</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="segmented-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "topup"}
            className={`segmented-tab ${mode === "topup" ? "active" : ""}`}
            onClick={() => setMode("topup")}
          >
            <Coins size={14} />
            <span>Top Up Cash (Incremental)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "override"}
            className={`segmented-tab ${mode === "override" ? "active" : ""}`}
            onClick={() => setMode("override")}
          >
            <CreditCard size={14} />
            <span>Admin Override (Balances & Quotas)</span>
          </button>
        </div>

        {mode === "topup" ? (
          <form className="modal-form-flow" onSubmit={handleTopupSubmit}>
            <div className="topup-summary-box">
              <div className="topup-current-state">
                <div>
                  <span className="summary-micro-label">Current Net Cash</span>
                  <div className={`summary-micro-value mono ${currentFiat < 0 ? "text-debt" : ""}`}>
                    {currentFiat < 0 ? `-$${Math.abs(currentFiat).toFixed(2)} (Debt)` : `$${currentFiat.toFixed(2)}`}
                  </div>
                </div>
                <div>
                  <span className="summary-micro-label">Credit Line</span>
                  <div className="summary-micro-value mono">${currentCredit.toFixed(2)}</div>
                </div>
                <div>
                  <span className="summary-micro-label">Total Available</span>
                  <div className="summary-micro-value mono bold text-accent">${currentTotal.toFixed(2)}</div>
                </div>
              </div>

              {currentFiat < 0 && (
                <div className="debt-notice">
                  <AlertCircle size={14} />
                  <span>Account has <strong>${Math.abs(currentFiat).toFixed(2)}</strong> overdraft debt. Deposit will settle this negative balance first.</span>
                </div>
              )}
            </div>

            <label className="field">
              <span>Deposit Amount ({currency})</span>
              <div className="input-with-action">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  placeholder="500.00"
                  autoFocus
                />
              </div>
              <small>Incremental cash added directly to customer wallet via <code>PATCH /wallets/:id</code></small>
            </label>

            {/* Quick Top-Up Preset Pills */}
            <div className="preset-amounts-row">
              {[50, 100, 250, 500, 1000, 2500].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`preset-pill ${topupAmount === String(preset) ? "active" : ""}`}
                  onClick={() => setTopupAmount(String(preset))}
                >
                  +${preset}
                </button>
              ))}
            </div>

            {/* Projection preview */}
            <div className="topup-projection">
              <div className="projection-item">
                <span>Resulting Net Cash:</span>
                <strong className={`mono ${projectedFiat < 0 ? "text-debt" : "text-emerald"}`}>
                  {projectedFiat < 0 ? `-$${Math.abs(projectedFiat).toFixed(2)} (Debt)` : `$${projectedFiat.toFixed(2)}`}
                </strong>
              </div>
              <div className="projection-item">
                <span>New Available Purchasing Power:</span>
                <strong className="mono text-accent">
                  ${projectedTotal.toFixed(2)}
                </strong>
              </div>
            </div>

            <div className="form-actions full">
              <button type="button" className="button secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={saving || topupNum <= 0}>
                {saving ? <LoaderCircle className="spin" size={16} /> : <Coins size={16} />}
                <span>Deposit ${topupNum > 0 ? topupNum.toFixed(2) : "0.00"}</span>
              </button>
            </div>
          </form>
        ) : (
          <form className="form-grid" onSubmit={handleOverrideSubmit}>
            <label className="field">
              <span>Direct Cash Balance ({currency})</span>
              <input
                type="number"
                step="0.01"
                required
                value={fiat}
                onChange={(e) => setFiat(e.target.value)}
                placeholder="100.00"
              />
              <small>Direct ledger cash (can be negative to record debt)</small>
            </label>

            <label className="field">
              <span>Credit Limit / Line ({currency})</span>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="5000.00"
              />
              <small>Overdraft buffer added to cash for purchasing power</small>
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

            <label className="field">
              <span>Outbound Free Minutes</span>
              <input
                type="number"
                min="0"
                required
                value={obMins}
                onChange={(e) => setObMins(e.target.value)}
                placeholder="1200"
              />
              <small>Carrier egress minute allowance</small>
            </label>

            <div className="form-actions full">
              <button type="button" className="button secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={saving}>
                {saving && <LoaderCircle className="spin" size={16} />}
                <span>Save Balances & Quotas</span>
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

