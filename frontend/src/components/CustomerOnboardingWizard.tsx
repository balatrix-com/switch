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
  Mail,
  Package,
  RefreshCw,
  Sparkles,
  Timer,
  UserCheck,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import type {
  CredentialEmailStatus,
  Customer,
  Plan,
  PlanCategory,
  SendCredentialsResponse,
} from "../types";

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
    asset_type: "DID",
    otc: 49.0,
    recurring_cost: 99.0,
    validity_value: 30,
    validity_unit: "days",
    tfn_asset_count: 2,
    did_asset_count: 5,
    tfn_free_minutes: 0,
    did_free_minutes: 2300,
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
    plan_name: "Inbound DID Surge 2500",
    plan_category: "minutes",
    type: "DID",
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
  const [skipSubscription, setSkipSubscription] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<"all" | PlanCategory>("all");

  // Step 4: Final Activation API state
  const [subscribing, setSubscribing] = useState(false);
  const [overrideBalance, setOverrideBalance] = useState(false);
  const [, setSubscriptionResult] = useState<any>(null);
  const [credentialEmailStatus, setCredentialEmailStatus] = useState<CredentialEmailStatus | null>(null);
  const [retryingEmail, setRetryingEmail] = useState(false);

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

  // Skip wallet funding: set deposit & credit to 0 and advance directly to Step 3
  const handleSkipFunding = () => {
    setFundingAmount("0");
    setFundingCreditLimit("0");
    setStep(3);
  };

  // Step 4 Submit: Atomic Customer Creation, Wallet Funding, and Plan Subscription
  // ONLY created when Step 4 is confirmed; if anything fails or is aborted, details are discarded!
  const handleConfirmSubscribeAndActivate = async () => {
    if (!skipSubscription && !selectedPlan) {
      notify("Please select a plan before activating, or enable 'Skip Subscription'", "error");
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
      const parsedCreditLimit = parseFloat(fundingCreditLimit);
      const creditNum = !isNaN(parsedCreditLimit) ? parsedCreditLimit : (parseFloat(openingCredit) || 0);
      const topupNum = parseFloat(fundingAmount) || 0;

      // 1. Provision customer
      newlyCreatedCustomer = await api.post<Customer>("/customers", {
        name: name.trim(),
        accountCode: accountCode.trim().toUpperCase(),
        adminEmail: adminEmail.trim().toLowerCase(),
        adminPassword,
        contactName: contactName.trim() || undefined,
        currency: currency.toUpperCase(),
        creditBalance: creditNum,
        defaultChannelLimit: defaultChannelLimit
          ? Number(defaultChannelLimit)
          : undefined,
        defaultCallerIdMode,
        isActive: true,
      });

      // 2. Fund wallet if deposit entered
      if (topupNum > 0) {
        await api.patch(`/wallets/${newlyCreatedCustomer.id}`, {
          topup_amount: topupNum,
          credit_limit: creditNum,
        });
      }

      // 3. Subscribe to chosen plan (if not skipped)
      if (!skipSubscription && selectedPlan) {
        const subscription = await api.post("/plans/subscribe", {
          customer_id: newlyCreatedCustomer.id,
          plan_id: selectedPlan.id,
          override_balance_check: overrideBalance,
        });

        setSubscriptionResult(subscription);
      }
    } catch (error: any) {
      // Incomplete-onboarding rollback
      if (newlyCreatedCustomer) {
        try {
          await api.delete(`/customers/${newlyCreatedCustomer.id}`);
        } catch (delErr) {
          console.error("Cleanup error on rollback:", delErr);
        }
        newlyCreatedCustomer = null;
      }

      const status = error?.status ?? error?.response?.status;
      if (status === 402) {
        notify(
          `Insufficient funds! Required OTC: $${Number(selectedPlan?.otc || 0).toFixed(2)}. Customer details were discarded. Please top up or enable "Override Balance Check".`,
          "error"
        );
      } else if (status === 409) {
        notify("Account code or admin email already exists, or plan conflict occurred.", "error");
      } else {
        const errorMsg =
          error?.response?.data?.message || error?.message || "Failed to complete onboarding";
        notify(`Onboarding failed: ${errorMsg}. All customer details have been discarded.`, "error");
      }

      setSubscribing(false);
      // Show onboarding failure and return.
      return;
    }

    // Send credentials only after provisioning succeeds
    let credentialStatus: CredentialEmailStatus = "FAILED";

    try {
      const delivery = await api.post<SendCredentialsResponse>(
        `/customers/${newlyCreatedCustomer.id}/send-credentials`,
        {
          password: adminPassword,
        },
      );

      credentialStatus = delivery.status;
    } catch {
      credentialStatus = "FAILED";
    }

    // Complete onboarding regardless of mail status
    setSubscribing(false);
    setCredentialEmailStatus(credentialStatus);
    setCreatedCustomer(newlyCreatedCustomer);
    setStep(5);
    onSuccess(newlyCreatedCustomer);

    if (credentialStatus === "SENT") {
      notify(
        `Customer created and login credentials emailed to ${adminEmail}`,
        "success",
      );
    } else if (credentialStatus === "FAILED") {
      notify(
        "Customer created, but the credential email could not be delivered. Share the temporary password securely.",
        "error",
      );
    } else {
      notify(
        "Customer created. Automatic credential email is disabled; share the temporary password securely.",
        "success",
      );
    }
  };

  const handleRetryEmail = async () => {
    if (!createdCustomer || !adminPassword) return;
    setRetryingEmail(true);
    try {
      const delivery = await api.post<SendCredentialsResponse>(
        `/customers/${createdCustomer.id}/send-credentials`,
        {
          password: adminPassword,
        },
      );
      setCredentialEmailStatus(delivery.status);
      if (delivery.status === "SENT") {
        notify(
          `Customer created and login credentials emailed to ${adminEmail}`,
          "success",
        );
      } else if (delivery.status === "FAILED") {
        notify(
          "Customer created, but the credential email could not be delivered. Share the temporary password securely.",
          "error",
        );
      } else {
        notify(
          "Customer created. Automatic credential email is disabled; share the temporary password securely.",
          "success",
        );
      }
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const msg =
        status === 400
          ? "Submitted password does not match the stored login password."
          : status === 404
            ? "Customer or active Customer administrator not found."
            : status === 401
              ? "User is not authenticated."
              : status === 403
                ? "Logged-in user is not Super Admin."
                : (err?.response?.data?.message || err?.message || "Credential email delivery failed.");
      notify(msg, "error");
      setCredentialEmailStatus("FAILED");
    } finally {
      setRetryingEmail(false);
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
    setSkipSubscription(false);
    setCategoryFilter("all");
    setSubscribing(false);
    setOverrideBalance(false);
    setSubscriptionResult(null);
    setCredentialEmailStatus(null);
    setRetryingEmail(false);
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
  const parsedCredit = parseFloat(fundingCreditLimit);
  const creditLimitNum = !isNaN(parsedCredit) ? parsedCredit : (parseFloat(openingCredit) || 0);
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
              {step === 4 && (skipSubscription ? "Step 4: Confirm & Activate (No Plan)" : "Step 4: Confirm Subscription & Activate")}
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
              <strong>{skipSubscription ? "Confirm & Activate" : "Subscribe & Activate"}</strong>
              <small>{skipSubscription ? "Direct onboarding" : "Debit OTC & seed slots"}</small>
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
                <span>Customer Account: <strong>{name}</strong> ({accountCode}{createdCustomer?.id ? ` · ID: ${createdCustomer.id}` : ""})</span>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "8px" }}>
                  <div>
                    <h3 style={{ margin: 0 }}>Configure Initial Wallet</h3>
                    <p style={{ margin: "4px 0 0 0" }}>Set the cash deposit and credit line for the customer's wallet.</p>
                  </div>
                  <button
                    type="button"
                    className="button secondary compact"
                    onClick={handleSkipFunding}
                    title="Skip wallet funding ($0 deposit & $0 credit limit)"
                    style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    <span>Skip</span>
                    <ArrowRight size={14} />
                  </button>
                </div>

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
                <span>Customer: <strong>{name}</strong> ({accountCode}{createdCustomer?.id ? ` · ID: ${createdCustomer.id}` : ""})</span>
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
                  DID Asset Bundles (Toll-Free / Local)
                </button>
                <button
                  type="button"
                  className={`segmented-tab ${categoryFilter === "minutes" ? "active" : ""}`}
                  onClick={() => setCategoryFilter("minutes")}
                >
                  Minutes Packages
                </button>
              </div>

              <span className="helper-text">Select a plan to proceed, or click "Skip Subscription" below</span>
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
                                  (plan.tfn_asset_count ?? 0) > 0 ? `${plan.tfn_asset_count} Toll-Free DID` : null,
                                  (plan.did_asset_count ?? 0) > 0 ? `${plan.did_asset_count} Local DID` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" + ") || "None"}
                              </strong>
                            </div>
                            <div className="allowance-item">
                              <span>Free Minutes:</span>
                              <strong>
                                {[
                                  ((plan.tfn_free_minutes ?? 0) + (plan.did_free_minutes ?? 0)) > 0 ? `${formatMins((plan.tfn_free_minutes ?? 0) + (plan.did_free_minutes ?? 0))} shared DID` : null,
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
                              {plan.type === "TFN" || plan.type === "DID" ? "Inbound DID" : "Global Outbound Calling"}
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
                  className="button secondary"
                  onClick={() => {
                    setSkipSubscription(true);
                    setSelectedPlan(null);
                    setStep(4);
                  }}
                  title="Onboard customer without subscribing to any plan"
                >
                  <span>Skip Subscription</span>
                  <ArrowRight size={16} />
                </button>

                <button
                  type="button"
                  className="button primary"
                  disabled={!selectedPlan}
                  onClick={() => {
                    setSkipSubscription(false);
                    setStep(4);
                  }}
                >
                  <span>Review & Subscribe</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Confirm Subscription & Activate */}
        {step === 4 && (selectedPlan || skipSubscription) && (
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
                  {skipSubscription ? (
                    <>
                      <strong style={{ color: "var(--text-muted)" }}>None (Subscription Skipped)</strong>
                      <span className="plan-category-pill" style={{ background: "rgba(148, 163, 184, 0.15)", color: "#94a3b8", border: "1px solid rgba(148, 163, 184, 0.3)" }}>
                        No Plan
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>{selectedPlan?.plan_name}</strong>
                      <span className="plan-category-pill">{selectedPlan?.plan_category}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="review-divider" />

              {/* Financial Breakdown */}
              <div className="financial-ledger-preview">
                <h4>{skipSubscription ? "Purchasing Power & Opening Balance" : "Purchasing Power & Upfront OTC Charge"}</h4>
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
                {!skipSubscription && (
                  <div className="ledger-row">
                    <span>One-Time Charge (OTC) to Debit:</span>
                    <span className="mono text-debt">-${selectedPlanOtc.toFixed(2)}</span>
                  </div>
                )}
                <div className="ledger-row total">
                  <span>Projected Remaining Available Balance:</span>
                  <strong className={`mono ${(skipSubscription ? totalPurchasingPower : remainingPurchasingPower) >= 0 ? "text-accent" : "text-debt"}`}>
                    ${(skipSubscription ? totalPurchasingPower : remainingPurchasingPower).toFixed(2)}
                  </strong>
                </div>

                {!skipSubscription && remainingPurchasingPower < 0 && (
                  <div className="alert-warning-box">
                    <AlertCircle size={15} />
                    <span>
                      The OTC cost exceeds current purchasing power. Check "Override Balance Check" below to bypass overdraft restrictions.
                    </span>
                  </div>
                )}
              </div>

              {/* Number and Minutes Allocation Preview */}
              {!skipSubscription && selectedPlan ? (
                <div className="allocation-preview-box">
                  <h4>Automatic Provisioning on Subscription:</h4>
                  <ul>
                    {(selectedPlan.tfn_asset_count ?? 0) > 0 && (
                      <li>Allocates <strong>{selectedPlan.tfn_asset_count} Toll-Free DID</strong> slots</li>
                    )}
                    {(selectedPlan.did_asset_count ?? 0) > 0 && (
                      <li>Allocates <strong>{selectedPlan.did_asset_count} Local DID</strong> slots</li>
                    )}
                    {((selectedPlan.tfn_free_minutes ?? 0) + (selectedPlan.did_free_minutes ?? 0)) > 0 && (
                      <li>Credits <strong>{formatMins((selectedPlan.tfn_free_minutes ?? 0) + (selectedPlan.did_free_minutes ?? 0))}</strong> shared DID free minutes</li>
                    )}
                    {(selectedPlan.free_minutes ?? 0) > 0 && (
                      <li>✅ Credits <strong>{formatMins(selectedPlan.free_minutes)}</strong> outbound calling minutes to wallet pocket</li>
                    )}
                  </ul>
                </div>
              ) : (
                <div className="allocation-preview-box" style={{ background: "rgba(0, 0, 0, 0.2)", border: "1px dashed var(--line-soft)" }}>
                  <h4 style={{ color: "var(--text-soft)" }}>Plan Allocations:</h4>
                  <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    No automated plan asset slots or minute allowances will be seeded. Numbers, rate cards, and plans can be assigned after onboarding.
                  </p>
                </div>
              )}

              {/* Admin Override Checkbox */}
              {!skipSubscription && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={overrideBalance}
                    onChange={(e) => setOverrideBalance(e.target.checked)}
                  />
                  <span>Override Balance Check (Admin Provisioning bypass)</span>
                </label>
              )}
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
                      <span>{skipSubscription ? "Activate Customer (No Plan)" : "Subscribe & Activate Customer"}</span>
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
              Customer <strong>{createdCustomer.name}</strong> ({createdCustomer.accountCode} · ID: {createdCustomer.id}) is now live and funded.
              {selectedPlan ? (
                <> Subscribed to <strong>{selectedPlan.plan_name}</strong> with number asset slots allocated and minute allowances credited to the wallet.</>
              ) : (
                <> Onboarded without a subscription plan. You can assign subscription plans or rate cards anytime from customer management.</>
              )}
            </p>

            {/* Credential Status Panel */}
            <div className={`credential-status-panel ${credentialEmailStatus?.toLowerCase() || "skipped"}`}>
              <div className="credential-status-icon">
                {credentialEmailStatus === "SENT" && <CheckCircle2 size={20} />}
                {credentialEmailStatus === "FAILED" && <AlertCircle size={20} />}
                {credentialEmailStatus === "SKIPPED" && <Mail size={20} />}
              </div>
              <div className="credential-status-content">
                <div className="credential-status-title">
                  {credentialEmailStatus === "SENT" && `Login credentials emailed to ${adminEmail}.`}
                  {credentialEmailStatus === "FAILED" && "Customer is active, but credential delivery failed."}
                  {credentialEmailStatus === "SKIPPED" && "Automatic credential email is disabled."}
                </div>
                <div className="credential-status-desc">
                  {credentialEmailStatus === "SENT" && (
                    <span>Temporary login instructions have been delivered to the customer administrator.</span>
                  )}
                  {credentialEmailStatus === "FAILED" && (
                    <span>Share the temporary password securely with the customer administrator.</span>
                  )}
                  {credentialEmailStatus === "SKIPPED" && (
                    <span>Share the temporary password securely with the customer administrator.</span>
                  )}
                </div>
              </div>
              {credentialEmailStatus === "FAILED" && (
                <button
                  type="button"
                  className="button secondary small credential-retry-btn"
                  onClick={() => void handleRetryEmail()}
                  disabled={retryingEmail}
                  title="Retry sending credentials email"
                >
                  {retryingEmail ? (
                    <>
                      <LoaderCircle size={14} className="spin" />
                      <span>Retrying...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      <span>Retry Email</span>
                    </>
                  )}
                </button>
              )}
            </div>

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
                <strong>{selectedPlan?.plan_name || "None (Skipped)"}</strong>
              </div>
            </div>

            <div className="form-actions center">
              <button
                type="button"
                className="button primary"
                onClick={() => {
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
