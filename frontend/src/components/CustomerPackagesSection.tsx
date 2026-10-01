import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Hash,
  LoaderCircle,
  Package,
  PackageCheck,
  PhoneCall,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useCustomerPackages } from "../lib/packagesApi";
import type { Customer, CustomerPackage, PackageStatus } from "../types";

interface CustomerPackagesSectionProps {
  customer?: Customer | null;
  customerId?: string;
  notify?: (message: string, type?: "success" | "error") => void;
}

function formatDate(isoString?: string) {
  if (!isoString) return "N/A";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Invalid date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function StatusBadge({ status }: { status: PackageStatus }) {
  const normalized = (status || "").toLowerCase();

  const config: Record<string, { label: string; className: string; dotColor: string }> = {
    active: { label: "Active", className: "pkg-status-active", dotColor: "#10b981" },
    suspended: { label: "Suspended", className: "pkg-status-suspended", dotColor: "#f59e0b" },
    expired: { label: "Expired", className: "pkg-status-expired", dotColor: "#f43f5e" },
    cancelled: { label: "Cancelled", className: "pkg-status-cancelled", dotColor: "#94a3b8" },
  };

  const current = config[normalized] || {
    label: status,
    className: "pkg-status-default",
    dotColor: "#94a3b8",
  };

  return (
    <span className={`pkg-status-badge ${current.className}`}>
      <span className="pkg-status-dot" style={{ backgroundColor: current.dotColor }} />
      {current.label}
    </span>
  );
}

interface LimitsDropdownProps {
  label: string;
  icon: LucideIcon;
  iconColor?: string;
  items: Array<{ label: string; value: string | number }>;
}

function LimitsDropdown({
  label,
  icon: Icon,
  iconColor,
  items,
}: LimitsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="pkg-dropdown-box" ref={dropdownRef}>
      <button
        type="button"
        className={`pkg-dropdown-trigger ${isOpen ? "is-open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        title={`Click to view ${label} limits`}
      >
        <Icon size={14} className={iconColor || "text-muted"} />
        <span className="pkg-dropdown-title">{label}</span>
        <ChevronDown size={13} className={`pkg-dropdown-arrow ${isOpen ? "is-rotated" : ""}`} />
      </button>

      {isOpen && (
        <div className="pkg-dropdown-content">
          <div className="pkg-dropdown-header">{label} Limit Entitlements</div>
          <div className="pkg-dropdown-items-list">
            {items.map((item, index) => (
              <div className="pkg-dropdown-row" key={index}>
                <span className="pkg-dropdown-row-label">{item.label}</span>
                <strong className="pkg-dropdown-row-val mono">{item.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({
  pkg,
  onToggleRenewal,
}: {
  pkg: CustomerPackage;
  onToggleRenewal: (pkg: CustomerPackage) => void;
}) {
  const isAsset = pkg.plan.category === "asset";
  const isMinutes = pkg.plan.category === "minutes";

  // Asset plan values
  const tfnCount = pkg.limits?.numbers?.tfn ?? 0;
  const didCount = pkg.limits?.numbers?.did ?? 0;
  const tfnMinutes = pkg.limits?.minutes?.tfn ?? 0;
  const didMinutes = pkg.limits?.minutes?.did ?? 0;
  const freeMinutes = pkg.limits?.minutes?.free ?? 0;

  // Minutes plan values
  const totalMinutes = pkg.limits?.minutes?.total ?? 0;

  return (
    <div className="panel pkg-plan-card">
      {/* 1. plan_name, 2. status, and auto_renewal toggle */}
      <div className="pkg-plan-top-row">
        <div className="pkg-plan-title-block">
          <h3 className="pkg-plan-name">{pkg.plan.name}</h3>
          <StatusBadge status={pkg.status} />
          <span className={`pkg-plan-category-pill ${isAsset ? "pill-asset" : "pill-minutes"}`}>
            {isAsset ? "Asset Plan" : "Minutes Plan"}
          </span>
        </div>

        {/* Auto Renewal Toggle */}
        <div className="pkg-plan-toggle-section">
          <span className="pkg-toggle-caption">Auto Renewal</span>
          <button
            type="button"
            role="switch"
            aria-checked={pkg.renewal}
            className={`pkg-toggle-btn ${pkg.renewal ? "is-on" : "is-off"}`}
            onClick={() => onToggleRenewal(pkg)}
            title={pkg.renewal ? "Click to close auto-renewal" : "Click to start auto-renewal"}
          >
            <span className="pkg-toggle-track">
              <span className="pkg-toggle-thumb" />
            </span>
            <span className="pkg-toggle-state-text">
              {pkg.renewal ? "ON" : "OFF"}
            </span>
          </button>
        </div>
      </div>

      {/* 3. subs_at & 4. exp_at */}
      <div className="pkg-plan-dates-line">
        <div className="pkg-plan-date-group">
          <Calendar size={13} className="pkg-date-icon" />
          <span className="pkg-date-lbl">Subscribed At:</span>
          <span className="pkg-date-val mono">{formatDate(pkg.subscribed_at)}</span>
        </div>

        <span className="pkg-date-divider">•</span>

        <div className="pkg-plan-date-group">
          <Clock size={13} className="pkg-date-icon" />
          <span className="pkg-date-lbl">Expires At:</span>
          <span className="pkg-date-val mono">{formatDate(pkg.expires_at)}</span>
        </div>
      </div>

      {/* Limits Dropdown Boxes */}
      <div className="pkg-plan-limits-line">
        <span className="pkg-limits-lead-label">Limits:</span>

        <div className="pkg-plan-dropdowns-group">
          {isAsset && (
            <>
              {/* Numbers dropdown: tfn & did */}
              <LimitsDropdown
                label="Numbers"
                icon={Hash}
                iconColor="text-cyan"
                items={[
                  { label: "TFN (Toll-Free)", value: tfnCount },
                  { label: "DID (Direct Inward)", value: didCount },
                ]}
              />

              {/* Minutes dropdown: tfn, did & free */}
              <LimitsDropdown
                label="Minutes"
                icon={PhoneCall}
                iconColor="text-emerald"
                items={[
                  { label: "TFN Minutes", value: `${tfnMinutes.toLocaleString()} mins` },
                  { label: "DID Minutes", value: `${didMinutes.toLocaleString()} mins` },
                  { label: "Free Minutes", value: `${freeMinutes.toLocaleString()} mins` },
                ]}
              />
            </>
          )}

          {isMinutes && (
            /* Minutes dropdown: total */
            <LimitsDropdown
              label="Minutes"
              icon={Clock}
              iconColor="text-violet"
              items={[
                { label: "Total Minutes", value: `${totalMinutes.toLocaleString()} mins` },
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function CustomerPackagesSection({
  customer,
  customerId: propCustomerId,
  notify,
}: CustomerPackagesSectionProps) {
  const activeCustomerId = propCustomerId || customer?.id || "";
  const { packages: fetchedPackages, loading, error, reload } = useCustomerPackages(activeCustomerId);

  const [packages, setPackages] = useState<CustomerPackage[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Sync fetched packages and apply local renewal preferences
  useEffect(() => {
    if (fetchedPackages) {
      const merged = fetchedPackages.map((pkg) => {
        const stored = localStorage.getItem(`switch_pkg_renewal_${pkg.id}`);
        if (stored !== null) {
          return { ...pkg, renewal: stored === "true" };
        }
        return pkg;
      });
      setPackages(merged);
    }
  }, [fetchedPackages]);

  // Handle start / close auto-renewal toggle
  const handleToggleRenewal = useCallback(
    async (pkg: CustomerPackage) => {
      const nextRenewal = !pkg.renewal;

      // Optimistic update
      setPackages((prev) =>
        prev.map((item) => (item.id === pkg.id ? { ...item, renewal: nextRenewal } : item))
      );

      // Persist in localStorage
      localStorage.setItem(`switch_pkg_renewal_${pkg.id}`, String(nextRenewal));

      // Attempt endpoint update if available
      try {
        const baseUrl = (
          import.meta.env.VITE_SUBSCRIPTION_SERVICE_URL || "http://127.0.0.1:5010"
        ).replace(/\/$/, "");

        await fetch(`${baseUrl}/subscriptions/${encodeURIComponent(pkg.id)}/renewal`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ renewal: nextRenewal }),
        }).catch(() => null);
      } catch {
        // Ignore network error
      }

      notify?.(
        `Auto-renewal ${nextRenewal ? "started (ON)" : "closed (OFF)"} for "${pkg.plan.name}"`,
        "success"
      );
    },
    [notify]
  );

  // Aggregate metrics
  const stats = useMemo(() => {
    const total = packages.length;
    const active = packages.filter((p) => p.status === "active").length;
    const autoRenewing = packages.filter((p) => p.renewal).length;
    const assetCount = packages.filter((p) => p.plan.category === "asset").length;
    const minutesCount = packages.filter((p) => p.plan.category === "minutes").length;

    let totalMinutesQuota = 0;
    let totalTfnSlots = 0;
    let totalDidSlots = 0;

    for (const p of packages) {
      if (p.status === "active") {
        if (p.plan.category === "minutes") {
          totalMinutesQuota += p.limits?.minutes?.total ?? 0;
        } else if (p.plan.category === "asset") {
          totalTfnSlots += p.limits?.numbers?.tfn ?? 0;
          totalDidSlots += p.limits?.numbers?.did ?? 0;
          totalMinutesQuota +=
            (p.limits?.minutes?.tfn ?? 0) +
            (p.limits?.minutes?.did ?? 0) +
            (p.limits?.minutes?.free ?? 0);
        }
      }
    }

    return {
      total,
      active,
      autoRenewing,
      assetCount,
      minutesCount,
      totalMinutesQuota,
      totalTfnSlots,
      totalDidSlots,
    };
  }, [packages]);

  // Filtered packages
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      if (statusFilter !== "all" && pkg.status !== statusFilter) return false;
      if (categoryFilter !== "all" && pkg.plan.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = pkg.plan.name?.toLowerCase().includes(q);
        if (!matchesName) return false;
      }
      return true;
    });
  }, [packages, statusFilter, categoryFilter, searchQuery]);

  return (
    <div className="pkg-section-container">
      {/* Top Header Banner */}
      <div className="pkg-header-banner panel">
        <div className="pkg-header-main">
          <div className="pkg-icon-badge">
            <Package size={24} />
          </div>
          <div>
            <div className="eyebrow">Customer Plan Subscriptions</div>
            <h2 className="pkg-section-title">Packages & Entitlements</h2>
            <p className="pkg-section-desc">
              Manage active and historical package subscriptions, allocated DID & Toll-Free number limits,
              and prepaid minute quota pools.
            </p>
          </div>
        </div>

        <div className="pkg-header-actions">
          <button
            type="button"
            className="button secondary pkg-reload-btn"
            onClick={() => reload()}
            disabled={loading}
            title="Refresh packages"
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>

          <Link to="/management/plans" className="button primary pkg-subscribe-btn">
            <Sparkles size={14} />
            <span>Subscribe Plan</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div className="kpi-grid pkg-kpi-grid">
        <div className="kpi-card green">
          <div className="kpi-card-top">
            <div className="kpi-label-row">
              <div className="kpi-icon">
                <PackageCheck size={18} />
              </div>
              <span className="kpi-title">Active Packages</span>
            </div>
            <span className="kpi-card-meta-badge">Operational</span>
          </div>
          <div className="kpi-value-block">
            <strong className="kpi-main-number mono">{stats.active}</strong>
            <span className="kpi-sub-label">of {stats.total} total subscriptions</span>
          </div>
        </div>

        <div className="kpi-card blue">
          <div className="kpi-card-top">
            <div className="kpi-label-row">
              <div className="kpi-icon">
                <CheckCircle2 size={18} />
              </div>
              <span className="kpi-title">Auto-Renewal Active</span>
            </div>
            <span className="kpi-card-meta-badge">Billing</span>
          </div>
          <div className="kpi-value-block">
            <strong className="kpi-main-number mono">{stats.autoRenewing}</strong>
            <span className="kpi-sub-label">automatic cycle extensions</span>
          </div>
        </div>

        <div className="kpi-card violet">
          <div className="kpi-card-top">
            <div className="kpi-label-row">
              <div className="kpi-icon">
                <Clock size={18} />
              </div>
              <span className="kpi-title">Active Minutes Pool</span>
            </div>
            <span className="kpi-card-meta-badge">Quota</span>
          </div>
          <div className="kpi-value-block">
            <strong className="kpi-main-number mono">
              {stats.totalMinutesQuota.toLocaleString()}
            </strong>
            <span className="kpi-sub-label">minutes included across plans</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-card-top">
            <div className="kpi-label-row">
              <div className="kpi-icon">
                <Hash size={18} />
              </div>
              <span className="kpi-title">Number Slots</span>
            </div>
            <span className="kpi-card-meta-badge">Capacity</span>
          </div>
          <div className="kpi-value-block">
            <strong className="kpi-main-number mono">
              {stats.totalTfnSlots + stats.totalDidSlots}
            </strong>
            <span className="kpi-sub-label">
              {stats.totalTfnSlots} TFN · {stats.totalDidSlots} DID
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="pkg-filter-bar panel">
        <div className="pkg-search-wrapper">
          <Search size={15} className="pkg-search-icon" />
          <input
            type="text"
            className="pkg-search-input"
            placeholder="Search plans by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="pkg-clear-search-btn"
              onClick={() => setSearchQuery("")}
            >
              Clear
            </button>
          )}
        </div>

        <div className="pkg-filters-group">
          <div className="pkg-filter-select-wrapper">
            <span className="pkg-filter-label">Status:</span>
            <select
              className="pkg-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="pkg-filter-select-wrapper">
            <span className="pkg-filter-label">Category:</span>
            <select
              className="pkg-filter-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="asset">Asset Plans</option>
              <option value="minutes">Minutes Plans</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="panel pkg-loading-state">
          <LoaderCircle size={28} className="spin text-emerald" />
          <p>Loading plans and packages...</p>
        </div>
      ) : error ? (
        <div className="panel pkg-error-state">
          <ShieldAlert size={32} className="text-danger" />
          <h3>Unable to load plans</h3>
          <p className="pkg-error-message">{error}</p>
          <button type="button" className="button primary" onClick={() => reload()}>
            <RefreshCw size={14} />
            <span>Try Again</span>
          </button>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="panel pkg-empty-state">
          <div className="pkg-empty-icon-wrap">
            <Package size={32} className="text-muted" />
          </div>
          <h3>
            {packages.length === 0
              ? "No plans found for this customer"
              : "No plans match your filters"}
          </h3>
          <p>
            {packages.length === 0
              ? "This customer does not have any active or historical plan subscriptions."
              : "Try adjusting your search query or status filter."}
          </p>
          {packages.length === 0 && (
            <Link to="/management/plans" className="button primary">
              <Sparkles size={14} />
              <span>Subscribe to a Plan</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="pkg-plans-list">
          {filteredPackages.map((pkg) => (
            <PlanCard
              key={pkg.id}
              pkg={pkg}
              onToggleRenewal={handleToggleRenewal}
            />
          ))}
        </div>
      )}
    </div>
  );
}
