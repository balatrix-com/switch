import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Coins,
  LoaderCircle,
  Package,
  Sparkles,
  Timer,
  UserCheck,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Customer, CustomerWallet, Plan, PlanCategory } from "../types";

type Step = 1 | 2 | 3 | 4 | 5;

interface CustomerOnboardingWizardProps {
  onClose: () => void;
  onSuccess: (customer: Customer) => void;
  notify: (message: string, type?: "success" | "error") => void;
}

const money = (val: string | number | undefined, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(val || 0));

const formatMins = (mins: number | undefined) =>
  new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(mins || 0)));

// Fallback seed plans if catalog service is unreachable
const FALLBACK_PLANS: Plan[] = [
  {
    id: "plan-asset-01",
    plan_name: "Enterprise Toll-Free & DID Bundle",
    plan_category: "asset",
    asset_type: "TFN",
    otc: 49.0,
    recurring_cost: 99.0,
    validity_value: 30,
    validity_unit: "days",
    tfn_asset_count: 2,
    did_asset_count: 5,
    tfn_free_minutes: 1500,
    did_free_minutes: 800,
    status: "active",
  },
  {
    id: "plan-asset-02",
    plan_name: "Starter DID Inbound Pack",
    plan_category: "asset",
    asset_type: "DID",
    otc: 15.0,
    recurring_cost: 29.0,
    validity_value: 30,
    validity_unit: "days",
    tfn_asset_count: 0,
    did_asset_count: 1,
    tfn_free_minutes: 0,
    did_free_minutes: 400,
    status: "active",
  },
  {
    id: "plan-min-01",
    plan_name: "Outbound Global Egress 5000",
    plan_category: "minutes",
    type: "OB",
    otc: 0,
    free_minutes: 5000,
    validity_value: 30,
    validity_unit: "days",
    status: "active",
  },
  {
    id: "plan-min-02",
    plan_name: "TFN Inbound Surge 2500",
    plan_category: "minutes",
    type: "TFN",
    otc: 20.0,
    free_minutes: 2500,
    validity_value: 30,
    validity_unit: "days",
    status: "active",
  },
];

export function CustomerOnboardingWizard({
  onClose,
  onSuccess,
  notify,
}: CustomerOnboardingWizardProps) {
  const [step, setStep] = useState<Step>(1);

  // Step 1: Customer Details & Opening Credit (Pure client state until Step 4 activation)
  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [contactName, setContactName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [openingCredit, setOpeningCredit] = useState("5000");
  const [defaultChannelLimit, setDefaultChannelLimit] = useState("");
  const [defaultCallerIdMode, setDefaultCallerIdMode] = useState("PASSTHROUGH");
  const [createdCustomer, setCreatedCustomer] = useState<Customer | null>(null);

  // Step 2: Wallet Funding State
  const [fundingAmount, setFundingAmount] = useState("500");
  const [fundingCreditLimit, setFundingCreditLimit] = useState("5000");

  // Step 3: Plan Selection State
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | PlanCategory>("all");

  // Step 4: Final Activation API state
  const [subscribing, setSubscribing] = useState(false);
  const [overrideBalance, setOverrideBalance] = useState(false);
  const [, setSubscriptionResult] = useState<any>(null);

  // Fetch active plans when entering step 3
  useEffect(() => {
    if (step === 3 && plans.length === 0) {
      void loadActivePlans();
    }
  }, [step, plans.length]);

  const loadActivePlans = async () => {
    setLoadingPlans(true);
    try {
      const data = await api.get<Plan[]>("/plans?status=active");
      if (Array.isArray(data) && data.length > 0) {
        setPlans(data.filter((p) => p.status === "active"));
      } else {
        setPlans(FALLBACK_PLANS);
      }
    } catch {
      setPlans(FALLBACK_PLANS);
    } finally {
      setLoadingPlans(false);
    }
  };

  // Step 1 Submit: Client-side validation only — customer is NOT created in the DB yet!
  const handleStep1Submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accountCode.trim()) {
      notify("Customer name and account code are required", "error");
      return;
    }
    if (!adminEmail.trim() || !adminEmail.includes("@")) {
      notify("A valid admin email address is required", "error");
      return;
    }
    if (adminPassword.length < 6) {
      notify("Admin password must be at least 6 characters", "error");
      return;
    }

    const creditNum = parseFloat(openingCredit);
    if (isNaN(creditNum) || creditNum < 0) {
      notify("Opening credit line must be 0 or greater", "error");
      return;
    }

    // Keep wallet funding credit limit aligned with opening credit by default
    setFundingCreditLimit(openingCredit);
    setStep(2);
  };

  // Step 2 Submit: Validate wallet funding configuration & advance to Step 3
  const handleFundingSubmit = (e: FormEvent) => {
    e.preventDefault();
    const limitNum = parseFloat(fundingCreditLimit);
    const depositNum = parseFloat(fundingAmount);

    if (isNaN(limitNum) || limitNum < 0) {
      notify("Credit limit must be a positive number", "error");
      return;
    }
    if (isNaN(depositNum) || depositNum < 0) {
      notify("Deposit amount must be 0 or greater", "error");
      return;
    }

    setStep(3);
  };

  // Step 4 Submit: Atomic Customer Creation, Wallet Funding, and Plan Subscription
  // ONLY created when Step 4 is confirmed; if anything fails or is aborted, details are discarded!
  const handleConfirmSubscribeAndActivate = async () => {
    if (!selectedPlan) {
      notify("Please select a plan before activating", "error");
      setStep(3);
      return;
    }

    if (!name.trim() || !accountCode.trim() || !adminEmail.trim() || !adminPassword) {
      notify("Customer details are incomplete. Please review Step 1.", "error");
      setStep(1);
      return;
    }

    setSubscribing(true);
    let newlyCreatedCustomer: Customer | null = null;

    try {
      const creditNum = parseFloat(fundingCreditLimit) || parseFloat(openingCredit) || 0;
      const topupNum = parseFloat(fundingAmount) || 0;

      // 1. Create Customer and Admin User in DB
      newlyCreatedCustomer = await api.post<Customer>("/customers", {
        name: name.trim(),
        accountCode: accountCode.trim().toUpperCase(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword: adminPassword,
        contactName: contactName.trim() || undefined,
        currency: currency.toUpperCase(),
        creditBalance: creditNum,
        defaultChannelLimit: defaultChannelLimit ? Number(defaultChannelLimit) : undefined,
        defaultCallerIdMode,
        isActive: true,
      });

      // 2. If upfront cash deposit was entered, top up wallet
      if (topupNum > 0) {
        try {
          await api.patch(`/wallets/${newlyCreatedCustomer.id}`, {
            topup_amount: topupNum,
            credit_limit: creditNum,
          });
        } catch (wErr) {
          console.warn("Wallet topup patch failed:", wErr);
        }
      }

      // 3. Subscribe to chosen plan (Allocates TFN/DID number slots & credits minute packages)
      const subResponse = await api.post("/plans/subscribe", {
        customer_id: newlyCreatedCustomer.id,
        plan_id: selectedPlan.id,
        override_balance_check: overrideBalance,
      });

      // 4. Success: all 4 steps completed!
      setCreatedCustomer(newlyCreatedCustomer);
      setSubscriptionResult(subResponse);
      setStep(5);
      notify(`Customer ${newlyCreatedCustomer.name} successfully created, funded, and activated!`, "success");
      onSuccess(newlyCreatedCustomer);
    } catch (err: any) {
      // Discard / rollback the customer if onboarding was not fully completed
      if (newlyCreatedCustomer) {
        try {
          await api.delete(`/customers/${newlyCreatedCustomer.id}`);
        } catch (delErr) {
          console.error("Failed to delete incomplete customer during rollback:", delErr);
        }
        newlyCreatedCustomer = null;
      }

      const status = err?.status ?? err?.response?.status;
      if (status === 402) {
        notify(
          `Insufficient funds! Required OTC: $${Number(selectedPlan.otc || 0).toFixed(2)}. Customer details were discarded. Please top up or enable "Override Balance Check".`,
          "error"
        );
      } else if (status === 409) {
        notify("Account code or admin email already exists, or plan conflict occurred.", "error");
      } else {
        const errorMsg =
          err?.response?.data?.message || err?.message || "Failed to complete onboarding";
        notify(`Onboarding failed: ${errorMsg}. All customer details have been discarded.`, "error");
      }
    } finally {
      setSubscribing(false);
    }
  };

  const resetForm = () => {
    setName("");
    setAccountCode("");
    setAdminEmail("");
    setAdminPassword("");
    setContactName("");
    setCurrency("USD");
    setOpeningCredit("5000");
    setDefaultChannelLimit("");
    setDefaultCallerIdMode("PASSTHROUGH");
    setCreatedCustomer(null);
    setFundingAmount("500");
    setFundingCreditLimit("5000");
    setSelectedPlan(null);
    setCategoryFilter("all");
    setSubscribing(false);
    setOverrideBalance(false);
    setSubscriptionResult(null);
    setStep(1);
  };

  // Discard all details and close
  const handleClose = async () => {
    // If by any chance an incomplete customer was partially created and not in Step 5, delete it
    if (createdCustomer && step !== 5) {
      try {
        await api.delete(`/customers/${createdCustomer.id}`);
      } catch (err) {
        console.error("Cleanup error on discard:", err);
      }
    }
    resetForm();
    onClose();
  };

  const filteredPlans = plans.filter((p) => {
    if (categoryFilter === "all") return true;
    return p.plan_category === categoryFilter;
  });

  // Financial calculations for ledger preview
  const creditLimitNum = parseFloat(fundingCreditLimit) || parseFloat(openingCredit) || 0;
  const fundingAmountNum = parseFloat(fundingAmount) || 0;
  const projectedFiat = fundingAmountNum;
  const totalPurchasingPower = projectedFiat + creditLimitNum;

  const selectedPlanOtc = Number(selectedPlan?.otc || 0);
  const remainingPurchasingPower = totalPurchasingPower - selectedPlanOtc;

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" onClick={handleClose} aria-label="Close modal" />
      <section
        className="modal wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        style={{ maxWidth: "840px", width: "95vw" }}
      >
        {/* Wizard Header */}
        <div className="modal-header wizard-modal-header">
          <div>
            <div className="wizard-tag">
              <Sparkles size={14} />
              <span>Customer Onboarding Flow</span>
            </div>
            <h2 id="wizard-title">
              {step === 1 && "Step 1: Customer Details & Opening Credit"}
              {step === 2 && "Step 2: Wallet Funding & Purchasing Power"}
              {step === 3 && "Step 3: Select Subscription Plan"}
              {step === 4 && "Step 4: Confirm Subscription & Activate"}
              {step === 5 && "Onboarding Complete!"}
            </h2>
          </div>
          <button className="icon-button" onClick={handleClose} aria-label="Close and discard">
            <X size={20} />
          </button>
        </div>

        {/* 4-Step Visual Stepper */}
        <div className="wizard-stepper">
          <div className={`step-item ${step >= 1 ? "active" : ""} ${step > 1 ? "completed" : ""}`}>
            <div className="step-circle">{step > 1 ? <Check size={14} /> : "1"}</div>
            <div className="step-text">
              <strong>Customer & Credit</strong>
              <small>Basic details</small>
            </div>
          </div>
          <div className="step-divider" />
          <div className={`step-item ${step >= 2 ? "active" : ""} ${step > 2 ? "completed" : ""}`}>
            <div className="step-circle">{step > 2 ? <Check size={14} /> : "2"}</div>
            <div className="step-text">
              <strong>Wallet Funding</strong>
              <small>Deposit & line</small>
            </div>
          </div>
          <div className="step-divider" />
          <div className={`step-item ${step >= 3 ? "active" : ""} ${step > 3 ? "completed" : ""}`}>
            <div className="step-circle">{step > 3 ? <Check size={14} /> : "3"}</div>
            <div className="step-text">
              <strong>Plan Selection</strong>
              <small>Asset or Minutes</small>
            </div>
          </div>
          <div className="step-divider" />
          <div className={`step-item ${step >= 4 ? "active" : ""} ${step >= 5 ? "completed" : ""}`}>
            <div className="step-circle">{step >= 5 ? <Check size={14} /> : "4"}</div>
            <div className="step-text">
              <strong>Subscribe & Activate</strong>
              <small>Debit OTC & seed slots</small>
            </div>
          </div>
        </div>

        {/* STEP 1: Customer Details & Opening Credit */}
        {step === 1 && (
          <form className="modal-form-flow" onSubmit={handleStep1Submit}>
            <div className="form-grid">
              <label className="field">
                <span>Customer Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Communications LLC"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!accountCode) {
                      setAccountCode(
                        e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toUpperCase()
                      );
                    }
                  }}
                  autoFocus
                />
                <small>Legal entity or commercial tenant account name</small>
              </label>

              <label className="field">
                <span>Account Code *</span>
                <input
                  type="text"
                  required
                  maxLength={40}
                  placeholder="e.g. ACME-01"
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value.toUpperCase())}
                />
                <small>Unique billing & SIP routing account reference</small>
              </label>

              {/* Admin Login Email */}
              <div className="form-group field">
                <label htmlFor="adminEmail">
                  Admin Login Email <span className="required">*</span>
                </label>
                <input
                  id="adminEmail"
                  type="email"
                  required
                  autoComplete="off"
                  maxLength={254}
                  placeholder="admin@company.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                />
                <small>This email will be the customer's portal login credential.</small>
              </div>

              {/* Admin Password */}
              <div className="form-group field">
                <label htmlFor="adminPassword">
                  Admin Password <span className="required">*</span>
                </label>
                <input
                  id="adminPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={6}
                  maxLength={128}
                  placeholder="Min 6 characters"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
                <small>Customer will use this to log into their portal.</small>
              </div>

              {/* Contact Name (optional) */}
              <div className="form-group field">
                <label htmlFor="contactName">Contact Person Name</label>
                <input
                  id="contactName"
                  type="text"
                  maxLength={150}
                  placeholder="e.g. John Smith (optional)"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
                <small>Display name for the admin user account. Defaults to company name if blank.</small>
              </div>

              <label className="field">
                <span>Billing Currency</span>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="USD">USD - US Dollar ($)</option>
                  <option value="EUR">EUR - Euro (€)</option>
                  <option value="GBP">GBP - British Pound (£)</option>
                  <option value="CAD">CAD - Canadian Dollar ($)</option>
                  <option value="AUD">AUD - Australian Dollar ($)</option>
                </select>
                <small>Primary currency for fiat charges and wallet limits</small>
              </label>

              <label className="field">
                <span>Opening Credit Line ($) *</span>
                <input
                  type="number"
                  step="1"
                  min="0"
                  required
                  placeholder="5000.00"
                  value={openingCredit}
                  onChange={(e) => setOpeningCredit(e.target.value)}
                />
                <small>
                  Initial <code>credit_limit</code> provisioned in wallet for OTC plans and call overdraft
                </small>
              </label>

              <label className="field">
                <span>Default Concurrent Channels</span>
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited (recommended)"
                  value={defaultChannelLimit}
                  onChange={(e) => setDefaultChannelLimit(e.target.value)}
                />
                <small>Maximum concurrent SIP channels permitted</small>
              </label>

              <label className="field">
                <span>Caller ID Mode</span>
                <select
                  value={defaultCallerIdMode}
                  onChange={(e) => setDefaultCallerIdMode(e.target.value)}
                >
                  <option value="PASSTHROUGH">PASSTHROUGH (Original CLI)</option>
                  <option value="OVERRIDE">OVERRIDE (Tenant Assigned CLI)</option>
                  <option value="STRIP_ADD">STRIP_ADD (Normalization Rule)</option>
                  <option value="CALLED_NUMBER">CALLED_NUMBER (Echo)</option>
                  <option value="ANONYMOUS">ANONYMOUS (Privacy)</option>
                </select>
                <small>Egress CLI normalization strategy</small>
              </label>
            </div>

            <div className="form-actions full">
              <button type="button" className="button secondary" onClick={handleClose}>
                Discard & Cancel
              </button>
              <button type="submit" className="button primary">
                <span>Continue to Wallet Funding</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Wallet Funding (Two-Column Layout) */}
        {step === 2 && (
          <div className="modal-form-flow">
            <div className="customer-onboarding-banner">
              <div className="tenant-chip">
                <UserCheck size={15} />
                <span>Customer Account: <strong>{name}</strong> ({accountCode})</span>
              </div>
              <div className="credit-chip">
                <span>Billing Currency: <strong>{currency}</strong></span>
              </div>
            </div>

            <div className="wallet-funding-grid">
              {/* Left Column: Live Purchasing Power Ledger */}
              <div className="funding-ledger-card">
                <div className="ledger-card-header">
                  <div className="power-indicator">
                    <Sparkles size={14} />
                    <span>Purchasing Power Ledger</span>
                  </div>
                  <span className="mono currency-pill">{currency}</span>
                </div>

                <div className="funding-metrics-stack">
                  <div className="funding-metric-row">
                    <span className="metric-label">Credit Line / Limit</span>
                    <strong className="metric-value mono text-sky">
                      ${creditLimitNum.toFixed(2)}
                    </strong>
                  </div>
                  <div className="funding-metric-row">
                    <span className="metric-label">Upfront Cash Deposit</span>
                    <strong className="metric-value mono text-emerald">
                      +${fundingAmountNum.toFixed(2)}
                    </strong>
                  </div>
                  <div className="funding-metric-row total-highlight">
                    <span className="metric-label">Total Projected Purchasing Power</span>
                    <strong className="metric-value mono text-accent">
                      ${totalPurchasingPower.toFixed(2)}
                    </strong>
                  </div>
                </div>

                <div className="funding-projection-box">
                  <div className="projection-row">
                    <span>Deposit Top-Up Added:</span>
                    <span className="mono text-emerald">+${fundingAmountNum.toFixed(2)}</span>
                  </div>
                  <div className="projection-row">
                    <span>Net Cash Balance:</span>
                    <strong className="mono">${projectedFiat.toFixed(2)}</strong>
                  </div>
                  <div className="projection-row" style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--line-soft)" }}>
                    <span style={{ fontWeight: 600, color: "#f8fafc" }}>Total Available Power:</span>
                    <strong className="mono text-accent" style={{ fontSize: "1rem" }}>${totalPurchasingPower.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="ledger-info-note">
                  <CircleDollarSign size={15} className="text-accent" style={{ flexShrink: 0 }} />
                  <span>
                    Wallets use <code>fiat_balance + credit_limit</code> to determine purchasing capacity for upfront OTC charges and outbound rate card billing.
                  </span>
                </div>
              </div>

              {/* Right Column: Funding Controls */}
              <form className="funding-controls-card" onSubmit={handleFundingSubmit}>
                <h3>Configure Initial Wallet</h3>
                <p>Set the cash deposit and credit line for the customer's wallet.</p>

                <label className="field">
                  <span>Cash Deposit Amount ({currency})</span>
                  <input
                    type="number"
                    step="10"
                    min="0"
                    required
                    value={fundingAmount}
                    onChange={(e) => setFundingAmount(e.target.value)}
                    placeholder="500.00"
                    autoFocus
                  />
                  <small>Upfront deposit credited directly to the customer's wallet</small>
                </label>

                {/* Preset Chips */}
                <div className="preset-amounts-row">
                  {[0, 100, 250, 500, 1000, 2500, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`preset-pill ${fundingAmount === String(preset) ? "active" : ""}`}
                      onClick={() => setFundingAmount(String(preset))}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>Credit Line / Overdraft Limit ({currency})</span>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    required
                    value={fundingCreditLimit}
                    onChange={(e) => setFundingCreditLimit(e.target.value)}
                    placeholder="5000.00"
                  />
                  <small>Maximum overdraft safety buffer allowed before calls drop</small>
                </label>

                <div className="funding-actions-stack">
                  <button
                    type="submit"
                    className="button primary full-width"
                  >
                    <Coins size={16} />
                    <span>Continue to Plan Selection (${totalPurchasingPower.toFixed(2)})</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            </div>

            <div className="wizard-actions-between" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={16} />
                <span>Back to Customer Details</span>
              </button>

              <button
                type="button"
                className="button secondary"
                onClick={handleClose}
              >
                <span>Discard & Cancel</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Plan Selection */}
        {step === 3 && (
          <div className="modal-form-flow">
            <div className="customer-onboarding-banner">
              <div className="tenant-chip">
                <UserCheck size={15} />
                <span>Customer: <strong>{name}</strong> ({accountCode})</span>
              </div>
              <div className="credit-chip">
                <span>Available Purchasing Power: <strong>${totalPurchasingPower.toFixed(2)} {currency}</strong></span>
              </div>
            </div>

            {/* Plan Category Filter */}
            <div className="plan-filter-row">
              <div className="segmented-tabs compact">
                <button
                  type="button"
                  className={`segmented-tab ${categoryFilter === "all" ? "active" : ""}`}
                  onClick={() => setCategoryFilter("all")}
                >
                  All Plans ({plans.length})
                </button>
                <button
                  type="button"
                  className={`segmented-tab ${categoryFilter === "asset" ? "active" : ""}`}
                  onClick={() => setCategoryFilter("asset")}
                >
                  Asset Bundles (TFN/DID)
                </button>
                <button
                  type="button"
                  className={`segmented-tab ${categoryFilter === "minutes" ? "active" : ""}`}
                  onClick={() => setCategoryFilter("minutes")}
                >
                  Minutes Packages
                </button>
              </div>

              <span className="helper-text">Select a mandatory plan to proceed to activation</span>
            </div>

            {loadingPlans ? (
              <div className="loading-grid">
                <div />
                <div />
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="empty-state compact">
                <Boxes size={32} />
                <p>No active plans available under this category.</p>
              </div>
            ) : (
              <div className="plan-selection-grid">
                {filteredPlans.map((plan) => {
                  const isAsset = plan.plan_category === "asset";
                  const isSelected = selectedPlan?.id === plan.id;
                  const otc = Number(plan.otc || 0);
                  const isAffordable = totalPurchasingPower >= otc;

                  return (
                    <div
                      key={plan.id}
                      className={`plan-select-card ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedPlan(plan)}
                    >
                      <div className="plan-select-card-header">
                        <span className={`plan-cat-badge ${plan.plan_category}`}>
                          {isAsset ? <Package size={13} /> : <Timer size={13} />}
                          <span>{isAsset ? "Asset Plan" : "Minutes Plan"}</span>
                        </span>
                        {isSelected && (
                          <span className="selected-indicator">
                            <Check size={13} /> Selected
                          </span>
                        )}
                      </div>

                      <h3 className="plan-select-name">{plan.plan_name}</h3>

                      <div className="plan-select-pricing">
                        {isAsset ? (
                          <>
                            <div className="price-big">
                              {money(plan.recurring_cost, currency)}
                              <small>/{plan.validity_value} {plan.validity_unit}</small>
                            </div>
                            <div className="otc-line">
                              OTC Setup: <strong>{money(otc, currency)}</strong>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="price-big">
                              {formatMins(plan.free_minutes)} <small>free mins</small>
                            </div>
                            <div className="otc-line">
                              {otc > 0 ? `OTC Setup: ${money(otc, currency)}` : "No One-Time Setup Fee"}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="plan-select-allowances">
                        {isAsset && (
                          <>
                            <div className="allowance-item">
                              <span>Included Numbers:</span>
                              <strong>
                                {[
                                  (plan.tfn_asset_count ?? 0) > 0 ? `${plan.tfn_asset_count} TFN` : null,
                                  (plan.did_asset_count ?? 0) > 0 ? `${plan.did_asset_count} DID` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" + ") || "None"}
                              </strong>
                            </div>
                            <div className="allowance-item">
                              <span>Free Minutes:</span>
                              <strong>
                                {[
                                  (plan.tfn_free_minutes ?? 0) > 0 ? `${formatMins(plan.tfn_free_minutes)} TFN` : null,
                                  (plan.did_free_minutes ?? 0) > 0 ? `${formatMins(plan.did_free_minutes)} DID` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" + ") || "Standard rates"}
                              </strong>
                            </div>
                          </>
                        )}
                        {!isAsset && (
                          <div className="allowance-item">
                            <span>Traffic Destination:</span>
                            <strong>
                              {plan.type === "TFN"
                                ? "Inbound Toll-Free"
                                : plan.type === "DID"
                                  ? "Inbound Local DID"
                                  : "Global Outbound Calling"}
                            </strong>
                          </div>
                        )}
                      </div>

                      <div className="plan-select-footer">
                        <span className={`affordability-tag ${isAffordable ? "affordable" : "overdraft"}`}>
                          {isAffordable ? "✓ Covered by Purchasing Power" : "⚠️ Exceeds Available Power"}
                        </span>
                        <button
                          type="button"
                          className={`button compact ${isSelected ? "primary" : "secondary"}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPlan(plan);
                          }}
                        >
                          {isSelected ? "Selected" : "Choose"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="wizard-actions-between">
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(2)}
              >
                <ArrowLeft size={16} />
                <span>Back to Wallet Funding</span>
              </button>

              <div className="wizard-actions-right">
                <button
                  type="button"
                  className="button secondary"
                  onClick={handleClose}
                >
                  Discard & Cancel
                </button>

                <button
                  type="button"
                  className="button primary"
                  disabled={!selectedPlan}
                  onClick={() => setStep(4)}
                >
                  <span>Review & Subscribe</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Confirm Subscription & Activate */}
        {step === 4 && selectedPlan && (
          <div className="modal-form-flow">
            <div className="subscription-review-card">
              <div className="review-section">
                <span className="review-label">Customer Account</span>
                <div className="review-value">
                  <strong>{name}</strong>
                  <span className="account-tag mono">{accountCode}</span>
                </div>
              </div>

              <div className="review-divider" />

              <div className="review-section">
                <span className="review-label">Admin Login</span>
                <div className="review-value">
                  <span className="mono">{adminEmail}</span>
                  {contactName && <span className="helper-text" style={{ marginLeft: 8 }}>({contactName})</span>}
                </div>
              </div>

              <div className="review-divider" />

              <div className="review-section">
                <span className="review-label">Selected Plan</span>
                <div className="review-value">
                  <strong>{selectedPlan.plan_name}</strong>
                  <span className="plan-category-pill">{selectedPlan.plan_category}</span>
                </div>
              </div>

              <div className="review-divider" />

              {/* Financial Breakdown */}
              <div className="financial-ledger-preview">
                <h4>Purchasing Power & Upfront OTC Charge</h4>
                <div className="ledger-row">
                  <span>Configured Credit Line:</span>
                  <span className="mono">${creditLimitNum.toFixed(2)}</span>
                </div>
                <div className="ledger-row">
                  <span>Upfront Cash Deposit:</span>
                  <span className="mono text-emerald">+${fundingAmountNum.toFixed(2)}</span>
                </div>
                <div className="ledger-row">
                  <span>Total Available Purchasing Power:</span>
                  <span className="mono">${totalPurchasingPower.toFixed(2)}</span>
                </div>
                <div className="ledger-row">
                  <span>One-Time Charge (OTC) to Debit:</span>
                  <span className="mono text-debt">-${selectedPlanOtc.toFixed(2)}</span>
                </div>
                <div className="ledger-row total">
                  <span>Projected Remaining Available Balance:</span>
                  <strong className={`mono ${remainingPurchasingPower >= 0 ? "text-accent" : "text-debt"}`}>
                    ${remainingPurchasingPower.toFixed(2)}
                  </strong>
                </div>

                {remainingPurchasingPower < 0 && (
                  <div className="alert-warning-box">
                    <AlertCircle size={15} />
                    <span>
                      The OTC cost exceeds current purchasing power. Check "Override Balance Check" below to bypass overdraft restrictions.
                    </span>
                  </div>
                )}
              </div>

              {/* Number and Minutes Allocation Preview */}
              <div className="allocation-preview-box">
                <h4>Automatic Provisioning on Subscription:</h4>
                <ul>
                  {(selectedPlan.tfn_asset_count ?? 0) > 0 && (
                    <li>✅ Allocates <strong>{selectedPlan.tfn_asset_count} Toll-Free Number (TFN)</strong> slots</li>
                  )}
                  {(selectedPlan.did_asset_count ?? 0) > 0 && (
                    <li>✅ Allocates <strong>{selectedPlan.did_asset_count} Direct Inward (DID)</strong> slots</li>
                  )}
                  {(selectedPlan.tfn_free_minutes ?? 0) > 0 && (
                    <li>✅ Credits <strong>{formatMins(selectedPlan.tfn_free_minutes)}</strong> TFN free minutes to wallet pocket</li>
                  )}
                  {(selectedPlan.did_free_minutes ?? 0) > 0 && (
                    <li>✅ Credits <strong>{formatMins(selectedPlan.did_free_minutes)}</strong> DID free minutes to wallet pocket</li>
                  )}
                  {(selectedPlan.free_minutes ?? 0) > 0 && (
                    <li>✅ Credits <strong>{formatMins(selectedPlan.free_minutes)}</strong> outbound calling minutes to wallet pocket</li>
                  )}
                </ul>
              </div>

              {/* Admin Override Checkbox */}
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={overrideBalance}
                  onChange={(e) => setOverrideBalance(e.target.checked)}
                />
                <span>Override Balance Check (Admin Provisioning bypass)</span>
              </label>
            </div>

            <div className="wizard-actions-between">
              <button
                type="button"
                className="button secondary"
                onClick={() => setStep(3)}
                disabled={subscribing}
              >
                <ArrowLeft size={16} />
                <span>Back to Plans</span>
              </button>

              <div className="wizard-actions-right">
                <button
                  type="button"
                  className="button secondary"
                  onClick={handleClose}
                  disabled={subscribing}
                >
                  Discard & Cancel
                </button>

                <button
                  type="button"
                  className="button primary"
                  disabled={subscribing}
                  onClick={() => void handleConfirmSubscribeAndActivate()}
                >
                  {subscribing ? (
                    <>
                      <LoaderCircle size={16} className="spin" />
                      <span>Creating Customer & Activating...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Subscribe & Activate Customer</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Success Completion */}
        {step === 5 && createdCustomer && (
          <div className="wizard-success-card">
            <div className="success-icon-circle">
              <CheckCircle2 size={42} />
            </div>
            <h3>Customer Onboarding Completed!</h3>
            <p>
              Customer <strong>{createdCustomer.name}</strong> ({createdCustomer.accountCode}) is now live and funded.
              {selectedPlan && (
                <> Subscribed to <strong>{selectedPlan.plan_name}</strong> with number asset slots allocated and minute allowances credited to the wallet.</>
              )}
            </p>

            <div className="success-summary-grid">
              <div className="success-item">
                <span>Account ID</span>
                <strong className="mono">{createdCustomer.id.slice(0, 16)}...</strong>
              </div>
              <div className="success-item">
                <span>Total Purchasing Power</span>
                <strong className="mono text-accent">${totalPurchasingPower.toFixed(2)}</strong>
              </div>
              <div className="success-item">
                <span>Active Subscription</span>
                <strong>{selectedPlan?.plan_name || "None"}</strong>
              </div>
            </div>

            <div className="form-actions center">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  onSuccess(createdCustomer);
                  handleClose();
                }}
              >
                <span>View Customers Table</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
