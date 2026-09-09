import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Hash,
  HelpCircle,
  Layers,
  LoaderCircle,
  Package,
  PhoneCall,
  RadioTower,
  ShieldAlert,
  Sparkles,
  Timer,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Customer, Plan, PlanCategory } from "../types";

type Step = 1 | 2 | 3 | 4;

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

  // Step 1: Customer Details & Opening Credit
  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [openingCredit, setOpeningCredit] = useState("5000");
  const [defaultChannelLimit, setDefaultChannelLimit] = useState("");
  const [defaultCallerIdMode, setDefaultCallerIdMode] = useState("PASSTHROUGH");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<Customer | null>(null);

  // Step 2: Plan Selection
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | PlanCategory>("all");

  // Step 3: Subscription API state
  const [subscribing, setSubscribing] = useState(false);
  const [overrideBalance, setOverrideBalance] = useState(false);
  const [subscriptionResult, setSubscriptionResult] = useState<any>(null);

  // Fetch active plans when entering step 2
  useEffect(() => {
    if (step === 2 && plans.length === 0) {
      void loadActivePlans();
    }
  }, [step, plans.length]);

  const loadActivePlans = async () => {
    setLoadingPlans(true);
    try {
      // GET /api/v1/plans?status=active
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

  // Step 1 Submit: Create Customer with Opening Credit
  const handleStep1Submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !accountCode.trim()) {
      notify("Customer name and account code are required", "error");
      return;
    }

    setCreatingCustomer(true);
    try {
      const creditNum = Number(openingCredit) || 0;
      // POST /api/v1/customers (backend creates customer and initializes wallet with credit_limit)
      const res = await api.post<Customer>("/customers", {
        name: name.trim(),
        accountCode: accountCode.trim().toUpperCase(),
        currency: currency.toUpperCase(),
        creditBalance: creditNum,
        defaultChannelLimit: defaultChannelLimit ? Number(defaultChannelLimit) : undefined,
        defaultCallerIdMode,
        isActive: true,
      });

      setCreatedCustomer(res);
      notify(`Customer ${res.name} created with $${creditNum.toFixed(2)} opening credit line!`, "success");
      setStep(2);
    } catch (err: any) {
      const msg = err?.message || "Failed to create customer";
      notify(msg, "error");
    } finally {
      setCreatingCustomer(false);
    }
  };

  // Step 3: Call Subscribe API
  const handleConfirmSubscribe = async () => {
    if (!createdCustomer || !selectedPlan) return;

    setSubscribing(true);
    try {
      // POST /api/v1/plans/subscribe
      const response = await api.post("/plans/subscribe", {
        customer_id: createdCustomer.id,
        plan_id: selectedPlan.id,
        override_balance_check: overrideBalance,
      });

      // On 201 Created:
      notify("Customer successfully subscribed and number slots allocated!", "success");
      setSubscriptionResult(response);
      setStep(4);
      onSuccess(createdCustomer);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status === 402) {
        notify(
          `Insufficient funds! Required OTC: $${Number(selectedPlan.otc || 0).toFixed(2)}. Please top up wallet.`,
          "error"
        );
      } else if (status === 409) {
        notify("Customer already has an active subscription for this plan.", "error");
      } else {
        const errorMsg =
          err?.response?.data?.message || err?.message || "Failed to subscribe to plan";
        notify(errorMsg, "error");
      }
    } finally {
      setSubscribing(false);
    }
  };

  const handleSkipSubscription = () => {
    if (createdCustomer) {
      notify("Customer created successfully without upfront plan subscription", "success");
      onSuccess(createdCustomer);
      onClose();
    }
  };

  const filteredPlans = plans.filter((p) => {
    if (categoryFilter === "all") return true;
    return p.plan_category === categoryFilter;
  });

  const openingCreditNum = Number(openingCredit) || 0;
  const selectedPlanOtc = Number(selectedPlan?.otc || 0);
  const remainingPurchasingPower = openingCreditNum - selectedPlanOtc;

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" onClick={onClose} aria-label="Close modal" />
      <section
        className="modal wizard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        style={{ maxWidth: "800px", width: "95vw" }}
      >
        {/* Wizard Header with Stepper */}
        <div className="modal-header wizard-modal-header">
          <div>
            <div className="wizard-tag">
              <Sparkles size={14} />
              <span>Customer Onboarding Flow</span>
            </div>
            <h2 id="wizard-title">
              {step === 1 && "Step 1: Customer Details & Opening Credit"}
              {step === 2 && "Step 2: Select Subscription Plan"}
              {step === 3 && "Step 3: Confirm Subscription & Allocation"}
              {step === 4 && "Onboarding Complete!"}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* 3-Step Visual Progress Stepper */}
        <div className="wizard-stepper">
          <div className={`step-item ${step >= 1 ? "active" : ""} ${step > 1 ? "completed" : ""}`}>
            <div className="step-circle">{step > 1 ? <Check size={14} /> : "1"}</div>
            <div className="step-text">
              <strong>Customer & Credit</strong>
              <small>Basic details & wallet</small>
            </div>
          </div>
          <div className="step-divider" />
          <div className={`step-item ${step >= 2 ? "active" : ""} ${step > 2 ? "completed" : ""}`}>
            <div className="step-circle">{step > 2 ? <Check size={14} /> : "2"}</div>
            <div className="step-text">
              <strong>Plan Selection</strong>
              <small>Asset or Minutes</small>
            </div>
          </div>
          <div className="step-divider" />
          <div className={`step-item ${step >= 3 ? "active" : ""} ${step >= 4 ? "completed" : ""}`}>
            <div className="step-circle">{step >= 4 ? <Check size={14} /> : "3"}</div>
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
                  step="100"
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

            <div className="step-summary-banner">
              <CircleDollarSign size={18} className="text-accent" />
              <div>
                <strong>Automatic Wallet Initialization</strong>
                <p>
                  Submitting this step executes <code>POST /api/v1/customers</code>. The backend creates the customer record and initializes an active wallet with a <strong>${openingCreditNum.toFixed(2)}</strong> credit line.
                </p>
              </div>
            </div>

            <div className="form-actions full">
              <button type="button" className="button secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={creatingCustomer}>
                {creatingCustomer ? (
                  <>
                    <LoaderCircle size={16} className="spin" />
                    <span>Creating Customer...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Plan Selection</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Plan Selection */}
        {step === 2 && (
          <div className="modal-form-flow">
            <div className="customer-onboarding-banner">
              <div className="tenant-chip">
                <UserCheck size={15} />
                <span>Customer Created: <strong>{createdCustomer?.name}</strong> ({createdCustomer?.accountCode})</span>
              </div>
              <div className="credit-chip">
                <span>Opening Credit Line: <strong>${openingCreditNum.toFixed(2)} {currency}</strong></span>
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

              <span className="helper-text">Click a plan to select it for subscription</span>
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
                  const isAffordable = openingCreditNum >= otc;

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
                          {isAffordable ? "✓ Covered by Credit Line" : "⚠️ Exceeds Opening Credit"}
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
                onClick={handleSkipSubscription}
                title="Finish onboarding without subscribing to an initial plan"
              >
                Skip Plan Subscription
              </button>

              <div className="wizard-actions-right">
                <button
                  type="button"
                  className="button primary"
                  disabled={!selectedPlan}
                  onClick={() => setStep(3)}
                >
                  <span>Review & Subscribe</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Confirm Subscription & Allocation */}
        {step === 3 && selectedPlan && createdCustomer && (
          <div className="modal-form-flow">
            <div className="subscription-review-card">
              <div className="review-section">
                <span className="review-label">Customer Account</span>
                <div className="review-value">
                  <strong>{createdCustomer.name}</strong>
                  <span className="account-tag mono">{createdCustomer.accountCode}</span>
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
                  <span>Customer Opening Credit Line:</span>
                  <span className="mono">${openingCreditNum.toFixed(2)}</span>
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
                      The OTC cost exceeds the opening credit line. Backend check will return <code>402 Payment Required</code> unless overridden.
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
                onClick={() => setStep(2)}
                disabled={subscribing}
              >
                <ArrowLeft size={16} />
                <span>Back to Plans</span>
              </button>

              <button
                type="button"
                className="button primary"
                disabled={subscribing}
                onClick={() => void handleConfirmSubscribe()}
              >
                {subscribing ? (
                  <>
                    <LoaderCircle size={16} className="spin" />
                    <span>Provisioning Subscription...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Confirm & Activate Subscription</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Success Completion */}
        {step === 4 && createdCustomer && (
          <div className="wizard-success-card">
            <div className="success-icon-circle">
              <CheckCircle2 size={42} />
            </div>
            <h3>Customer Onboarding Completed!</h3>
            <p>
              Customer <strong>{createdCustomer.name}</strong> ({createdCustomer.accountCode}) is now live.
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
                <span>Opening Credit Line</span>
                <strong className="mono text-accent">${openingCreditNum.toFixed(2)}</strong>
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
                  onClose();
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
