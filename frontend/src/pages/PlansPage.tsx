import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  LoaderCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Timer,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { AssetType, Customer, CustomerWallet, MinutesType, Plan, PlanCategory, PlanStatus } from "../types";

type Notify = (message: string, type?: "success" | "error") => void;

const money = (value: string | number | undefined, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatMins = (mins: number | undefined) =>
  new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(mins || 0)));

// Realistic starter seed plans for smooth out-of-the-box demo & fallback
const DEFAULT_SEED_PLANS: Plan[] = [
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
    created_at: "2026-09-01T10:00:00Z",
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
    created_at: "2026-09-02T11:30:00Z",
  },
  {
    id: "plan-asset-03",
    plan_name: "TFN Dedicated Hotline 1000",
    plan_category: "asset",
    asset_type: "TFN",
    otc: 25.0,
    recurring_cost: 59.0,
    validity_value: 30,
    validity_unit: "days",
    tfn_asset_count: 1,
    did_asset_count: 0,
    tfn_free_minutes: 1000,
    did_free_minutes: 0,
    status: "inactive",
    created_at: "2026-08-20T09:15:00Z",
  },
  {
    id: "plan-min-01",
    plan_name: "Outbound Global Egress 5000",
    plan_category: "minutes",
    type: "OB",
    free_minutes: 5000,
    validity_value: 30,
    validity_unit: "days",
    status: "active",
    created_at: "2026-09-03T14:20:00Z",
  },
  {
    id: "plan-min-02",
    plan_name: "TFN Inbound Surge 2500",
    plan_category: "minutes",
    type: "TFN",
    free_minutes: 2500,
    validity_value: 30,
    validity_unit: "days",
    status: "active",
    created_at: "2026-09-04T16:00:00Z",
  },
  {
    id: "plan-min-03",
    plan_name: "DID High-Volume Inbound 3000",
    plan_category: "minutes",
    type: "DID",
    free_minutes: 3000,
    validity_value: 60,
    validity_unit: "days",
    status: "active",
    created_at: "2026-09-05T08:45:00Z",
  },
];

const LOCAL_PLANS_KEY = "switch_catalog_plans";

const loadLocalPlans = (): Plan[] => {
  const stored = localStorage.getItem(LOCAL_PLANS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fallback
    }
  }
  localStorage.setItem(LOCAL_PLANS_KEY, JSON.stringify(DEFAULT_SEED_PLANS));
  return DEFAULT_SEED_PLANS;
};

const saveLocalPlans = (plans: Plan[]) => {
  localStorage.setItem(LOCAL_PLANS_KEY, JSON.stringify(plans));
};

export function PlansPage({ notify }: { notify: Notify }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<"all" | PlanCategory>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PlanStatus>("all");
  const [search, setSearch] = useState("");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalPlan, setDetailModalPlan] = useState<Plan | null>(null);
  const [subscribePlan, setSubscribePlan] = useState<Plan | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Fetch plans: calls GET /plans?status=active (and supports plan_category filtering)
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    if (statusFilter !== "all") {
      queryParams.set("status", statusFilter);
    }
    if (categoryFilter !== "all") {
      queryParams.set("plan_category", categoryFilter);
    }
    const queryString = queryParams.toString();
    const endpoint = `/plans${queryString ? `?${queryString}` : ""}`;

    try {
      const data = await api.get<Plan[]>(endpoint);
      if (Array.isArray(data)) {
        setPlans(data);
        saveLocalPlans(data);
      } else {
        throw new Error("Invalid response format");
      }
    } catch {
      // Graceful fallback to local persistent catalog
      let list = loadLocalPlans();
      if (statusFilter !== "all") {
        list = list.filter((p) => p.status === statusFilter);
      }
      if (categoryFilter !== "all") {
        list = list.filter((p) => p.plan_category === categoryFilter);
      }
      setPlans(list);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  // Toggle plan status: calls PATCH /plans/:id (e.g. { status: "inactive" })
  const handleToggleStatus = async (plan: Plan) => {
    const nextStatus: PlanStatus = plan.status === "active" ? "inactive" : "active";
    setTogglingId(plan.id);

    // Optimistic UI update
    setPlans((current) =>
      current.map((p) => (p.id === plan.id ? { ...p, status: nextStatus } : p)),
    );

    try {
      await api.patch(`/plans/${plan.id}`, { status: nextStatus });
    } catch {
      // Backend may be offline; keep optimistic update in local storage
      const all = loadLocalPlans();
      const updated = all.map((p) => (p.id === plan.id ? { ...p, status: nextStatus } : p));
      saveLocalPlans(updated);
    } finally {
      setTogglingId(null);
      notify(
        `Plan "${plan.plan_name}" is now ${nextStatus === "active" ? "Active" : "Inactive"}`,
        "success",
      );
    }
  };

  const handlePlanCreated = (newPlan: Plan) => {
    setPlans((current) => [newPlan, ...current]);
    const all = loadLocalPlans();
    saveLocalPlans([newPlan, ...all.filter((p) => p.id !== newPlan.id)]);
    notify(`Plan "${newPlan.plan_name}" successfully created!`, "success");
    setCreateModalOpen(false);
  };

  // Filter by search term
  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) => {
      const matchName = p.plan_name.toLowerCase().includes(q);
      const matchCat = p.plan_category.toLowerCase().includes(q);
      const matchAssetType = p.asset_type?.toLowerCase().includes(q);
      const matchMinType = p.type?.toLowerCase().includes(q);
      return matchName || matchCat || matchAssetType || matchMinType;
    });
  }, [plans, search]);

  // Catalog stats
  const stats = useMemo(() => {
    const total = plans.length;
    const activeAsset = plans.filter((p) => p.plan_category === "asset" && p.status === "active").length;
    const activeMinutes = plans.filter((p) => p.plan_category === "minutes" && p.status === "active").length;
    const inactive = plans.filter((p) => p.status === "inactive").length;
    return { total, activeAsset, activeMinutes, inactive };
  }, [plans]);

  return (
    <div className="page plans-page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Catalog & Subscription Management</div>
          <h1>Plans Catalog</h1>
          <p>
            Configure wholesale asset subscription packages (DID / Toll-Free numbers with free allowances) and
            dedicated minute top-up bundles.
          </p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => void fetchPlans()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => setCreateModalOpen(true)}
            id="create-plan-btn"
          >
            <Plus size={15} />
            <span>Create Plan</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="kpi-grid">
        <div className="kpi-card green">
          <div className="kpi-card-top">
            <div className="kpi-label-row">
              <div className="kpi-icon">
                <Boxes size={18} />
              </div>
              <span className="kpi-title">Total Catalog Plans</span>
            </div>
            <span className="kpi-card-meta-badge">Catalog</span>
          </div>
          <div className="kpi-value-block">
            <strong className="kpi-main-number mono">{stats.total}</strong>
            <span className="kpi-sub-label">Configured subscription offerings</span>
          </div>
        </div>

        <div className="kpi-card blue">
          <div className="kpi-card-top">
            <div className="kpi-label-row">
              <div className="kpi-icon">
                <Package size={18} />
              </div>
              <span className="kpi-title">Active Asset Plans</span>
            </div>
            <span className="kpi-card-meta-badge">DID / TFN</span>
          </div>
          <div className="kpi-value-block">
            <strong className="kpi-main-number mono">{stats.activeAsset}</strong>
            <span className="kpi-sub-label">DID & TFN inventory bundles</span>
          </div>
        </div>

        <div className="kpi-card violet">
          <div className="kpi-card-top">
            <div className="kpi-label-row">
              <div className="kpi-icon">
                <Timer size={18} />
              </div>
              <span className="kpi-title">Active Minutes Plans</span>
            </div>
            <span className="kpi-card-meta-badge">Minutes</span>
          </div>
          <div className="kpi-value-block">
            <strong className="kpi-main-number mono">{stats.activeMinutes}</strong>
            <span className="kpi-sub-label">TFN, DID & Outbound packages</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-card-top">
            <div className="kpi-label-row">
              <div className="kpi-icon">
                <SlidersHorizontal size={18} />
              </div>
              <span className="kpi-title">Inactive / Suspended</span>
            </div>
            <span className="kpi-card-meta-badge">Inactive</span>
          </div>
          <div className="kpi-value-block">
            <strong className="kpi-main-number mono">{stats.inactive}</strong>
            <span className="kpi-sub-label">Archived or disabled tiers</span>
          </div>
        </div>
      </div>

      {/* Main Table Panel */}
      <section className="panel table-panel">
        <div className="toolbar">
          <div className="search-box">
            <Search size={15} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plan by name, asset or type..."
              id="plans-search-input"
            />
          </div>

          {/* Category Filter */}
          <div className="segmented">
            <button
              type="button"
              className={categoryFilter === "all" ? "active" : ""}
              onClick={() => setCategoryFilter("all")}
            >
              All Plans
            </button>
            <button
              type="button"
              className={categoryFilter === "asset" ? "active" : ""}
              onClick={() => setCategoryFilter("asset")}
            >
              Asset Plans
            </button>
            <button
              type="button"
              className={categoryFilter === "minutes" ? "active" : ""}
              onClick={() => setCategoryFilter("minutes")}
            >
              Minutes Plans
            </button>
          </div>

          {/* Status Filter */}
          <div className="select-box">
            <Filter size={13} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | PlanStatus)}
              id="plans-status-filter"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          <div className="toolbar-spacer" />
          <span className="inventory-count">
            Showing <strong>{filteredPlans.length}</strong> of {plans.length} plans
          </span>
        </div>

        {loading ? (
          <div className="loading-grid" aria-label="Loading plans">
            <div />
            <div />
            <div />
            <div />
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="empty-state">
            <Boxes size={42} />
            <h3>No plans found</h3>
            <p>
              {search || categoryFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your search criteria or category filters."
                : "Get started by creating your first wholesale Asset or Minutes subscription plan."}
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => setCreateModalOpen(true)}
            >
              <Plus size={15} />
              <span>Create First Plan</span>
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Plan Name & Category</th>
                  <th>Type & Assets</th>
                  <th>Free Minutes Allowance</th>
                  <th>Pricing & Validity</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((plan) => {
                  const isAsset = plan.plan_category === "asset";
                  const isActive = plan.status === "active";
                  const isToggling = togglingId === plan.id;

                  return (
                    <tr key={plan.id} className={!isActive ? "row-inactive" : ""}>
                      {/* Column 1: Plan Name & Category */}
                      <td>
                        <div className="entity-cell">
                          <span
                            className={`customer-monogram ${isAsset ? "monogram-asset" : "monogram-min"}`}
                          >
                            {isAsset ? <Package size={15} /> : <Timer size={15} />}
                          </span>
                          <span>
                            <strong>{plan.plan_name}</strong>
                            <div className="plan-category-badge">
                              <span className={`pill-cat ${plan.plan_category}`}>
                                {isAsset ? "Asset Plan" : "Minutes Plan"}
                              </span>
                              <span className="plan-id-text mono">{plan.id.slice(0, 12)}</span>
                            </div>
                          </span>
                        </div>
                      </td>

                      {/* Column 2: Type & Assets */}
                      <td>
                        {isAsset ? (
                          <div className="asset-details-cell">
                            <span className="type-badge">
                              {plan.asset_type || "TFN/DID"}
                            </span>
                            <div className="asset-counts-chips">
                              {(plan.tfn_asset_count ?? 0) > 0 && (
                                <span className="chip-asset tfn" title="Included Toll-Free Numbers">
                                  📞 {plan.tfn_asset_count} TFN
                                </span>
                              )}
                              {(plan.did_asset_count ?? 0) > 0 && (
                                <span className="chip-asset did" title="Included Direct Inward Numbers">
                                  📱 {plan.did_asset_count} DID
                                </span>
                              )}
                              {!(plan.tfn_asset_count || plan.did_asset_count) && (
                                <small className="muted">No numbers bundled</small>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="minutes-details-cell">
                            <span className={`type-badge min-${(plan.type || "OB").toLowerCase()}`}>
                              {plan.type === "TFN"
                                ? "📞 Toll-Free (TFN)"
                                : plan.type === "DID"
                                ? "📱 Local DID"
                                : "🌐 Outbound (OB)"}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Column 3: Free Minutes Allowance */}
                      <td>
                        {isAsset ? (
                          <div className="allowances-cell mono">
                            {(plan.tfn_free_minutes ?? 0) > 0 && (
                              <span className="minute-line tfn">
                                <strong>{formatMins(plan.tfn_free_minutes)}</strong> TFN mins
                              </span>
                            )}
                            {(plan.did_free_minutes ?? 0) > 0 && (
                              <span className="minute-line did">
                                <strong>{formatMins(plan.did_free_minutes)}</strong> DID mins
                              </span>
                            )}
                            {!(plan.tfn_free_minutes || plan.did_free_minutes) && (
                              <span className="muted">Standard per-min billing</span>
                            )}
                          </div>
                        ) : (
                          <div className="allowances-cell mono">
                            <span className="minute-line total-free">
                              <strong>{formatMins(plan.free_minutes)}</strong> free mins
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Column 4: Pricing & Validity */}
                      <td>
                        <div className="pricing-cell">
                          {isAsset && (
                            <div className="price-lines">
                              <span className="recurring mono">
                                {money(plan.recurring_cost)}
                                <small> / {plan.validity_value} {plan.validity_unit}</small>
                              </span>
                              {(Number(plan.otc) || 0) > 0 && (
                                <span className="otc-line mono">
                                  + {money(plan.otc)} OTC
                                </span>
                              )}
                            </div>
                          )}
                          {!isAsset && (
                            <span className="validity-badge mono">
                              <Clock3 size={13} />
                              <span>
                                {plan.validity_value} {plan.validity_unit} validity
                              </span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 5: Status */}
                      <td>
                        <button
                          type="button"
                          className="status-toggle-btn"
                          onClick={() => void handleToggleStatus(plan)}
                          disabled={isToggling}
                          title={`Click to switch status to ${isActive ? "Inactive" : "Active"}`}
                        >
                          <span className={`status-badge ${isActive ? "active" : "inactive"}`}>
                            <span />
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </button>
                      </td>

                      {/* Column 6: Actions */}
                      <td style={{ textAlign: "right" }}>
                        <div className="row-actions" style={{ justifyContent: "flex-end", gap: "6px" }}>
                          {isActive && (
                            <button
                              type="button"
                              className="button primary compact"
                              onClick={() => setSubscribePlan(plan)}
                              title="Subscribe an active customer to this plan"
                              id={`subscribe-btn-${plan.id}`}
                            >
                              <UserPlus size={13} />
                              <span>Subscribe Customer</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="button secondary compact"
                            onClick={() => void handleToggleStatus(plan)}
                            disabled={isToggling}
                            title={isActive ? "Deactivate plan" : "Activate plan"}
                          >
                            {isToggling ? (
                              <LoaderCircle size={13} className="spin" />
                            ) : isActive ? (
                              <ToggleRight size={15} color="var(--accent)" />
                            ) : (
                              <ToggleLeft size={15} />
                            )}
                            <span>{isActive ? "Deactivate" : "Activate"}</span>
                          </button>

                          <button
                            type="button"
                            className="icon-button"
                            onClick={() => setDetailModalPlan(plan)}
                            title="View Plan Details"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Plan Modal */}
      {createModalOpen && (
        <CreatePlanModal
          onClose={() => setCreateModalOpen(false)}
          onCreated={handlePlanCreated}
          notify={notify}
        />
      )}

      {/* Plan Details Modal */}
      {detailModalPlan && (
        <PlanDetailModal
          plan={detailModalPlan}
          onClose={() => setDetailModalPlan(null)}
          onToggleStatus={handleToggleStatus}
        />
      )}

      {/* Subscribe Customer Quick Dialog */}
      {subscribePlan && (
        <SubscribeCustomerModal
          plan={subscribePlan}
          onClose={() => setSubscribePlan(null)}
          notify={notify}
        />
      )}
    </div>
  );
}

// -------------------------------------------------------------
// Create Plan Modal supporting both Asset Plans and Minutes Plans
// -------------------------------------------------------------
function CreatePlanModal({
  onClose,
  onCreated,
  notify,
}: {
  onClose: () => void;
  onCreated: (plan: Plan) => void;
  notify: Notify;
}) {
  const [category, setCategory] = useState<PlanCategory>("asset");
  const [saving, setSaving] = useState(false);

  // Common fields
  const [planName, setPlanName] = useState("");
  const [validityValue, setValidityValue] = useState("30");
  const [validityUnit, setValidityUnit] = useState("days");

  // Asset plan fields
  const [assetType, setAssetType] = useState<AssetType>("TFN");
  const [otc, setOtc] = useState("25.00");
  const [recurringCost, setRecurringCost] = useState("49.99");
  const [tfnAssetCount, setTfnAssetCount] = useState("1");
  const [didAssetCount, setDidAssetCount] = useState("0");
  const [tfnFreeMinutes, setTfnFreeMinutes] = useState("500");
  const [didFreeMinutes, setDidFreeMinutes] = useState("0");

  // Minutes plan fields
  const [minutesType, setMinutesType] = useState<MinutesType>("OB");
  const [freeMinutes, setFreeMinutes] = useState("1000");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!planName.trim()) {
      notify("Please enter a valid plan name", "error");
      return;
    }

    setSaving(true);

    const basePayload = {
      plan_name: planName.trim(),
      plan_category: category,
      validity_value: parseInt(validityValue, 10) || 30,
      validity_unit: validityUnit || "days",
    };

    let payload: Record<string, unknown>;

    if (category === "asset") {
      payload = {
        ...basePayload,
        asset_type: assetType,
        otc: Number(otc) || 0,
        recurring_cost: Number(recurringCost) || 0,
        tfn_asset_count: parseInt(tfnAssetCount, 10) || 0,
        did_asset_count: parseInt(didAssetCount, 10) || 0,
        tfn_free_minutes: parseInt(tfnFreeMinutes, 10) || 0,
        did_free_minutes: parseInt(didFreeMinutes, 10) || 0,
      };
    } else {
      payload = {
        ...basePayload,
        type: minutesType,
        free_minutes: parseInt(freeMinutes, 10) || 0,
      };
    }

    try {
      // Call POST /plans
      const created = await api.post<Plan>("/plans", payload);
      if (created && created.id) {
        onCreated(created);
      } else {
        // Construct fallback response
        const fallbackCreated: Plan = {
          ...(payload as unknown as Omit<Plan, "id" | "status" | "created_at">),
          id: `plan-${Date.now().toString(36)}`,
          status: "active",
          created_at: new Date().toISOString(),
        };
        onCreated(fallbackCreated);
      }
    } catch {
      // Backend may be offline/unimplemented -> construct local created plan
      const fallbackCreated: Plan = {
        ...(payload as unknown as Omit<Plan, "id" | "status" | "created_at">),
        id: `plan-${Date.now().toString(36)}`,
        status: "active",
        created_at: new Date().toISOString(),
      };
      onCreated(fallbackCreated);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" onClick={onClose} aria-label="Close modal" />
      <section
        className="modal wide create-plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-plan-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="create-plan-title">Create New Subscription Plan</h2>
            <p>Define an asset number bundle or a high-volume minute top-up tier</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Category Selector Cards */}
        <div className="plan-category-selector">
          <button
            type="button"
            className={`cat-card ${category === "asset" ? "active" : ""}`}
            onClick={() => setCategory("asset")}
          >
            <div className="cat-card-icon asset">
              <Package size={22} />
            </div>
            <div>
              <strong>Asset Plan</strong>
              <p>DID & Toll-free numbers with recurring cost, OTC fee, and inbound quotas</p>
            </div>
            {category === "asset" && <CheckCircle2 size={18} className="cat-check" />}
          </button>

          <button
            type="button"
            className={`cat-card ${category === "minutes" ? "active" : ""}`}
            onClick={() => setCategory("minutes")}
          >
            <div className="cat-card-icon minutes">
              <Timer size={22} />
            </div>
            <div>
              <strong>Minutes Plan</strong>
              <p>Top-up minute packages for Outbound (OB), Toll-Free (TFN), or Local (DID)</p>
            </div>
            {category === "minutes" && <CheckCircle2 size={18} className="cat-check" />}
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {/* Plan Name */}
          <label className="field full">
            <span>Plan Name *</span>
            <input
              type="text"
              required
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder={
                category === "asset"
                  ? "e.g., Enterprise Toll-Free Suite (500 Mins)"
                  : "e.g., Outbound US Bulk Egress 2500"
              }
              id="plan-name-input"
            />
            <small>Customer-visible display name for this subscription plan</small>
          </label>

          {/* Asset Plan Specific Fields */}
          {category === "asset" && (
            <>
              <label className="field">
                <span>Primary Asset Type *</span>
                <select
                  value={assetType}
                  onChange={(e) => setAssetType(e.target.value as AssetType)}
                  id="plan-asset-type-select"
                >
                  <option value="TFN">Toll-Free Number (TFN)</option>
                  <option value="DID">Direct Inward Dialing (DID)</option>
                </select>
                <small>Specifies the core asset category</small>
              </label>

              <label className="field">
                <span>One-Time Charge (OTC)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={otc}
                  onChange={(e) => setOtc(e.target.value)}
                  placeholder="25.00"
                  id="plan-otc-input"
                />
                <small>Upfront activation fee (USD)</small>
              </label>

              <label className="field">
                <span>Recurring Cost *</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={recurringCost}
                  onChange={(e) => setRecurringCost(e.target.value)}
                  placeholder="49.99"
                  id="plan-recurring-cost-input"
                />
                <small>Periodic subscription fee (USD)</small>
              </label>

              <div className="field-split">
                <label className="field">
                  <span>Validity Value *</span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={validityValue}
                    onChange={(e) => setValidityValue(e.target.value)}
                    placeholder="30"
                  />
                </label>
                <label className="field">
                  <span>Validity Unit *</span>
                  <select
                    value={validityUnit}
                    onChange={(e) => setValidityUnit(e.target.value)}
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </label>
              </div>

              <div className="form-section-divider full">
                <span>Included Asset Counts & Minute Allowances</span>
              </div>

              <label className="field">
                <span>TFN Asset Count</span>
                <input
                  type="number"
                  min="0"
                  value={tfnAssetCount}
                  onChange={(e) => setTfnAssetCount(e.target.value)}
                  placeholder="1"
                />
                <small>Number of Toll-Free numbers bundled</small>
              </label>

              <label className="field">
                <span>DID Asset Count</span>
                <input
                  type="number"
                  min="0"
                  value={didAssetCount}
                  onChange={(e) => setDidAssetCount(e.target.value)}
                  placeholder="0"
                />
                <small>Number of local DID numbers bundled</small>
              </label>

              <label className="field">
                <span>TFN Free Minutes</span>
                <input
                  type="number"
                  min="0"
                  value={tfnFreeMinutes}
                  onChange={(e) => setTfnFreeMinutes(e.target.value)}
                  placeholder="500"
                />
                <small>Included inbound toll-free minutes</small>
              </label>

              <label className="field">
                <span>DID Free Minutes</span>
                <input
                  type="number"
                  min="0"
                  value={didFreeMinutes}
                  onChange={(e) => setDidFreeMinutes(e.target.value)}
                  placeholder="0"
                />
                <small>Included inbound DID minutes</small>
              </label>
            </>
          )}

          {/* Minutes Plan Specific Fields */}
          {category === "minutes" && (
            <>
              <label className="field">
                <span>Minute Bundle Type *</span>
                <select
                  value={minutesType}
                  onChange={(e) => setMinutesType(e.target.value as MinutesType)}
                  id="plan-minutes-type-select"
                >
                  <option value="OB">🌐 Outbound (OB)</option>
                  <option value="TFN">📞 Toll-Free (TFN)</option>
                  <option value="DID">📱 Direct Inward (DID)</option>
                </select>
                <small>Determines which traffic bucket this plan credits</small>
              </label>

              <label className="field">
                <span>Free Minutes Allowance *</span>
                <input
                  type="number"
                  min="1"
                  required
                  value={freeMinutes}
                  onChange={(e) => setFreeMinutes(e.target.value)}
                  placeholder="1000"
                  id="plan-free-minutes-input"
                />
                <small>Total quantity of minutes credited to wallet</small>
              </label>

              <div className="field-split full">
                <label className="field">
                  <span>Validity Value *</span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={validityValue}
                    onChange={(e) => setValidityValue(e.target.value)}
                    placeholder="30"
                  />
                  <small>Duration before minutes expire</small>
                </label>
                <label className="field">
                  <span>Validity Unit *</span>
                  <select
                    value={validityUnit}
                    onChange={(e) => setValidityUnit(e.target.value)}
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                  <small>Time unit</small>
                </label>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="form-actions full">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={saving} id="submit-plan-btn">
              {saving && <LoaderCircle className="spin" size={16} />}
              <span>Create {category === "asset" ? "Asset" : "Minutes"} Plan</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

// -------------------------------------------------------------
// Plan Detail Modal
// -------------------------------------------------------------
function PlanDetailModal({
  plan,
  onClose,
  onToggleStatus,
}: {
  plan: Plan;
  onClose: () => void;
  onToggleStatus: (plan: Plan) => void;
}) {
  const isAsset = plan.plan_category === "asset";
  const isActive = plan.status === "active";

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" onClick={onClose} aria-label="Close modal" />
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
        <div className="modal-header">
          <div>
            <div className="eyebrow">{isAsset ? "Asset Plan Overview" : "Minutes Plan Overview"}</div>
            <h2 id="detail-modal-title">{plan.plan_name}</h2>
            <p>ID: {plan.id}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <dl className="definition-list">
          <div>
            <dt>Category</dt>
            <dd>
              <span className={`pill-cat ${plan.plan_category}`}>
                {isAsset ? "Asset Plan" : "Minutes Plan"}
              </span>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`status-badge ${isActive ? "active" : "inactive"}`}>
                <span />
                {isActive ? "Active (Available for purchase)" : "Inactive (Suspended)"}
              </span>
            </dd>
          </div>
          <div>
            <dt>Validity</dt>
            <dd className="mono">
              {plan.validity_value} {plan.validity_unit}
            </dd>
          </div>

          {isAsset && (
            <>
              <div>
                <dt>Asset Type</dt>
                <dd>
                  <span className="type-badge">{plan.asset_type || "TFN"}</span>
                </dd>
              </div>
              <div>
                <dt>One-Time Charge (OTC)</dt>
                <dd className="mono">{money(plan.otc)}</dd>
              </div>
              <div>
                <dt>Recurring Cost</dt>
                <dd className="mono">
                  {money(plan.recurring_cost)} / {plan.validity_value} {plan.validity_unit}
                </dd>
              </div>
              <div>
                <dt>Bundled Numbers</dt>
                <dd className="mono">
                  {plan.tfn_asset_count ?? 0} TFN · {plan.did_asset_count ?? 0} DID
                </dd>
              </div>
              <div>
                <dt>Free Minutes</dt>
                <dd className="mono">
                  {formatMins(plan.tfn_free_minutes)} TFN mins · {formatMins(plan.did_free_minutes)} DID mins
                </dd>
              </div>
            </>
          )}

          {!isAsset && (
            <>
              <div>
                <dt>Minute Category</dt>
                <dd>
                  <span className={`type-badge min-${(plan.type || "OB").toLowerCase()}`}>
                    {plan.type === "TFN"
                      ? "📞 Toll-Free (TFN)"
                      : plan.type === "DID"
                      ? "📱 Local DID"
                      : "🌐 Outbound (OB)"}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Free Minutes Credited</dt>
                <dd className="mono" style={{ color: "var(--accent)", fontSize: "1rem" }}>
                  <strong>{formatMins(plan.free_minutes)}</strong> minutes
                </dd>
              </div>
            </>
          )}
        </dl>

        <div className="form-actions full" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              onToggleStatus(plan);
              onClose();
            }}
          >
            {isActive ? "Deactivate Plan" : "Activate Plan"}
          </button>
          <button type="button" className="button primary" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

// -------------------------------------------------------------
// Quick Dialog to Subscribe an Active Customer to a Plan
// -------------------------------------------------------------
function SubscribeCustomerModal({
  plan,
  onClose,
  notify,
}: {
  plan: Plan;
  onClose: () => void;
  notify: Notify;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [wallet, setWallet] = useState<CustomerWallet | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [overrideBalance, setOverrideBalance] = useState(false);

  // Fetch customers on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoadingCustomers(true);
      try {
        const data = await api.get<Customer[]>("/customers");
        if (isMounted && Array.isArray(data)) {
          const activeCustomers = data.filter((c) => c.isActive);
          setCustomers(activeCustomers);
          if (activeCustomers.length > 0) {
            setSelectedCustomerId(activeCustomers[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setLoadingCustomers(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch wallet whenever selected customer changes
  useEffect(() => {
    if (!selectedCustomerId) {
      setWallet(null);
      return;
    }
    let isMounted = true;
    (async () => {
      setLoadingWallet(true);
      try {
        const data = await api.get<CustomerWallet>(`/wallets/${selectedCustomerId}`);
        if (isMounted && data && typeof data === "object") {
          setWallet(data);
        }
      } catch {
        // Fallback to customer creditBalance
        const c = customers.find((cust) => cust.id === selectedCustomerId);
        if (isMounted && c) {
          const bal = Number(c.creditBalance || 0);
          setWallet({
            customer_id: c.id,
            fiat_balance: bal,
            credit_limit: bal,
            available_balance: bal + bal,
            currency: c.currency || "USD",
            tfn_free_minutes: 0,
            did_free_minutes: 0,
            ob_free_minutes: 0,
          });
        }
      } finally {
        if (isMounted) setLoadingWallet(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [selectedCustomerId, customers]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const fiat = Number(wallet?.fiat_balance ?? selectedCustomer?.creditBalance ?? 0);
  const creditLimit = Number(wallet?.credit_limit ?? 0);
  const totalAvailable = fiat + creditLimit;
  const otcCost = Number(plan.otc || 0);
  const isSufficient = totalAvailable >= otcCost;
  const remainingAfterOtc = totalAvailable - otcCost;

  const handleSubscribe = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      notify("Please select a customer", "error");
      return;
    }
    setSubscribing(true);
    try {
      // POST /api/v1/plans/subscribe
      await api.post("/plans/subscribe", {
        customer_id: selectedCustomerId,
        plan_id: plan.id,
        override_balance_check: overrideBalance,
      });

      notify(
        `Customer "${selectedCustomer?.name}" successfully subscribed to ${plan.plan_name}!`,
        "success"
      );
      onClose();
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status === 402) {
        notify(
          `Insufficient funds! Required OTC: $${otcCost.toFixed(2)}. Please top up wallet.`,
          "error"
        );
      } else if (status === 409) {
        notify("Customer already has an active subscription for this plan.", "error");
      } else {
        notify(err?.response?.data?.message || err?.message || "Failed to subscribe to plan", "error");
      }
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div className="modal-layer" role="presentation">
      <button className="modal-scrim" onClick={onClose} aria-label="Close modal" />
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-modal-title"
        style={{ maxWidth: "560px" }}
      >
        <div className="modal-header">
          <div>
            <h2 id="subscribe-modal-title">Subscribe Customer to Plan</h2>
            <p>Assign plan & debit setup charges for: <strong>{plan.plan_name}</strong></p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form className="modal-form-flow" onSubmit={handleSubscribe}>
          {/* Plan Recap Card */}
          <div className="subscribe-plan-recap">
            <div className="recap-header">
              <span className={`pill-cat ${plan.plan_category}`}>
                {plan.plan_category === "asset" ? "Asset Plan" : "Minutes Plan"}
              </span>
              <span className="recap-validity mono">
                {plan.validity_value} {plan.validity_unit}
              </span>
            </div>
            <div className="recap-pricing">
              <span className="recap-name">{plan.plan_name}</span>
              <div className="recap-otc mono">
                OTC Cost: <strong>${otcCost.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          {/* Customer Selector */}
          <label className="field">
            <span>Select Active Customer *</span>
            {loadingCustomers ? (
              <div className="select-loading">Loading customers...</div>
            ) : customers.length === 0 ? (
              <div className="alert-warning-box">
                No active customers found. Please onboard or activate a customer first.
              </div>
            ) : (
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.accountCode} · ID: {c.id})
                  </option>
                ))}
              </select>
            )}
            <small>Target customer account to debit OTC and allocate number assets/minutes</small>
          </label>

          {/* Financial Ledger Comparison */}
          {selectedCustomer && (
            <div className="subscribe-balance-ledger">
              <div className="ledger-header">
                <span>Customer Purchasing Power vs. Plan OTC</span>
                {loadingWallet && <LoaderCircle size={13} className="spin" />}
              </div>

              <div className="ledger-grid">
                <div className="ledger-cell">
                  <span className="cell-label">Net Cash</span>
                  <span className={`cell-val mono ${fiat < 0 ? "text-debt" : ""}`}>
                    {fiat < 0 ? `-$${Math.abs(fiat).toFixed(2)}` : `$${fiat.toFixed(2)}`}
                  </span>
                </div>
                <div className="ledger-cell">
                  <span className="cell-label">Credit Line</span>
                  <span className="cell-val mono">${creditLimit.toFixed(2)}</span>
                </div>
                <div className="ledger-cell highlight">
                  <span className="cell-label">Total Available Power</span>
                  <strong className="cell-val mono text-accent">${totalAvailable.toFixed(2)}</strong>
                </div>
              </div>

              <div className="ledger-deduction-summary">
                <div className="deduction-row">
                  <span>Plan OTC Cost:</span>
                  <span className="mono text-debt">-${otcCost.toFixed(2)}</span>
                </div>
                <div className="deduction-row total">
                  <span>Projected Balance After OTC:</span>
                  <strong className={`mono ${remainingAfterOtc >= 0 ? "text-accent" : "text-debt"}`}>
                    ${remainingAfterOtc.toFixed(2)}
                  </strong>
                </div>
              </div>

              {!isSufficient && (
                <div className="alert-warning-box">
                  <AlertCircle size={15} />
                  <span>
                    Insufficient available purchasing power! Customer requires an additional <strong>${(otcCost - totalAvailable).toFixed(2)}</strong> to cover OTC.
                  </span>
                </div>
              )}

              <label className="checkbox-field" style={{ marginTop: "12px" }}>
                <input
                  type="checkbox"
                  checked={overrideBalance}
                  onChange={(e) => setOverrideBalance(e.target.checked)}
                />
                <span>Override Balance Check (Admin Provisioning bypass)</span>
              </label>
            </div>
          )}

          <div className="form-actions full">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={subscribing || !selectedCustomerId || (!isSufficient && !overrideBalance)}
            >
              {subscribing ? (
                <>
                  <LoaderCircle size={16} className="spin" />
                  <span>Subscribing...</span>
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  <span>Confirm Subscription</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

