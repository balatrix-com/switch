import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  BadgeDollarSign,
  BookOpen,
  Boxes,
  Braces,
  Cable,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CircleGauge,
  ClipboardList,
  CloudCog,
  ContactRound,
  Database,
  FileClock,
  FileText,
  FlaskConical,
  Gauge,
  GitBranch,
  GripVertical,
  Hash,
  Headphones,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareWarning,
  Moon,
  Network,
  PanelLeftClose,
  Pencil,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  RadioTower,
  Route as RouteIcon,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  WalletCards,
  X,
  WandSparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Link,
  NavLink,
  Navigate,
  Route as RouterRoute,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { api, apiBaseUrl } from "./lib/api";
import { CdrPage, CustomerCdr } from "./pages/CdrPage";
import { CustomerLatestCalls } from "./pages/CustomerLatestCallsPage";
import { RateCardsPage } from "./pages/RateCardsPage";
import { SipTracePage } from "./pages/SipTracePage";
import { LiveCallsPage } from "./pages/LiveCallsPage";
import { PlansPage } from "./pages/PlansPage";
import {
  CustomerWalletWidget,
  CustomerWalletSection,
} from "./components/CustomerWalletWidget";
import { CustomerOnboardingWizard } from "./components/CustomerOnboardingWizard";
import { LoginPage } from "./pages/LoginPage";
import { CustomerDashboardPage } from "./pages/CustomerDashboardPage";
import { AccountSecurityPage, AccountSecurityPanel } from "./pages/AccountSecurityPage";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SupportMembersPanel } from "./components/SupportMembersPanel";
import { useAuth } from "./context/AuthContext";
import { useTheme } from "./context/ThemeContext";
import type {
  Carrier,
  CarrierRoute,
  Customer,
  CustomerNumber,
  Endpoint,
  InventoryNumber,
  NormalizationOperation,
  NormalizationProfile,
  NormalizationStep,
  Route,
  RoutingResolution,
  SourceAuth,
  SipUser,
  SipUserList,
} from "./types";

type Toast = { id: number; type: "success" | "error"; message: string };
type LoadState<T> = { data: T | null; loading: boolean; error: string | null };

const money = (value: string | number | undefined, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    Number(value || 0),
  );

function useResource<T>(
  loader: () => Promise<T>,
  dependencies: unknown[] = [],
) {
  const [state, setState] = useState<LoadState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await loader();
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load data",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}

function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback(
    (message: string, type: Toast["type"] = "success") => {
      const id = Date.now();
      setToasts((items) => [...items, { id, message, type }]);
      window.setTimeout(
        () => setToasts((items) => items.filter((item) => item.id !== id)),
        4200,
      );
    },
    [],
  );
  return (
    <>
      <Routes>
        <RouterRoute path="/login" element={<LoginPage />} />
        <RouterRoute path="/*" element={
          <ProtectedRoute>
            <a className="skip-link" href="#main-content">Skip to content</a>
            <AppShell><AppRoutes notify={notify} /></AppShell>
          </ProtectedRoute>
        } />
      </Routes>
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            {toast.type === "success" ? (
              <ShieldCheck size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  return <ProtectedRoute allowedRoles={["SUPER_ADMIN"]}>{children}</ProtectedRoute>;
}

function CustomerOnly({ children }: { children: ReactNode }) {
  return <ProtectedRoute allowedRoles={["CUSTOMER"]}>{children}</ProtectedRoute>;
}

function SupportOnly({ children }: { children: ReactNode }) {
  return <ProtectedRoute allowedRoles={["SUPPORT_MEMBER"]}>{children}</ProtectedRoute>;
}

function AdminOnlyAction({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "SUPER_ADMIN" ? <>{children}</> : null;
}

function AppRoutes({ notify }: { notify: (message: string, type?: Toast["type"]) => void }) {
  return (
    <Routes>
      <RouterRoute path="/" element={<AdminOnly><Dashboard /></AdminOnly>} />
      <RouterRoute path="/management/customers" element={<AdminOnly><CustomersPage notify={notify} /></AdminOnly>} />
      <RouterRoute path="/management/customers/:customerId" element={<AdminOnly><Navigate to="main" replace /></AdminOnly>} />
      <RouterRoute path="/management/customers/:customerId/:section" element={<AdminOnly><CustomerDetail notify={notify} /></AdminOnly>} />
      <RouterRoute path="/management/carriers" element={<AdminOnly><CarriersPage notify={notify} /></AdminOnly>} />
      <RouterRoute path="/management/carriers/:carrierId" element={<AdminOnly><CarrierDetail notify={notify} /></AdminOnly>} />
      <RouterRoute path="/management/rate-cards" element={<AdminOnly><RateCardsPage notify={notify} /></AdminOnly>} />
      <RouterRoute path="/management/plans" element={<AdminOnly><PlansPage notify={notify} /></AdminOnly>} />
      <RouterRoute path="/global/did" element={<AdminOnly><DidPage notify={notify} /></AdminOnly>} />
      <RouterRoute path="/global/ip-authentication" element={<AdminOnly><GlobalIpAuth notify={notify} /></AdminOnly>} />
      <RouterRoute path="/global/normalization" element={<AdminOnly><GlobalNormalization notify={notify} /></AdminOnly>} />
      <RouterRoute path="/global/routing" element={<AdminOnly><GlobalRouting /></AdminOnly>} />
      <RouterRoute path="/global/cdr" element={<AdminOnly><CdrPage /></AdminOnly>} />
      <RouterRoute path="/global/sip-trace" element={<AdminOnly><SipTracePage /></AdminOnly>} />
      <RouterRoute path="/global/live-calls" element={<AdminOnly><LiveCallsPage notify={notify} /></AdminOnly>} />
      <RouterRoute path="/global/dialogs" element={<AdminOnly><Navigate to="/global/live-calls" replace /></AdminOnly>} />
      <RouterRoute path="/docs" element={<AdminOnly><ApiConnection /></AdminOnly>} />
      <RouterRoute path="/profile" element={<AccountSecurityPage />} />
      <RouterRoute path="/support" element={<SupportOnly><SupportDashboardPage /></SupportOnly>} />
      <RouterRoute path="/support/customers/:customerId" element={<SupportOnly><SupportWorkspacePage notify={notify} /></SupportOnly>} />
      <RouterRoute path="/support/customers/:customerId/:section" element={<SupportOnly><SupportWorkspacePage notify={notify} /></SupportOnly>} />

      <RouterRoute path="/dashboard" element={<CustomerOnly><CustomerDashboardPage /></CustomerOnly>} />
      <RouterRoute path="/numbers" element={<CustomerOnly><CustomerPortalPage section="numbers" notify={notify} /></CustomerOnly>} />
      <RouterRoute path="/extensions" element={<CustomerOnly><CustomerPortalPage section="extensions" notify={notify} /></CustomerOnly>} />
      <RouterRoute path="/routing" element={<CustomerOnly><Navigate to="/dashboard" replace /></CustomerOnly>} />
      <RouterRoute path="/normalization" element={<CustomerOnly><CustomerPortalPage section="normalization" notify={notify} /></CustomerOnly>} />
      <RouterRoute path="/cdr" element={<CustomerOnly><CustomerPortalPage section="cdr" notify={notify} /></CustomerOnly>} />
      <RouterRoute path="/live-calls" element={<CustomerOnly><CustomerPortalPage section="live-calls" notify={notify} /></CustomerOnly>} />
      <RouterRoute path="/account" element={<CustomerOnly><CustomerPortalPage section="account" notify={notify} /></CustomerOnly>} />
      <RouterRoute path="*" element={<PlaceholderPage />} />
    </Routes>
  );
}

const managementNav = [
  { label: "Customers", path: "/management/customers", icon: UsersRound },
  { label: "Carriers", path: "/management/carriers", icon: Server },
  { label: "Phone Numbers (DID)", path: "/global/did", icon: Hash },
];

const trafficNav = [
  { label: "Live Calls", path: "/global/live-calls", icon: PhoneCall, badge: "Live" },
  { label: "Call Records (CDR)", path: "/global/cdr", icon: FileClock },
  { label: "SIP Trace Debugger", path: "/global/sip-trace", icon: RadioTower },
  { label: "Outbound Routing", path: "/global/routing", icon: Network },
];

const billingNav = [
  { label: "Rate Cards", path: "/management/rate-cards", icon: BadgeDollarSign },
  { label: "Subscription Plans", path: "/management/plans", icon: Boxes },
  { label: "Vouchers", path: "/management/vouchers", icon: WalletCards },
  { label: "Invoices", path: "/global/invoices", icon: FileText },
  { label: "Payments", path: "/global/payments", icon: CircleDollarSign },
];

const securityNav = [
  { label: "IP Authentication", path: "/global/ip-authentication", icon: KeyRound },
  { label: "SIP User Auth", path: "/global/sip-user-auth", icon: ShieldCheck },
  { label: "SIP Registration", path: "/global/sip-registration", icon: Cable },
  { label: "Normalization Rules", path: "/global/normalization", icon: WandSparkles },
  { label: "Alerts & Notifications", path: "/global/alerts", icon: MessageSquareWarning },
  { label: "Transcription", path: "/global/transcription", icon: Headphones },
];

const customerNav = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "DIDs & Numbers", path: "/numbers", icon: Hash },
  { label: "IP Authentication", path: "/extensions", icon: KeyRound },
  { label: "Normalization", path: "/normalization", icon: WandSparkles },
  { label: "Call Records", path: "/cdr", icon: FileClock },
  { label: "Live Calls", path: "/live-calls", icon: PhoneCall },
  { label: "Account Settings", path: "/account", icon: Settings2 },
];

const systemDevNav = [
  { label: "Audit Logging", path: "/logging", icon: ClipboardList },
  { label: "API Reference", path: "/docs", icon: BookOpen },
  { label: "Profile & Security", path: "/profile", icon: KeyRound },
];

function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  useEffect(() => setSidebarOpen(false), [location.pathname]);
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside
        className={`sidebar ${sidebarOpen ? "open" : ""}`}
        aria-label="Primary navigation"
      >
        <div className="brand">
          <span className="brand-mark">
            <Zap size={19} />
          </span>
          <span className="brand-copy">
            <strong>Switchboard</strong>
            <small>Billing routing console</small>
          </span>
          <button
            type="button"
            className="collapse-button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>
        <nav>
          {user?.role === "CUSTOMER" ? customerNav.map((item) => <SideLink key={item.path} item={item} end={item.path === "/dashboard"} />) : user?.role === "SUPPORT_MEMBER" ? <>
            <SideLink item={{ label: "Assigned Customers", path: "/support", icon: UsersRound }} end />
            <SideLink item={{ label: "Profile & Security", path: "/profile", icon: KeyRound }} />
          </> : <>
            <SideLink item={{ label: "Overview", path: "/", icon: LayoutDashboard }} end />
            <NavGroup label="Core Entities" items={managementNav} />
            <NavGroup label="Traffic & Signaling" items={trafficNav} />
            <NavGroup label="Billing & Finance" items={billingNav} />
            <NavGroup label="Security & Config" items={securityNav} />
            <NavGroup label="System & Developer" items={systemDevNav} />
          </>}
        </nav>
        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>Routing API</strong>
            <small>Direct connection</small>
          </div>
        </div>
      </aside>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="environment">
            <span className="status-dot" /> Production routing
          </div>
          <div className="topbar-actions">
            {/* Light / Dark Mode Toggle */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={theme === "light" ? "Switch to Dark mode" : "Switch to Light mode"}
              title={theme === "light" ? "Switch to Dark mode" : "Switch to Light mode"}
            >
              <span className={`theme-toggle-icon ${theme}`}>
                {theme === "light" ? <Sun size={13} /> : <Moon size={13} />}
              </span>
              <span className="theme-toggle-label">
                {theme === "light" ? "Light" : "Dark"}
              </span>
            </button>

            <Link to="/profile" className="operator-identity" title="View profile & security">
              <span className="operator-role">
                {user?.role === "SUPER_ADMIN"
                  ? "Super Administrator"
                  : user?.role === "SUPPORT_MEMBER"
                    ? "Support Member"
                    : user?.name || "Customer Account"}
              </span>
              <span className="operator-email">
                {user?.email || user?.customer?.accountCode || ""}
              </span>
            </Link>
            <div className="operator-avatar" aria-label="Signed in user">
              {(user?.name || user?.email || "U")
                .split(/\s|@/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </div>
            <button className="button ghost compact" onClick={logout}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavGroup({
  label,
  items,
}: {
  label: string;
  items: { label: string; path: string; icon: LucideIcon; badge?: string }[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="nav-group">
      <button
        className="nav-section-label nav-group-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronDown size={14} />
      </button>
      {open && items.map((item) => <SideLink key={item.path} item={item} />)}
    </div>
  );
}

function SideLink({
  item,
  end = false,
}: {
  item: { label: string; path: string; icon: LucideIcon; badge?: string };
  end?: boolean;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      end={end}
      className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
      title={item.label}
    >
      <Icon size={18} />
      <span className="side-link-text">{item.label}</span>
      {item.badge && <span className="side-link-badge">{item.badge}</span>}
    </NavLink>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

function StatusBadge({ active, label }: { active?: boolean; label?: string }) {
  return (
    <span className={`status-badge ${active ? "active" : "inactive"}`}>
      <span />
      {label || (active ? "Active" : "Inactive")}
    </span>
  );
}

function DataState({
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <div className="loading-grid" aria-label="Loading">
        <div />
        <div />
        <div />
        <div />
      </div>
    );
  if (error)
    return (
      <div className="empty-state error-state">
        <AlertTriangle />
        <h3>Unable to load this view</h3>
        <p>{error}</p>
        {onRetry && (
          <button className="button secondary" onClick={onRetry}>
            <RefreshCw size={16} /> Retry
          </button>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="empty-state">
        <Database />
        <h3>No records yet</h3>
        <p>Add the first record to start configuring call routing.</p>
      </div>
    );
  return <>{children}</>;
}

function Dashboard() {
  const [lastUpdated, setLastUpdated] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  );

  const resource = useResource(async () => {
    const [customers, carriers, numbers, sourceAuth, routes] =
      await Promise.all([
        api.get<Customer[]>("/customers"),
        api.get<Carrier[]>("/carriers"),
        api.get<InventoryNumber[]>("/number-inventory"),
        api.get<SourceAuth[]>("/source-ip-auth"),
        api.get<Route[]>("/switch-routes/global"),
      ]);
    setLastUpdated(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    );
    return { customers, carriers, numbers, sourceAuth, routes };
  }, []);

  const data = resource.data;

  // Tenant metrics
  const totalCustomers = data?.customers.length || 0;
  const activeCustomers = data?.customers.filter((c) => c.isActive).length || 0;
  const customerActiveRate = totalCustomers > 0 ? Math.round((activeCustomers / totalCustomers) * 100) : 100;

  // Carrier interconnect metrics
  const totalCarriers = data?.carriers.length || 0;
  const activeCarriers = data?.carriers.filter((c) => c.isActive).length || 0;
  const carrierActiveRate = totalCarriers > 0 ? Math.round((activeCarriers / totalCarriers) * 100) : 100;

  // Inventory numbers metrics
  const totalNumbers = data?.numbers.length || 0;
  const assigned = data?.numbers.filter((item) => Boolean(item.assignment)).length || 0;
  const unassigned = Math.max(0, totalNumbers - assigned);
  const didAssignRate = totalNumbers > 0 ? Math.round((assigned / totalNumbers) * 100) : 0;

  // Global Routing metrics
  const totalRoutes = data?.routes.length || 0;
  const activeRoutes = data?.routes.filter((item) => item.isActive).length || 0;
  const routesWithXml = data?.routes.filter((item) => Boolean(item.xml)).length || 0;
  const routeActiveRate = totalRoutes > 0 ? Math.round((activeRoutes / totalRoutes) * 100) : 100;

  // Source auth metrics
  const totalSourceAuth = data?.sourceAuth.length || 0;
  const activeSourceAuth = data?.sourceAuth.filter((item) => item.isActive).length || 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Network Operations Center"
        title="Routing Overview"
        description="Live operational telemetry across registered tenants, interconnected carrier gateways, inventory pools, and routing rules."
        actions={
          <button
            className="button secondary compact"
            onClick={resource.reload}
            disabled={resource.loading}
            title="Refresh telemetry data"
          >
            <RefreshCw size={14} className={resource.loading ? "spin" : ""} />
            <span>{resource.loading ? "Syncing..." : "Refresh"}</span>
          </button>
        }
      />
      <DataState
        loading={resource.loading}
        error={resource.error}
        onRetry={resource.reload}
      >
        {/* Top 4 KPI Metrics */}
        <div className="kpi-grid">
          <Kpi
            icon={UsersRound}
            label="Active Tenants"
            value={activeCustomers}
            meta={`${totalCustomers} Total Registered Tenants`}
            badge={`${customerActiveRate}% Active`}
            tone="green"
          />
          <Kpi
            icon={Server}
            label="Carrier Interconnects"
            value={activeCarriers}
            meta={`${totalCarriers} Gateway${totalCarriers === 1 ? "" : "s"} Provisioned`}
            badge={`${carrierActiveRate}% Available`}
            tone="blue"
          />
          <Kpi
            icon={Phone}
            label="Assigned DIDs"
            value={assigned}
            meta={`${unassigned} Numbers in Reserve Pool`}
            badge={`${didAssignRate}% Assigned`}
            tone="violet"
          />
          <Kpi
            icon={RouteIcon}
            label="Active Route Paths"
            value={activeRoutes}
            meta={`${routesWithXml} Dialplans Compiled to XML`}
            badge={`${routeActiveRate}% Active`}
            tone="amber"
          />
        </div>

        {/* 2-Column Dashboard Grid */}
        <div className="dashboard-grid">
          {/* Main Left: Routing Footprint & Resource Distribution */}
          <section className="panel span-2">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Routing Topology</span>
                <h2>Resource Footprint & Telemetry</h2>
              </div>
              <span className="live-pill">
                <span /> Telemetry Active
              </span>
            </div>

            <div className="telemetry-body">
              <div
                className="traffic-chart"
                aria-label="Configuration footprint telemetry chart"
              >
                <svg viewBox="0 0 720 180" role="img">
                  <defs>
                    <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity=".38" />
                      <stop offset="65%" stopColor="#0284c7" stopOpacity=".12" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  {[30, 70, 110, 150].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="720"
                      y2={y}
                      className="chart-grid"
                    />
                  ))}

                  {/* Smooth Telemetry Curve */}
                  <path
                    d="M0 148 C60 135, 90 90, 150 102 S240 130, 310 75 S420 85, 480 50 S600 75, 720 25 L720 180 L0 180 Z"
                    fill="url(#area-gradient)"
                  />
                  <path
                    d="M0 148 C60 135, 90 90, 150 102 S240 130, 310 75 S420 85, 480 50 S600 75, 720 25"
                    className="chart-line"
                  />

                  {/* Milestone Marker Dots */}
                  {[
                    { cx: 150, cy: 102 },
                    { cx: 310, cy: 75 },
                    { cx: 480, cy: 50 },
                    { cx: 720, cy: 25 },
                  ].map((pt, i) => (
                    <circle
                      key={i}
                      cx={pt.cx}
                      cy={pt.cy}
                      r="4.5"
                      fill="#38bdf8"
                      stroke="#0b1322"
                      strokeWidth="2.5"
                    />
                  ))}
                </svg>

                <div className="chart-labels">
                  <span>Tenants ({activeCustomers})</span>
                  <span>Gateways ({activeCarriers})</span>
                  <span>DIDs ({assigned})</span>
                  <span>Routes ({activeRoutes})</span>
                  <span>XML Engine ({routesWithXml})</span>
                </div>
              </div>

              {/* Resource Capacity Summary Strip */}
              <div className="telemetry-metrics-grid">
                <div className="telemetry-metric-box">
                  <span>DID Pool Utilization</span>
                  <strong>{assigned} / {totalNumbers}</strong>
                  <small>{didAssignRate}% numbers assigned</small>
                </div>
                <div className="telemetry-metric-box">
                  <span>Carrier Availability</span>
                  <strong>{activeCarriers} / {totalCarriers}</strong>
                  <small>{carrierActiveRate}% gateways online</small>
                </div>
                <div className="telemetry-metric-box">
                  <span>XML Dialplan Compilation</span>
                  <strong>{routesWithXml} / {totalRoutes}</strong>
                  <small>{totalRoutes > 0 ? Math.round((routesWithXml / totalRoutes) * 100) : 100}% compiled</small>
                </div>
              </div>
            </div>
          </section>

          {/* Right Top: Switch Configuration Health */}
          <section className="panel health-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Switch Health</span>
                <h2>Configuration Checks</h2>
              </div>
              <Gauge size={19} className="text-accent" />
            </div>
            <HealthRow
              label="Customers with Routes"
              value={
                data?.customers.filter(
                  (customer) => (customer._count?.routes || 0) > 0,
                ).length || 0
              }
              total={totalCustomers || 1}
            />
            <HealthRow
              label="Assigned DID Inventory"
              value={assigned}
              total={totalNumbers || 1}
            />
            <HealthRow
              label="Active Source IP Auth Rules"
              value={activeSourceAuth}
              total={totalSourceAuth || 1}
            />
            <HealthRow
              label="Routes with Compiled XML"
              value={routesWithXml}
              total={totalRoutes || 1}
            />
          </section>

          {/* Main Left: Customer Readiness Roster */}
          <section className="panel span-2">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Tenant Roster</span>
                <h2>Customer Readiness & Routing</h2>
              </div>
              <Link to="/management/customers" className="text-link">
                <span>View all customers</span>
                <ArrowRight size={14} />
              </Link>
            </div>
            <div className="readiness-list">
              {(data?.customers || []).slice(0, 6).map((customer) => (
                <Link
                  to={`/management/customers/${customer.id}/main`}
                  className="readiness-row"
                  key={customer.id}
                  title={`Configure customer ${customer.name}`}
                >
                  <span className="customer-monogram">
                    {customer.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{customer.name}</strong>
                    <small>{customer.accountCode}</small>
                  </span>
                  <span className="readiness-pill">
                    <Hash size={13} />
                    <strong>{customer._count?.numbers || 0}</strong> DIDs
                  </span>
                  <span className="readiness-pill">
                    <Network size={13} />
                    <strong>{customer._count?.routes || 0}</strong> Routes
                  </span>
                  <StatusBadge active={customer.isActive} />
                  <ChevronRight size={17} className="quick-arrow" />
                </Link>
              ))}
              {!data?.customers.length && (
                <div className="inline-empty">No customers configured yet.</div>
              )}
            </div>
          </section>

          {/* Right Bottom: Quick Operations Shortcuts */}
          <section className="panel quick-actions">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Shortcuts</span>
                <h2>Operations Center</h2>
              </div>
            </div>
            <QuickLink
              to="/management/customers"
              icon={UserRound}
              title="Add a Customer"
              text="Onboard tenant with opening credit line"
            />
            <QuickLink
              to="/management/carriers"
              icon={CloudCog}
              title="Connect a Carrier"
              text="Configure SIP gateways & rate cards"
            />
            <QuickLink
              to="/global/did?tab=provision"
              icon={Upload}
              title="Provision Numbers"
              text="Single or bulk inventory allocation"
            />
          </section>
        </div>
      </DataState>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  meta,
  badge,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  meta: string;
  badge?: string;
  tone: string;
}) {
  return (
    <section className={`kpi-card ${tone}`}>
      <div className="kpi-card-top">
        <div className="kpi-label-row">
          <div className="kpi-icon">
            <Icon size={18} />
          </div>
          <span className="kpi-title">{label}</span>
        </div>
        {badge && <span className="kpi-card-meta-badge">{badge}</span>}
      </div>
      <div className="kpi-value-block">
        <strong className="kpi-main-number mono">{value.toLocaleString()}</strong>
        <span className="kpi-sub-label">{meta}</span>
      </div>
    </section>
  );
}

function HealthRow({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const percent = Math.min(100, Math.round((value / total) * 100));
  const statusTier = percent >= 75 ? "optimal" : percent >= 40 ? "good" : "warning";
  const statusLabel = percent >= 75 ? "Optimal" : percent >= 40 ? "Normal" : "Review";

  return (
    <div className="health-row">
      <div className="health-row-header">
        <span>{label}</span>
        <span className={`health-status-chip ${statusTier}`}>{statusLabel}</span>
      </div>
      <div className="progress">
        <span
          className={`bar-${statusTier}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="health-row-footer">
        <span>{value} of {total} configured</span>
        <strong>{percent}%</strong>
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
  text,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <Link to={to} className="quick-link">
      <span>
        <Icon size={18} />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
      <ChevronRight size={17} className="quick-arrow" />
    </Link>
  );
}

function CustomersPage({
  notify,
}: {
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const resource = useResource(() => api.get<Customer[]>("/customers"), []);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("ALL");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null | undefined>(
    undefined,
  );
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteCustomer = async () => {
    if (!deletingCustomer) return;
    setIsDeleting(true);
    try {
      await api.delete(`/customers/${deletingCustomer.id}`);
      notify(`Customer "${deletingCustomer.name}" deleted successfully`, "success");
      setDeletingCustomer(null);
      void resource.reload();
    } catch (error: any) {
      notify(error.message || "Failed to delete customer", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const customers = useMemo(
    () =>
      (resource.data || []).filter((item) => {
        const matchesQuery = `${item.name} ${item.accountCode}`
          .toLowerCase()
          .includes(deferredQuery.toLowerCase());
        return (
          matchesQuery &&
          (status === "ALL" || item.isActive === (status === "ACTIVE"))
        );
      }),
    [resource.data, deferredQuery, status],
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Management"
        title="Customers"
        description="Tenant-owned routing defaults, endpoints, assigned DIDs, and route overrides."
        actions={
          <button
            className="button primary"
            onClick={() => setOnboardingOpen(true)}
            id="onboard-customer-btn"
          >
            <Sparkles size={16} /> Onboard Customer
          </button>
        }
      />
      <section className="panel table-panel">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search name or account code"
          status={status}
          onStatus={setStatus}
        />
        <DataState
          loading={resource.loading}
          error={resource.error}
          empty={!customers.length}
          onRetry={resource.reload}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Credit / balance</th>
                  <th>Channels</th>
                  <th>DIDs</th>
                  <th>Routes</th>
                  <th>Status</th>
                  <th>Last call</th>
                  <th>ASR</th>
                  <th>ACD</th>
                  <th>CPS</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <Link
                        className="entity-cell"
                        to={`/management/customers/${customer.id}/main`}
                      >
                        <span className="customer-monogram">
                          {customer.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <strong>{customer.name}</strong>
                          <small>{customer.accountCode}</small>
                        </span>
                      </Link>
                    </td>
                    <td className="mono">
                      {money(customer.creditBalance, customer.currency)}
                    </td>
                    <td>
                      {customer.settings?.defaultChannelLimit ?? "Unlimited"}
                    </td>
                    <td>{customer._count?.numbers || 0}</td>
                    <td>{customer._count?.routes || 0}</td>
                    <td>
                      <StatusBadge active={customer.isActive} />
                    </td>
                    <td className="muted">—</td>
                    <td className="muted">—</td>
                    <td className="muted">—</td>
                    <td className="muted">—</td>
                    <td>
                      <div className="table-actions" style={{ display: "flex", gap: "6px" }}>
                        <button
                          className="icon-button"
                          onClick={() => setEditing(customer)}
                          aria-label={`Edit ${customer.name}`}
                          title="Edit Customer"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => setDeletingCustomer(customer)}
                          aria-label={`Delete ${customer.name}`}
                          title="Delete Customer"
                          style={{ color: "var(--danger, #ef4444)" }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>
      {onboardingOpen && (
        <CustomerOnboardingWizard
          onClose={() => setOnboardingOpen(false)}
          onSuccess={() => {
            void resource.reload();
          }}
          notify={notify}
        />
      )}
      {editing !== undefined && (
        <CustomerModal
          customer={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            notify(editing ? "Customer updated" : "Customer created");
            void resource.reload();
          }}
          notify={notify}
        />
      )}
      {deletingCustomer && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div>
                <h3>Delete Customer</h3>
                <p className="modal-subtitle">
                  Are you sure you want to delete <strong>{deletingCustomer.name}</strong> ({deletingCustomer.accountCode})?
                </p>
              </div>
            </div>
            <div className="modal-body">
              <div className="callout warning" style={{ fontSize: "0.85rem", lineHeight: 1.45, display: "flex", alignItems: "center", gap: "10px" }}>
                <AlertTriangle size={18} style={{ flexShrink: 0, color: "#fde047" }} />
                <span>
                  Are you sure you want to delete this customer? This action is permanent and cannot be undone.
                </span>
              </div>
            </div>
            <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
              <button
                className="button secondary"
                onClick={() => setDeletingCustomer(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="button danger"
                onClick={handleDeleteCustomer}
                disabled={isDeleting}
                style={{ background: "#dc2626", color: "#fff" }}
              >
                {isDeleting ? "Deleting..." : "Delete Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toolbar({
  query,
  onQuery,
  placeholder,
  status,
  onStatus,
  extra,
}: {
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  status?: string;
  onStatus?: (value: string) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="toolbar">
      <label className="search-box">
        <Search size={17} />
        <span className="sr-only">Search</span>
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={placeholder}
        />
      </label>
      {onStatus && (
        <label className="select-box">
          <ListFilter size={16} />
          <span className="sr-only">Status</span>
          <select
            value={status}
            onChange={(event) => onStatus(event.target.value)}
          >
            <option value="ALL">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      )}
      {extra}
      <span className="toolbar-spacer" />
    </div>
  );
}

function CustomerModal({
  customer,
  onClose,
  onSaved,
  notify,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    adminEmail: "",
    adminPassword: "",
    contactName: "",
    name: customer?.name || "",
    accountCode: customer?.accountCode || "",
    creditBalance: String(customer?.creditBalance || 0),
    currency: customer?.currency || "USD",
    defaultChannelLimit: String(customer?.settings?.defaultChannelLimit || ""),
    extensionLimit: String(customer?.extensionLimit ?? 10),
    defaultCallerIdMode:
      customer?.settings?.defaultCallerIdMode || "PASSTHROUGH",
    isActive: customer?.isActive ?? true,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        accountCode: form.accountCode.trim().toUpperCase(),
        creditBalance: Number(form.creditBalance || 0),
        currency: form.currency.toUpperCase(),
        isActive: form.isActive,
        extensionLimit: Number(form.extensionLimit),
      };
      if (customer) {
        await api.patch(`/customers/${customer.id}`, payload);
        if (form.defaultChannelLimit)
          await api.patch(
            "/customers/current/settings",
            {
              defaultChannelLimit: Number(form.defaultChannelLimit),
              defaultCallerIdMode: form.defaultCallerIdMode,
            },
            customer.id,
          );
      } else {
        await api.post("/customers", {
          ...payload,
          adminEmail: form.adminEmail.trim(),
          adminPassword: form.adminPassword,
          contactName: form.contactName.trim() || undefined,
          defaultChannelLimit: form.defaultChannelLimit
            ? Number(form.defaultChannelLimit)
            : undefined,
          defaultCallerIdMode: form.defaultCallerIdMode,
        });
      }
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to save customer",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={customer ? "Edit customer" : "Add customer"}
      description={customer ? "Update tenant routing and capacity settings." : "Create the tenant and its primary customer login together."}
      onClose={onClose}
    >
      <form onSubmit={submit} className="form-grid">
        {!customer && <>
          <Field label="Administrator email" hint="Used to sign in to this customer workspace">
            <input required type="email" autoComplete="off" maxLength={254} value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
          </Field>
          <Field label="Temporary password" hint="At least 6 characters">
            <input required type="password" autoComplete="new-password" minLength={6} maxLength={128} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} />
          </Field>
          <Field label="Contact name">
            <input maxLength={150} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </Field>
        </>}
        <Field label="Customer name">
          <input
            required
            maxLength={150}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Account code" hint="Unique routing reference">
          <input
            required
            maxLength={40}
            value={form.accountCode}
            onChange={(e) => setForm({ ...form, accountCode: e.target.value })}
          />
        </Field>
        <Field label="Opening credit">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.creditBalance}
            onChange={(e) =>
              setForm({ ...form, creditBalance: e.target.value })
            }
          />
        </Field>
        <Field label="Currency">
          <input
            required
            pattern="[A-Z]{3}"
            maxLength={3}
            value={form.currency}
            onChange={(e) =>
              setForm({ ...form, currency: e.target.value.toUpperCase() })
            }
          />
        </Field>
        <Field label="Default channels">
          <input
            type="number"
            min="1"
            placeholder="Unlimited"
            value={form.defaultChannelLimit}
            onChange={(e) =>
              setForm({ ...form, defaultChannelLimit: e.target.value })
            }
          />
        </Field>
        <Field label="Extension limit" hint="Maximum SIP users">
          <input
            required
            type="number"
            min="0"
            value={form.extensionLimit}
            onChange={(e) =>
              setForm({ ...form, extensionLimit: e.target.value })
            }
          />
        </Field>
        <Field label="Caller ID mode">
          <select
            value={form.defaultCallerIdMode}
            onChange={(e) =>
              setForm({ ...form, defaultCallerIdMode: e.target.value })
            }
          >
            <option>PASSTHROUGH</option>
            <option>OVERRIDE</option>
            <option>STRIP_ADD</option>
            <option>CALLED_NUMBER</option>
            <option>ANONYMOUS</option>
          </select>
        </Field>
        <Toggle
          label="Customer is active"
          checked={form.isActive}
          onChange={(value) => setForm({ ...form, isActive: value })}
        />
        <FormActions
          onClose={onClose}
          saving={saving}
          label={customer ? "Save customer" : "Create customer"}
        />
      </form>
    </Modal>
  );
}

const customerSections = [
  "Main",
  "Wallet",
  "Auth",
  "Support Members",
  "Normalization",
  "Outbound Routing",
  "Route Test",
  "DID",
  "Stats",
  "CDR",
  "Alias",
  "Payment",
  "Route Stats",
  "Custom Reports",
  "Latest Calls",
  "Live Calls",
  "Alert",
  "Packages",
  "Transcription",
];
function CustomerDetail({
  notify,
}: {
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const { customerId = "", section = "main" } = useParams();
  const resource = useResource(
    () => api.get<Customer>(`/customers/${customerId}`),
    [customerId],
  );
  const customer = resource.data;
  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/management/customers">Customers</Link>
        <ChevronRight size={14} />
        <span>{customer?.name || "Customer"}</span>
      </div>
      <PageHeader
        title={customer?.name || "Customer details"}
        description={
          customer
            ? `${customer.accountCode} · routing tenant`
            : "Loading customer configuration"
        }
        actions={customer && <StatusBadge active={customer.isActive} />}
      />
      <DataState
        loading={resource.loading}
        error={resource.error}
        onRetry={resource.reload}
      >
        {customer && (
          <div className="detail-layout">
            <aside className="detail-nav" aria-label="Customer sections">
              {customerSections.map((item) => (
                <NavLink
                  key={item}
                  to={`/management/customers/${customerId}/${item.toLowerCase().replaceAll(" ", "-")}`}
                  className={({ isActive }) => (isActive ? "active" : "")}
                >
                  {item}
                  <ChevronRight size={15} />
                </NavLink>
              ))}
            </aside>
            <div className="detail-content">
              {section === "main" && (
                <CustomerMain
                  customer={customer}
                  notify={notify}
                  reload={resource.reload}
                />
              )}
              {section === "wallet" && (
                <CustomerWalletSection customer={customer} notify={notify} />
              )}
              {section === "auth" && (
                <CustomerAuth customerId={customerId} notify={notify} />
              )}
              {section === "support-members" && (
                <SupportMembersPanel customerId={customerId} notify={notify} />
              )}
              {section === "normalization" && (
                <CustomerNormalization
                  customer={customer}
                  notify={notify}
                  reloadCustomer={resource.reload}
                />
              )}
              {section === "outbound-routing" && (
                <CustomerRouting customerId={customerId} notify={notify} />
              )}
              {section === "route-test" && (
                <RouteTestConsole customerId={customerId} notify={notify} />
              )}
              {section === "did" && (
                <CustomerDid customerId={customerId} customerRecordingEnabled={customer.settings?.recordingEnabled ?? false} notify={notify} />
              )}
              {section === "stats" && <CustomerStats customer={customer} />}
              {section === "cdr" && <CustomerCdr customer={customer} />}
              {section === "latest-calls" && (
                <CustomerLatestCalls customer={customer} />
              )}
              {section === "live-calls" && (
                <LiveCallsPage customer={customer} notify={notify} />
              )}
              {![
                "main",
                "wallet",
                "auth",
                "support-members",
                "normalization",
                "outbound-routing",
                "route-test",
                "did",
                "stats",
                "cdr",
                "latest-calls",
                "live-calls",
              ].includes(section) && (
                  <SectionPlaceholder name={section.replaceAll("-", " ")} />
                )}
            </div>
          </div>
        )}
      </DataState>
    </div>
  );
}

function SupportDashboardPage() {
  const { user } = useAuth();
  const customers = user?.supportCustomers ?? [];
  return <div className="page">
    <PageHeader title="Assigned Customers" description="Operational access is limited to customers assigned by Super Admin." />
    <section className="panel table-panel">
      <div className="panel-heading"><div><p className="eyebrow">Support workspace</p><h2>Customer accounts</h2><p>{customers.length} active assignment{customers.length === 1 ? '' : 's'}</p></div></div>
      {customers.length ? <div className="table-scroll"><table><thead><tr><th>Customer</th><th>Account code</th><th>Status</th><th>Workspace</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td className="mono">{customer.accountCode}</td><td><span className="status-badge active"><span />Active</span></td><td><Link className="button secondary compact" to={`/support/customers/${customer.id}/numbers`}>Open workspace <ChevronRight size={14} /></Link></td></tr>)}</tbody></table></div> : <div className="empty-state"><UsersRound size={30} /><h3>No customers assigned</h3><p>Ask a Super Admin to assign you after a customer requests support through the separate support channel.</p></div>}
    </section>
  </div>;
}

function SupportWorkspacePage({ notify }: { notify: (message: string, type?: Toast["type"]) => void }) {
  const { customerId = '', section = 'numbers' } = useParams();
  const { user } = useAuth();
  const sections = ['numbers', 'extensions', 'normalization', 'cdr', 'live-calls', 'account'] as const;
  if (!user?.supportCustomers?.some((customer) => customer.id === customerId))
    return <div className="page"><div className="empty-state"><ShieldCheck size={30} /><h3>Customer not assigned</h3><p>You do not have an active assignment for this customer.</p><Link className="button secondary" to="/support">Back to assigned customers</Link></div></div>;
  if (!sections.includes(section as typeof sections[number])) return <Navigate to={`/support/customers/${customerId}/numbers`} replace />;
  return <CustomerPortalPage section={section as typeof sections[number]} selectedCustomerId={customerId} notify={notify} />;
}

function CustomerPortalPage({
  section,
  notify,
  selectedCustomerId,
}: {
  section: "numbers" | "extensions" | "normalization" | "cdr" | "live-calls" | "account";
  notify: (message: string, type?: Toast["type"]) => void;
  selectedCustomerId?: string;
}) {
  const resource = useResource(() => api.get<Customer>("/customers/me", selectedCustomerId), [selectedCustomerId]);
  const customer = resource.data;
  const titles: Record<typeof section, string> = {
    numbers: "DIDs & Numbers",
    extensions: "IP Authentication",
    normalization: "Normalization",
    cdr: "Call Records",
    "live-calls": "Live Calls",
    account: "Account Settings",
  };
  return (
    <div className="page">
      {selectedCustomerId && <div className="breadcrumb"><Link to="/support">Assigned Customers</Link><ChevronRight size={14} /><span>{customer?.name || "Customer"}</span></div>}
      <PageHeader title={titles[section]} description={customer ? `${customer.name} · ${customer.accountCode}` : "Loading customer workspace"} />
      {selectedCustomerId && <nav className="support-workspace-nav" aria-label="Customer operations">{([['numbers', 'DIDs & Numbers'], ['extensions', 'IP Authentication'], ['normalization', 'Normalization'], ['cdr', 'Call Records'], ['live-calls', 'Live Calls'], ['account', 'Account Settings']] as const).map(([key, label]) => <NavLink key={key} to={`/support/customers/${selectedCustomerId}/${key}`} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}</nav>}
      <DataState loading={resource.loading} error={resource.error} onRetry={resource.reload}>
        {customer && <>
          {section === "numbers" && <CustomerDid customerId={customer.id} customerRecordingEnabled={customer.settings?.recordingEnabled ?? false} notify={notify} />}
          {section === "extensions" && <CustomerAuth customerId={customer.id} notify={notify} />}
          {section === "normalization" && <CustomerNormalization customer={customer} notify={notify} reloadCustomer={resource.reload} />}
          {section === "cdr" && <CustomerCdr customer={customer} />}
          {section === "live-calls" && <LiveCallsPage customer={customer} notify={notify} />}
          {section === "account" && <><CustomerMain customer={customer} notify={notify} reload={resource.reload} />{!selectedCustomerId && <AccountSecurityPanel />}</>}
        </>}
      </DataState>
    </div>
  );
}

function CustomerMain({
  customer,
  notify,
  reload,
}: {
  customer: Customer;
  notify: (message: string, type?: Toast["type"]) => void;
  reload: () => Promise<void>;
}) {
  const [settings, setSettings] = useState({
    recordingEnabled: customer.settings?.recordingEnabled ?? false,
    defaultChannelLimit: String(customer.settings?.defaultChannelLimit || ""),
    defaultCallerIdMode:
      customer.settings?.defaultCallerIdMode || "PASSTHROUGH",
  });
  const [saving, setSaving] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(
        "/customers/current/settings",
        {
          defaultChannelLimit: settings.defaultChannelLimit
            ? Number(settings.defaultChannelLimit)
            : null,
          defaultCallerIdMode: settings.defaultCallerIdMode,
          recordingEnabled: settings.recordingEnabled,
        },
        customer.id,
      );
      notify("Customer routing defaults saved");
      await reload();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to save settings",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <CustomerWalletWidget
        customer={customer}
        notify={notify}
        onReload={reload}
      />
      <div className="summary-grid">
        <SummaryCard
          icon={WalletCards}
          label="Credit balance"
          value={money(customer.creditBalance, customer.currency)}
        />
        <SummaryCard
          icon={Cable}
          label="Channel limit"
          value={String(customer.settings?.defaultChannelLimit || "Unlimited")}
        />
        <SummaryCard
          icon={Headphones}
          label="Call recording"
          value={settings.recordingEnabled ? "Enabled" : "Disabled"}
        />
        <SummaryCard
          icon={RouteIcon}
          label="Route priority"
          value="Overrides → defaults"
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Fallback behavior</span>
            <h2>Customer routing defaults</h2>
          </div>
        </div>
        <form onSubmit={save} className="form-grid settings-form">
          <Field label="Default channel limit" hint="Leave empty for unlimited">
            <input
              type="number"
              min="1"
              value={settings.defaultChannelLimit}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultChannelLimit: e.target.value,
                })
              }
            />
          </Field>
          <Field label="Caller ID mode">
            <select
              value={settings.defaultCallerIdMode}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultCallerIdMode: e.target.value,
                })
              }
            >
              <option>PASSTHROUGH</option>
              <option>OVERRIDE</option>
              <option>STRIP_ADD</option>
              <option>CALLED_NUMBER</option>
              <option>ANONYMOUS</option>
            </select>
          </Field>
          <Toggle
            label="Record answered calls"
            checked={settings.recordingEnabled}
            onChange={(value) =>
              setSettings({ ...settings, recordingEnabled: value })
            }
          />
          <div className="inheritance-note">
            <Boxes size={19} />
            <div>
              <strong>Resolution order</strong>
              <span>
                Route override → number settings → customer defaults. Carrier
                normalization is applied before inbound DID lookup.
              </span>
            </div>
          </div>
          <div className="form-actions full">
            <button className="button primary" disabled={saving}>
              {saving && <LoaderCircle className="spin" size={16} />} Save
              defaults
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="summary-card">
      <Icon size={19} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const normalizationOperations: Array<{
  value: NormalizationOperation;
  label: string;
  description: string;
  input: "none" | "value" | "regex";
}> = [
    {
      value: "TRIM",
      label: "Trim whitespace",
      description: "Remove surrounding spaces.",
      input: "none",
    },
    {
      value: "DIGITS_ONLY",
      label: "Digits only",
      description: "Remove every non-numeric character.",
      input: "none",
    },
    {
      value: "STRIP_PLUS",
      label: "Strip +",
      description: "Remove a leading plus sign.",
      input: "none",
    },
    {
      value: "ENSURE_PLUS",
      label: "Ensure +",
      description: "Add a plus sign when missing.",
      input: "none",
    },
    {
      value: "STRIP_PREFIX",
      label: "Strip custom prefix",
      description: "Remove the configured leading prefix.",
      input: "value",
    },
    {
      value: "ADD_PREFIX",
      label: "Add custom prefix",
      description: "Add a prefix before the number.",
      input: "value",
    },
    {
      value: "STRIP_LEADING_ONE",
      label: "Strip leading 1",
      description: "Remove one leading country digit.",
      input: "none",
    },
    {
      value: "ENSURE_LEADING_ONE",
      label: "Ensure leading 1",
      description: "Add a leading 1 when missing.",
      input: "none",
    },
    {
      value: "REGEX_REPLACE",
      label: "Regex replace",
      description: "Apply an advanced regular-expression replacement.",
      input: "regex",
    },
  ];

function useNormalizationProfiles(customerId?: string, carrierId?: string) {
  const query = carrierId ? `?carrierId=${encodeURIComponent(carrierId)}` : "";
  return useResource(
    () =>
      api.get<NormalizationProfile[]>(
        `/normalization-profiles${query}`,
        customerId,
      ),
    [customerId, carrierId],
  );
}

function ProfileOptions({
  profiles,
  ownerType,
}: {
  profiles: NormalizationProfile[];
  ownerType?: NormalizationProfile["ownerType"];
}) {
  const active = profiles.filter(
    (profile) =>
      profile.isActive &&
      (!ownerType ||
        profile.ownerType === "GLOBAL" ||
        profile.ownerType === ownerType),
  );
  return (
    <>
      {active.map((profile) => (
        <option value={profile.id} key={profile.id}>
          {profile.ownerType === "GLOBAL" ? "Global · " : ""}
          {profile.name}
        </option>
      ))}
    </>
  );
}

function CustomerNormalization({
  customer,
  notify,
  reloadCustomer,
}: {
  customer: Customer;
  notify: (message: string, type?: Toast["type"]) => void;
  reloadCustomer: () => Promise<void>;
}) {
  const profiles = useNormalizationProfiles(customer.id);
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState({
    ingress: customer.settings?.defaultIngressProfileId || "",
    egress: customer.settings?.defaultEgressProfileId || "",
  });
  const saveDefaults = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(
        "/customers/current/settings",
        {
          defaultIngressProfileId: defaults.ingress || null,
          defaultEgressProfileId: defaults.egress || null,
        },
        customer.id,
      );
      notify("Customer normalization defaults saved");
      await reloadCustomer();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to save normalization defaults",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Tenant fallback</span>
            <h2>Default normalization</h2>
            <p>
              Outbound customer ingress uses the ingress default; calls sent to
              customer gateways use the egress default.
            </p>
          </div>
        </div>
        <form className="form-grid settings-form" onSubmit={saveDefaults}>
          <Field
            label="Default ingress profile"
            hint="Applied after customer source identification"
          >
            <select
              value={defaults.ingress}
              onChange={(e) =>
                setDefaults({ ...defaults, ingress: e.target.value })
              }
            >
              <option value="">No normalization</option>
              <ProfileOptions
                profiles={profiles.data || []}
                ownerType="CUSTOMER"
              />
            </select>
          </Field>
          <Field
            label="Default egress profile"
            hint="Applied before sending calls to the customer"
          >
            <select
              value={defaults.egress}
              onChange={(e) =>
                setDefaults({ ...defaults, egress: e.target.value })
              }
            >
              <option value="">No normalization</option>
              <ProfileOptions
                profiles={profiles.data || []}
                ownerType="CUSTOMER"
              />
            </select>
          </Field>
          <div className="form-actions full">
            <button
              className="button primary"
              disabled={saving || profiles.loading}
            >
              {saving && <LoaderCircle className="spin" size={16} />} Save
              defaults
            </button>
          </div>
        </form>
      </section>
      <NormalizationProfilesPanel
        ownerType="CUSTOMER"
        customerId={customer.id}
        profiles={profiles.data || []}
        loading={profiles.loading}
        error={profiles.error}
        reload={profiles.reload}
        notify={notify}
      />
    </div>
  );
}

function GlobalNormalization({
  notify,
}: {
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const profiles = useNormalizationProfiles();
  return (
    <div className="page">
      <PageHeader
        eyebrow="Global transformation library"
        title="Normalization profiles"
        description="Reusable global rules available to both customer and carrier configuration. Owner-specific profiles remain isolated."
      />
      <NormalizationProfilesPanel
        ownerType="GLOBAL"
        profiles={profiles.data || []}
        loading={profiles.loading}
        error={profiles.error}
        reload={profiles.reload}
        notify={notify}
      />
    </div>
  );
}

function NormalizationProfilesPanel({
  ownerType,
  customerId,
  carrierId,
  profiles,
  loading,
  error,
  reload,
  notify,
}: {
  ownerType: NormalizationProfile["ownerType"];
  customerId?: string;
  carrierId?: string;
  profiles: NormalizationProfile[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const [editing, setEditing] = useState<
    NormalizationProfile | null | undefined
  >(undefined);
  const owned = profiles.filter(
    (profile) =>
      profile.ownerType === ownerType &&
      (ownerType !== "CUSTOMER" || profile.customerId === customerId) &&
      (ownerType !== "CARRIER" || profile.carrierId === carrierId),
  );
  const toggle = async (profile: NormalizationProfile) => {
    try {
      await api.patch(
        `/normalization-profiles/${profile.id}`,
        { isActive: !profile.isActive },
        ownerType === "CUSTOMER" ? customerId : undefined,
      );
      notify(`Profile ${profile.isActive ? "disabled" : "enabled"}`);
      await reload();
    } catch (errorValue) {
      notify(
        errorValue instanceof Error
          ? errorValue.message
          : "Unable to update profile",
        "error",
      );
    }
  };
  return (
    <section className="panel table-panel">
      <div className="panel-heading padded">
        <div>
          <span className="eyebrow">{ownerType.toLowerCase()} rules</span>
          <h2>Normalization profiles</h2>
          <p>
            Steps execute from top to bottom. Use endpoint, DID, or route
            selectors to override the default.
          </p>
        </div>
        <button className="button primary" onClick={() => setEditing(null)}>
          <Plus size={16} /> New profile
        </button>
      </div>
      <DataState
        loading={loading}
        error={error}
        empty={!owned.length}
        onRetry={reload}
      >
        <div className="profile-card-list">
          {owned.map((profile) => (
            <article className="profile-card" key={profile.id}>
              <div className="profile-card-head">
                <div>
                  <strong>{profile.name}</strong>
                  <small>{profile.description || "No description"}</small>
                </div>
                <StatusBadge active={profile.isActive} />
              </div>
              <div
                className="rule-sequence"
                aria-label={`${profile.name} steps`}
              >
                {profile.steps.map((step, index) => (
                  <span key={`${step.operation}-${index}`}>
                    <b>{index + 1}</b>
                    {normalizationOperations.find(
                      (operation) => operation.value === step.operation,
                    )?.label || step.operation}
                    {step.value && <code>{step.value}</code>}
                  </span>
                ))}
                {!profile.steps.length && (
                  <em>Identity — number remains unchanged</em>
                )}
              </div>
              <div className="profile-card-actions">
                <button
                  className="button ghost compact"
                  onClick={() => setEditing(profile)}
                >
                  <Pencil size={15} /> Edit rules
                </button>
                <button
                  className="button ghost compact"
                  onClick={() => void toggle(profile)}
                >
                  {profile.isActive ? "Disable" : "Enable"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </DataState>
      {editing !== undefined && (
        <NormalizationProfileModal
          profile={editing}
          ownerType={ownerType}
          customerId={customerId}
          carrierId={carrierId}
          onClose={() => setEditing(undefined)}
          notify={notify}
          onSaved={() => {
            setEditing(undefined);
            void reload();
          }}
        />
      )}
    </section>
  );
}

function NormalizationProfileModal({
  profile,
  ownerType,
  customerId,
  carrierId,
  onClose,
  onSaved,
  notify,
}: {
  profile: NormalizationProfile | null;
  ownerType: NormalizationProfile["ownerType"];
  customerId?: string;
  carrierId?: string;
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [previewInput, setPreviewInput] = useState("+1 (800) 555-1234");
  const [form, setForm] = useState<{
    name: string;
    description: string;
    isActive: boolean;
    steps: NormalizationStep[];
  }>({
    name: profile?.name || "",
    description: profile?.description || "",
    isActive: profile?.isActive ?? true,
    steps: profile?.steps?.length
      ? profile.steps.map((step) => ({ ...step }))
      : [{ operation: "TRIM" }],
  });
  const updateStep = (index: number, update: Partial<NormalizationStep>) =>
    setForm((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...update } : step,
      ),
    }));
  const moveStep = (index: number, direction: -1 | 1) =>
    setForm((current) => {
      const next = [...current.steps];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, steps: next };
    });
  const removeStep = (index: number) =>
    setForm((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
    }));
  const preview = applyNormalizationPreview(previewInput, form.steps);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        steps: form.steps.map((step) => {
          const config = normalizationOperations.find(
            (operation) => operation.value === step.operation,
          );
          if (config?.input === "value")
            return { operation: step.operation, value: step.value || "" };
          if (config?.input === "regex")
            return {
              operation: step.operation,
              pattern: step.pattern || "",
              replacement: step.replacement || "",
            };
          return { operation: step.operation };
        }),
        isActive: form.isActive,
      };
      if (profile)
        await api.patch(
          `/normalization-profiles/${profile.id}`,
          payload,
          ownerType === "CUSTOMER" ? customerId : undefined,
        );
      else
        await api.post(
          "/normalization-profiles",
          {
            ...payload,
            ownerType,
            ...(ownerType === "CARRIER" ? { carrierId } : {}),
          },
          ownerType === "CUSTOMER" ? customerId : undefined,
        );
      notify(
        profile
          ? "Normalization profile updated"
          : "Normalization profile created",
      );
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to save normalization profile",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={
        profile ? "Edit normalization profile" : "Create normalization profile"
      }
      description="Rules are deterministic and execute in the displayed order. Up to 20 steps are supported."
      onClose={onClose}
      wide
    >
      <form className="profile-editor" onSubmit={submit}>
        <div className="form-grid">
          <Field label="Profile name">
            <input
              required
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <input
              maxLength={500}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </Field>
        </div>
        <div className="editor-section-heading">
          <div>
            <span className="eyebrow">Execution pipeline</span>
            <h3>Ordered rules</h3>
          </div>
          <button
            type="button"
            className="button secondary compact"
            disabled={form.steps.length >= 20}
            onClick={() =>
              setForm({
                ...form,
                steps: [
                  ...form.steps,
                  { operation: "STRIP_PREFIX", value: "" },
                ],
              })
            }
          >
            <Plus size={15} /> Add step
          </button>
        </div>
        <div className="rule-editor-list">
          {form.steps.map((step, index) => {
            const operation = normalizationOperations.find(
              (item) => item.value === step.operation,
            )!;
            return (
              <div className="rule-editor-row" key={index}>
                <GripVertical size={17} aria-hidden="true" />
                <span className="rule-order">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="rule-editor-fields">
                  <label>
                    <span>Operation</span>
                    <select
                      value={step.operation}
                      onChange={(e) =>
                        updateStep(index, {
                          operation: e.target.value as NormalizationOperation,
                          value: undefined,
                          pattern: undefined,
                          replacement: undefined,
                        })
                      }
                    >
                      {normalizationOperations.map((item) => (
                        <option value={item.value} key={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {operation.input === "value" && (
                    <label>
                      <span>Prefix value</span>
                      <input
                        required
                        value={step.value || ""}
                        onChange={(e) =>
                          updateStep(index, { value: e.target.value })
                        }
                        placeholder="+1"
                      />
                    </label>
                  )}
                  {operation.input === "regex" && (
                    <>
                      <label>
                        <span>Pattern</span>
                        <input
                          required
                          value={step.pattern || ""}
                          onChange={(e) =>
                            updateStep(index, { pattern: e.target.value })
                          }
                          placeholder="^00"
                        />
                      </label>
                      <label>
                        <span>Replacement</span>
                        <input
                          value={step.replacement || ""}
                          onChange={(e) =>
                            updateStep(index, { replacement: e.target.value })
                          }
                          placeholder="+"
                        />
                      </label>
                    </>
                  )}
                  <small>{operation.description}</small>
                </div>
                <div className="rule-row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                    aria-label={`Move step ${index + 1} up`}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={index === form.steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                    aria-label={`Move step ${index + 1} down`}
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => removeStep(index)}
                    aria-label={`Remove step ${index + 1}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
          {!form.steps.length && (
            <div className="inline-empty">
              No steps means identity normalization.
            </div>
          )}
        </div>
        <div className="normalization-preview">
          <div>
            <label>
              <span>Preview input</span>
              <input
                value={previewInput}
                onChange={(e) => setPreviewInput(e.target.value)}
              />
            </label>
            <ArrowRight size={17} />
            <div>
              <span>Result</span>
              <strong className="mono">{preview.error || preview.value}</strong>
            </div>
          </div>
          <small>
            The runtime API remains the authoritative test because JavaScript
            and backend regex behavior can differ in edge cases.
          </small>
        </div>
        <Toggle
          label="Profile is active"
          checked={form.isActive}
          onChange={(value) => setForm({ ...form, isActive: value })}
        />
        <FormActions
          onClose={onClose}
          saving={saving}
          label={profile ? "Save profile" : "Create profile"}
        />
      </form>
    </Modal>
  );
}

function applyNormalizationPreview(raw: string, steps: NormalizationStep[]) {
  let value = raw;
  try {
    for (const step of steps) {
      if (step.operation === "TRIM") value = value.trim();
      else if (step.operation === "DIGITS_ONLY")
        value = value.replace(/\D/g, "");
      else if (step.operation === "STRIP_PLUS")
        value = value.startsWith("+") ? value.slice(1) : value;
      else if (step.operation === "ENSURE_PLUS")
        value = value.startsWith("+") ? value : `+${value}`;
      else if (
        step.operation === "STRIP_PREFIX" &&
        step.value &&
        value.startsWith(step.value)
      )
        value = value.slice(step.value.length);
      else if (step.operation === "ADD_PREFIX" && step.value)
        value = `${step.value}${value}`;
      else if (step.operation === "STRIP_LEADING_ONE" && value.startsWith("1"))
        value = value.slice(1);
      else if (
        step.operation === "ENSURE_LEADING_ONE" &&
        !value.startsWith("1")
      )
        value = `1${value}`;
      else if (step.operation === "REGEX_REPLACE" && step.pattern !== undefined)
        value = value.replace(
          new RegExp(step.pattern, "g"),
          step.replacement || "",
        );
    }
    return { value };
  } catch {
    return { value, error: "Invalid regular expression" };
  }
}

function CustomerAuth({
  customerId,
  notify,
}: {
  customerId: string;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const endpoints = useResource(
    () => api.get<Endpoint[]>("/customer-endpoints", customerId),
    [customerId],
  );
  const auth = useResource(
    () => api.get<SourceAuth[]>("/source-ip-auth", customerId),
    [customerId],
  );
  const profiles = useNormalizationProfiles(customerId);
  const [open, setOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [saving, setSaving] = useState(false);
  const emptyForm = {
    name: "",
    ipAddress: "",
    port: "5060",
    direction: "BOTH",
    transport: "UDP",
    channelLimit: "",
    ingressNormalizationProfileId: "",
    egressNormalizationProfileId: "",
    isActive: true,
  };
  const [form, setForm] = useState(emptyForm);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const endpoint = await api.post<Endpoint>(
        "/customer-endpoints",
        {
          name: form.name,
          host: form.ipAddress,
          port: Number(form.port),
          direction: form.direction,
          transport: form.transport,
          authType: "IP",
          channelLimit: form.channelLimit
            ? Number(form.channelLimit)
            : undefined,
          ingressNormalizationProfileId:
            form.ingressNormalizationProfileId || undefined,
          egressNormalizationProfileId:
            form.egressNormalizationProfileId || undefined,
          isActive: form.isActive,
        },
        customerId,
      );
      try {
        await api.post(
          "/source-ip-auth",
          {
            sourceType: "CUSTOMER",
            ipAddress: form.ipAddress,
            port: Number(form.port),
            customerEndpointId: endpoint.id,
            isActive: form.isActive,
          },
          customerId,
        );
      } catch (error) {
        await api.delete(`/customer-endpoints/${endpoint.id}`, customerId);
        throw error;
      }
      notify("Customer IP gateway added");
      setOpen(false);
      setForm(emptyForm);
      await Promise.all([endpoints.reload(), auth.reload()]);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to add gateway",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (entry: SourceAuth) => {
    if (!window.confirm(`Remove source ${entry.ipAddress}?`)) return;
    try {
      if (entry.customerEndpoint?.id)
        await api.delete(
          `/customer-endpoints/${entry.customerEndpoint.id}`,
          customerId,
        );
      else await api.delete(`/source-ip-auth/${entry.id}`, customerId);
      notify("IP gateway removed");
      await Promise.all([auth.reload(), endpoints.reload()]);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to remove gateway",
        "error",
      );
    }
  };
  return (
    <>
      <section className="panel table-panel">
        <div className="panel-heading padded">
          <div>
            <span className="eyebrow">Ingress identity</span>
            <h2>IP authentication & gateways</h2>
            <p>
              Source IP identifies this customer before endpoint ingress
              normalization and outbound carrier selection.
            </p>
          </div>
          <button className="button primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> Add IP
          </button>
        </div>
        <DataState
          loading={auth.loading || endpoints.loading || profiles.loading}
          error={auth.error || endpoints.error || profiles.error}
          empty={!auth.data?.length}
          onRetry={() =>
            void Promise.all([
              auth.reload(),
              endpoints.reload(),
              profiles.reload(),
            ])
          }
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>IP address</th>
                  <th>Direction</th>
                  <th>Ingress profile</th>
                  <th>Egress profile</th>
                  <th>Channels</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(auth.data || []).map((entry) => {
                  const endpoint = endpoints.data?.find(
                    (item) => item.id === entry.customerEndpoint?.id,
                  );
                  return (
                    <tr key={entry.id}>
                      <td>
                        <strong>{endpoint?.name || "Source identity"}</strong>
                        <small className="table-sub mono">
                          {entry.ipAddress}:{entry.port || "*"}
                        </small>
                      </td>
                      <td className="mono">{entry.ipAddress}</td>
                      <td>{endpoint?.direction || "BOTH"}</td>
                      <td>
                        {profileName(
                          profiles.data || [],
                          endpoint?.ingressNormalizationProfileId,
                        )}
                      </td>
                      <td>
                        {profileName(
                          profiles.data || [],
                          endpoint?.egressNormalizationProfileId,
                        )}
                      </td>
                      <td>{endpoint?.channelLimit || "Unlimited"}</td>
                      <td>
                        <StatusBadge active={entry.isActive} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            onClick={() =>
                              endpoint && setEditingEndpoint(endpoint)
                            }
                            aria-label="Edit endpoint normalization"
                          >
                            <SlidersHorizontal size={16} />
                          </button>
                          <button
                            className="icon-button danger"
                            onClick={() => void remove(entry)}
                            aria-label="Remove source IP"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataState>
        {open && (
          <Modal
            title="Add customer IP gateway"
            description="Creates the customer endpoint and source-IP identity. Endpoint profiles override customer defaults."
            onClose={() => setOpen(false)}
          >
            <form className="form-grid" onSubmit={submit}>
              <Field label="Gateway name">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="IP address">
                <input
                  required
                  placeholder="203.0.113.10"
                  value={form.ipAddress}
                  onChange={(e) =>
                    setForm({ ...form, ipAddress: e.target.value })
                  }
                />
              </Field>
              <Field label="Port">
                <input
                  required
                  type="number"
                  min="1"
                  max="65535"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                />
              </Field>
              <Field label="Direction">
                <select
                  value={form.direction}
                  onChange={(e) =>
                    setForm({ ...form, direction: e.target.value })
                  }
                >
                  <option>INBOUND</option>
                  <option>OUTBOUND</option>
                  <option>BOTH</option>
                </select>
              </Field>
              <Field label="Transport">
                <select
                  value={form.transport}
                  onChange={(e) =>
                    setForm({ ...form, transport: e.target.value })
                  }
                >
                  <option>UDP</option>
                  <option>TCP</option>
                  <option>TLS</option>
                </select>
              </Field>
              <Field label="Channel limit">
                <input
                  type="number"
                  min="1"
                  placeholder="Customer default"
                  value={form.channelLimit}
                  onChange={(e) =>
                    setForm({ ...form, channelLimit: e.target.value })
                  }
                />
              </Field>
              <Field label="Ingress normalization">
                <select
                  value={form.ingressNormalizationProfileId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      ingressNormalizationProfileId: e.target.value,
                    })
                  }
                >
                  <option value="">Inherit customer default</option>
                  <ProfileOptions
                    profiles={profiles.data || []}
                    ownerType="CUSTOMER"
                  />
                </select>
              </Field>
              <Field label="Egress normalization">
                <select
                  value={form.egressNormalizationProfileId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      egressNormalizationProfileId: e.target.value,
                    })
                  }
                >
                  <option value="">Inherit customer default</option>
                  <ProfileOptions
                    profiles={profiles.data || []}
                    ownerType="CUSTOMER"
                  />
                </select>
              </Field>
              <Toggle
                label="Gateway is active"
                checked={form.isActive}
                onChange={(value) => setForm({ ...form, isActive: value })}
              />
              <FormActions
                onClose={() => setOpen(false)}
                saving={saving}
                label="Add gateway"
              />
            </form>
          </Modal>
        )}
        {editingEndpoint && (
          <EndpointNormalizationModal
            endpoint={editingEndpoint}
            profiles={profiles.data || []}
            ownerType="CUSTOMER"
            customerId={customerId}
            onClose={() => setEditingEndpoint(null)}
            notify={notify}
            onSaved={() => {
              setEditingEndpoint(null);
              void Promise.all([endpoints.reload(), auth.reload()]);
            }}
          />
        )}
      </section>
      <SipUsersPanel customerId={customerId} notify={notify} />
    </>
  );
}

function SipUsersPanel({
  customerId,
  notify,
}: {
  customerId: string;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const resource = useResource(
    () => api.get<SipUserList>("/sip-users", customerId),
    [customerId],
  );
  const [modal, setModal] = useState<{
    mode: "create" | "edit" | "reset";
    user?: SipUser;
  } | null>(null);
  const remove = async (user: SipUser) => {
    if (!window.confirm(`Delete SIP extension ${user.username}?`)) return;
    try {
      await api.delete(`/sip-users/${user.id}`, customerId);
      notify("SIP extension deleted");
      await resource.reload();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to delete extension",
        "error",
      );
    }
  };
  const data = resource.data;
  const percentage = data?.limit
    ? Math.min(100, (data.used / data.limit) * 100)
    : 0;
  return (
    <section className="panel table-panel sip-users-panel">
      <div className="panel-heading padded">
        <div>
          <span className="eyebrow">Digest credentials</span>
          <h2>SIP User Authentication</h2>
          <p>
            Create extensions that authenticate through Kamailio and inherit
            this customer's outbound routing.
          </p>
        </div>
        <button
          className="button primary"
          disabled={!!data && data.available === 0}
          onClick={() => setModal({ mode: "create" })}
        >
          <Plus size={16} /> Add extension
        </button>
      </div>
      {data && (
        <div className="capacity-summary">
          <div>
            <strong>{data.limit}</strong>
            <span>Limit</span>
          </div>
          <div>
            <strong>{data.used}</strong>
            <span>Used</span>
          </div>
          <div>
            <strong>{data.available}</strong>
            <span>Available</span>
          </div>
          <div className="capacity-track">
            <span style={{ width: `${percentage}%` }} />
          </div>
        </div>
      )}
      <DataState
        loading={resource.loading}
        error={resource.error}
        empty={!data?.users.length}
        onRetry={resource.reload}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Purpose</th>
                <th>Registration</th>
                <th>SIP Profile</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.users || []).map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong className="mono">{user.username}</strong>
                  </td>
                  <td>
                    <span className="type-badge">
                      {user.isMonitor ? "Monitoring" : "Standard"}
                    </span>
                  </td>
                  <td>
                    <StatusBadge
                      active={user.online}
                      label={user.online ? "Online" : "Offline"}
                    />
                  </td>
                  <td>{user.sipProfile}</td>
                  <td>
                    <StatusBadge active={user.isActive} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        onClick={() => setModal({ mode: "reset", user })}
                        aria-label="Reset password"
                      >
                        <KeyRound size={16} />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => setModal({ mode: "edit", user })}
                        aria-label="Edit extension"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        onClick={() => void remove(user)}
                        aria-label="Delete extension"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
      {modal && (
        <SipUserModal
          customerId={customerId}
          state={modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            void resource.reload();
          }}
          notify={notify}
        />
      )}
    </section>
  );
}

function SipUserModal({
  customerId,
  state,
  onClose,
  onSaved,
  notify,
}: {
  customerId: string;
  state: { mode: "create" | "edit" | "reset"; user?: SipUser };
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: state.user?.username || "",
    password: "",
    sipProfile: state.user?.sipProfile || "internal",
    isActive: state.user?.isActive ?? true,
    isMonitor: state.user?.isMonitor ?? false,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (state.mode === "create")
        await api.post("/sip-users", form, customerId);
      else if (state.mode === "reset")
        await api.post(
          `/sip-users/${state.user!.id}/reset-password`,
          { password: form.password },
          customerId,
        );
      else
        await api.patch(
          `/sip-users/${state.user!.id}`,
          {
            sipProfile: form.sipProfile,
            isActive: form.isActive,
            isMonitor: form.isMonitor,
          },
          customerId,
        );
      notify(
        state.mode === "reset"
          ? "SIP password reset"
          : state.mode === "edit"
            ? "SIP extension updated"
            : "SIP extension created",
      );
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to save extension",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  const passwordMode = state.mode !== "edit";
  return (
    <Modal
      title={
        state.mode === "create"
          ? "Add SIP extension"
          : state.mode === "reset"
            ? `Reset ${state.user?.username} password`
            : `Edit ${state.user?.username}`
      }
      description="Credentials are stored as an HA1 digest and synchronized to Kamailio."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        {state.mode === "create" && (
          <Field label="Username">
            <input
              required
              maxLength={64}
              pattern="[A-Za-z0-9_.-]+"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </Field>
        )}
        {passwordMode && (
          <Field label={state.mode === "reset" ? "New password" : "Password"}>
            <input
              required
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        )}
        {state.mode !== "reset" && (
          <>
            <Field label="Extension purpose">
              <select
                value={form.isMonitor ? "monitor" : "standard"}
                onChange={(e) =>
                  setForm({ ...form, isMonitor: e.target.value === "monitor" })
                }
              >
                <option value="standard">Standard Extension</option>
                <option value="monitor">Monitoring Extension</option>
              </select>
            </Field>
            <Toggle
              label="Extension is active"
              checked={form.isActive}
              onChange={(value) => setForm({ ...form, isActive: value })}
            />
          </>
        )}
        <FormActions
          onClose={onClose}
          saving={saving}
          label={state.mode === "reset" ? "Reset password" : "Save extension"}
        />
      </form>
    </Modal>
  );
}

function profileName(profiles: NormalizationProfile[], id?: string | null) {
  return id
    ? profiles.find((profile) => profile.id === id)?.name ||
    "Unavailable profile"
    : "Inherit default";
}

function EndpointNormalizationModal({
  endpoint,
  profiles,
  ownerType,
  customerId,
  carrierId,
  onClose,
  onSaved,
  notify,
}: {
  endpoint: Endpoint;
  profiles: NormalizationProfile[];
  ownerType: "CUSTOMER" | "CARRIER";
  customerId?: string;
  carrierId?: string;
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: endpoint.name,
    host: endpoint.host,
    port: String(endpoint.port),
    direction: endpoint.direction,
    transport: endpoint.transport,
    channelLimit: String(endpoint.channelLimit || ""),
    priority: String(endpoint.priority || 100),
    ingress: endpoint.ingressNormalizationProfileId || "",
    egress: endpoint.egressNormalizationProfileId || "",
    isActive: endpoint.isActive,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        host: form.host,
        port: Number(form.port),
        direction: form.direction,
        transport: form.transport,
        channelLimit: form.channelLimit ? Number(form.channelLimit) : null,
        priority: Number(form.priority),
        ingressNormalizationProfileId: form.ingress || null,
        egressNormalizationProfileId: form.egress || null,
        isActive: form.isActive,
      };
      if (ownerType === "CUSTOMER")
        await api.patch(
          `/customer-endpoints/${endpoint.id}`,
          payload,
          customerId,
        );
      else
        await api.patch(
          `/carriers/${carrierId}/endpoints/${endpoint.id}`,
          payload,
        );
      notify("Endpoint settings updated");
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to update endpoint",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Endpoint routing settings"
      description="Update the endpoint and its linked source-IP identity together. Kamailio is synchronized automatically."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <Field label="Endpoint name">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="IP / host">
          <input
            required
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
          />
        </Field>
        <Field label="Port">
          <input
            required
            type="number"
            min="1"
            max="65535"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value })}
          />
        </Field>
        <Field label="Direction">
          <select
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
          >
            <option>INBOUND</option>
            <option>OUTBOUND</option>
            <option>BOTH</option>
          </select>
        </Field>
        <Field label="Transport">
          <select
            value={form.transport}
            onChange={(e) => setForm({ ...form, transport: e.target.value })}
          >
            <option>UDP</option>
            <option>TCP</option>
            <option>TLS</option>
          </select>
        </Field>
        <Field label="Channel limit">
          <input
            type="number"
            min="1"
            placeholder="Inherit owner default"
            value={form.channelLimit}
            onChange={(e) => setForm({ ...form, channelLimit: e.target.value })}
          />
        </Field>
        <Field label="Priority">
          <input
            required
            type="number"
            min="1"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          />
        </Field>
        <Field label="Ingress profile">
          <select
            value={form.ingress}
            onChange={(e) => setForm({ ...form, ingress: e.target.value })}
          >
            <option value="">Inherit default</option>
            <ProfileOptions profiles={profiles} ownerType={ownerType} />
          </select>
        </Field>
        <Field label="Egress profile">
          <select
            value={form.egress}
            onChange={(e) => setForm({ ...form, egress: e.target.value })}
          >
            <option value="">Inherit default</option>
            <ProfileOptions profiles={profiles} ownerType={ownerType} />
          </select>
        </Field>
        <div className="inheritance-note full">
          <GitBranch size={19} />
          <div>
            <strong>Endpoint override</strong>
            <span>
              Source identity profile → endpoint profile → owner default. Route
              and DID egress settings can override this endpoint value.
            </span>
          </div>
        </div>
        <Toggle
          label="Endpoint is active"
          checked={form.isActive}
          onChange={(value) => setForm({ ...form, isActive: value })}
        />
        <FormActions onClose={onClose} saving={saving} label="Save endpoint" />
      </form>
    </Modal>
  );
}

function CustomerRouting({
  customerId,
  notify,
}: {
  customerId: string;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const customerRes = useResource(
    () => api.get<Customer>(`/customers/${customerId}`),
    [customerId],
  );
  const carriersRes = useResource(() => api.get<Carrier[]>("/carriers"), []);
  const customer = customerRes.data;
  const carriers = (carriersRes.data || []).filter((c) => c.isActive);

  const [saving, setSaving] = useState(false);
  const [selectedCarrierId, setSelectedCarrierId] = useState("");
  const [selectedEndpointId, setSelectedEndpointId] = useState("");
  const [callerIdMode, setCallerIdMode] = useState("PASSTHROUGH");
  const [callerIdNumber, setCallerIdNumber] = useState("");
  const [channelLimit, setChannelLimit] = useState("");

  useEffect(() => {
    if (customer?.settings) {
      setSelectedCarrierId(customer.settings.defaultOutboundCarrierId || "");
      setSelectedEndpointId(
        customer.settings.defaultOutboundCarrierEndpointId || "",
      );
      setCallerIdMode(customer.settings.defaultCallerIdMode || "PASSTHROUGH");
      setCallerIdNumber(customer.settings.defaultCallerIdNumber || "");
      setChannelLimit(
        customer.settings.defaultChannelLimit
          ? String(customer.settings.defaultChannelLimit)
          : "",
      );
    }
  }, [customer]);

  const activeCarrier = carriers.find((c) => c.id === selectedCarrierId);
  const activeEndpoint =
    activeCarrier?.endpoints?.find((e) => e.id === selectedEndpointId) ||
    activeCarrier?.endpoints?.[0];

  const handleSelectCarrierAndEndpoint = async (
    carrierId: string,
    endpointId?: string,
  ) => {
    setSaving(true);
    try {
      const targetCarrier = carriers.find((c) => c.id === carrierId);
      const targetEndpointId =
        endpointId || targetCarrier?.endpoints?.[0]?.id || null;

      await api.patch(
        "/customers/current/settings",
        {
          defaultOutboundCarrierId: carrierId || null,
          defaultOutboundCarrierEndpointId: targetEndpointId,
          defaultCallerIdMode: callerIdMode,
          defaultCallerIdNumber: callerIdNumber || null,
          defaultChannelLimit: channelLimit ? Number(channelLimit) : null,
        },
        customerId,
      );

      setSelectedCarrierId(carrierId);
      setSelectedEndpointId(targetEndpointId || "");
      notify(
        targetCarrier
          ? `Active Outbound Carrier set to ${targetCarrier.name}`
          : "Outbound Carrier cleared",
      );
      await customerRes.reload();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to set outbound carrier",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveForm = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(
        "/customers/current/settings",
        {
          defaultOutboundCarrierId: selectedCarrierId || null,
          defaultOutboundCarrierEndpointId: selectedEndpointId || null,
          defaultCallerIdMode: callerIdMode,
          defaultCallerIdNumber: callerIdNumber || null,
          defaultChannelLimit: channelLimit ? Number(channelLimit) : null,
        },
        customerId,
      );
      notify("Customer outbound routing settings saved");
      await customerRes.reload();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to save settings",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stack">
      {/* Current Outbound Status Panel */}
      <section className="panel">
        <div className="panel-heading padded">
          <div>
            <span className="eyebrow">Customer Outbound Routing</span>
            <h2>Active Outbound Carrier</h2>
            <p>
              All customer-originated calls will route through the selected
              outbound carrier and endpoint.
            </p>
          </div>
          {activeCarrier ? (
            <span
              className="badge"
              style={{
                fontSize: "0.85rem",
                padding: "6px 14px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                border: "1px solid rgba(16, 185, 129, 0.3)",
              }}
            >
              ● {activeCarrier.name} (
              {activeEndpoint
                ? `${activeEndpoint.host}:${activeEndpoint.port}`
                : "Default"}
              )
            </span>
          ) : (
            <span
              className="badge"
              style={{
                fontSize: "0.85rem",
                padding: "6px 14px",
                backgroundColor: "rgba(245, 158, 11, 0.15)",
                color: "#f59e0b",
                border: "1px solid rgba(245, 158, 11, 0.3)",
              }}
            >
              No Outbound Carrier Selected
            </span>
          )}
        </div>

        {/* Quick Carrier Selection Cards */}
        <div style={{ padding: "0 24px 20px" }}>
          <h3
            style={{
              fontSize: "0.95rem",
              marginBottom: "12px",
              color: "var(--text-secondary)",
            }}
          >
            Select Outbound Carrier from Carrier Pool:
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "14px",
            }}
          >
            {carriers.map((carrier) => {
              const isCurrent = carrier.id === selectedCarrierId;
              const primaryEp = carrier.endpoints?.[0];
              return (
                <div
                  key={carrier.id}
                  style={{
                    border: isCurrent
                      ? "2px solid #3b82f6"
                      : "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "16px",
                    backgroundColor: isCurrent
                      ? "rgba(59, 130, 246, 0.08)"
                      : "var(--card-bg, rgba(255,255,255,0.03))",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ fontSize: "1.05rem" }}>
                        {carrier.name}
                      </strong>
                      <span className="badge">{carrier.code}</span>
                    </div>
                    <div
                      style={{
                        marginTop: "6px",
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {carrier.endpoints && carrier.endpoints.length > 0 ? (
                        <div>
                          <span>Gateway: </span>
                          <code className="mono">
                            {primaryEp?.host}:{primaryEp?.port} (
                            {primaryEp?.transport || "UDP"})
                          </code>
                          {carrier.endpoints.length > 1 && (
                            <small
                              style={{
                                display: "block",
                                color: "var(--text-muted)",
                              }}
                            >
                              +{carrier.endpoints.length - 1} additional
                              endpoint(s)
                            </small>
                          )}
                        </div>
                      ) : (
                        <em>No endpoints configured</em>
                      )}
                    </div>
                  </div>

                  <div>
                    {isCurrent ? (
                      <button
                        type="button"
                        className="button secondary compact"
                        style={{ width: "100%", justifyContent: "center" }}
                        disabled
                      >
                        <ShieldCheck size={16} /> Active Outbound Carrier
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button primary compact"
                        style={{ width: "100%", justifyContent: "center" }}
                        disabled={saving}
                        onClick={() =>
                          void handleSelectCarrierAndEndpoint(
                            carrier.id,
                            primaryEp?.id,
                          )
                        }
                      >
                        Set as Outbound Carrier
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!carriers.length && (
              <div className="inline-empty" style={{ gridColumn: "1 / -1" }}>
                No active carriers available. Please create a carrier in
                Management &gt; Carriers first.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Outbound Settings Form */}
      <section className="panel">
        <div className="panel-heading padded">
          <div>
            <span className="eyebrow">Outbound Call Policy</span>
            <h2>Carrier &amp; Caller ID Settings</h2>
          </div>
        </div>
        <form
          className="form-grid settings-form"
          onSubmit={handleSaveForm}
          style={{ padding: "0 24px 24px" }}
        >
          <Field label="Outbound Carrier">
            <select
              value={selectedCarrierId}
              onChange={(e) => {
                const newCarrierId = e.target.value;
                setSelectedCarrierId(newCarrierId);
                const targetCarrier = carriers.find(
                  (c) => c.id === newCarrierId,
                );
                setSelectedEndpointId(targetCarrier?.endpoints?.[0]?.id || "");
              }}
            >
              <option value="">-- No Outbound Carrier Selected --</option>
              {carriers.map((carrier) => (
                <option value={carrier.id} key={carrier.id}>
                  {carrier.name} ({carrier.code})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Carrier Gateway / Endpoint">
            <select
              value={selectedEndpointId}
              onChange={(e) => setSelectedEndpointId(e.target.value)}
              disabled={!selectedCarrierId}
            >
              <option value="">Default Endpoint (Primary)</option>
              {activeCarrier?.endpoints?.map((ep) => (
                <option value={ep.id} key={ep.id}>
                  {ep.name ? `${ep.name} · ` : ""}
                  {ep.host}:{ep.port} ({ep.transport})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Caller ID Mode">
            <select
              value={callerIdMode}
              onChange={(e) => setCallerIdMode(e.target.value)}
            >
              <option value="PASSTHROUGH">
                PASSTHROUGH (Keep customer CLI)
              </option>
              <option value="OVERRIDE">OVERRIDE (Fixed caller ID)</option>
              <option value="STRIP_ADD">STRIP_ADD</option>
              <option value="CALLED_NUMBER">CALLED_NUMBER</option>
              <option value="ANONYMOUS">ANONYMOUS</option>
            </select>
          </Field>

          {callerIdMode === "OVERRIDE" && (
            <Field label="Caller ID Number Override">
              <input
                placeholder="+14155551234"
                value={callerIdNumber}
                onChange={(e) => setCallerIdNumber(e.target.value)}
              />
            </Field>
          )}

          <Field label="Channel Limit" hint="Leave empty for unlimited">
            <input
              type="number"
              min="1"
              placeholder="Unlimited"
              value={channelLimit}
              onChange={(e) => setChannelLimit(e.target.value)}
            />
          </Field>

          <div className="form-actions full">
            <button className="button primary" disabled={saving}>
              {saving && <LoaderCircle className="spin" size={16} />} Save
              Outbound Configuration
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RoutesTable({
  routes,
  actions,
}: {
  routes: Route[];
  actions?: (route: Route) => ReactNode;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Customer</th>
            <th>Direction</th>
            <th>Match</th>
            <th>Destination</th>
            <th>Priority</th>
            <th>XML</th>
            <th>Status</th>
            {actions && <th />}
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => (
            <tr key={route.id}>
              <td>
                <strong>{route.name}</strong>
              </td>
              <td>{route.customer?.name || "Current tenant"}</td>
              <td>
                <span className={`direction ${route.direction.toLowerCase()}`}>
                  {route.direction === "INBOUND" ? (
                    <ArrowDownLeft size={14} />
                  ) : (
                    <ArrowUpRight size={14} />
                  )}
                  {route.direction}
                </span>
              </td>
              <td>
                <span className="mono">
                  {route.matchType}: {route.matchValue}
                </span>
              </td>
              <td>
                {route.targetCustomerEndpoint?.name ||
                  route.targetCarrierEndpoint?.name ||
                  route.destinationNumber ||
                  route.destinationType ||
                  "Inherit"}
              </td>
              <td>{route.priority}</td>
              <td>{route.xml ? `v${route.xml.version}` : "Pending"}</td>
              <td>
                <StatusBadge active={route.isActive} />
              </td>
              {actions && <td>{actions(route)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerDid({
  customerId,
  customerRecordingEnabled,
  notify,
}: {
  customerId: string;
  customerRecordingEnabled: boolean;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const numbers = useResource(
    () => api.get<CustomerNumber[]>("/customer-numbers", customerId),
    [customerId],
  );
  const endpoints = useResource(
    () => api.get<Endpoint[]>("/customer-endpoints", customerId),
    [customerId],
  );
  const sipUsers = useResource(
    () => api.get<SipUserList>("/sip-users", customerId),
    [customerId],
  );
  const profiles = useNormalizationProfiles(customerId);
  const [selected, setSelected] = useState<CustomerNumber | null>(null);
  const [selectedNumberIds, setSelectedNumberIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkOpen, setBulkOpen] = useState(false);
  const [recordingToggles, setRecordingToggles] = useState<Set<string>>(new Set());
  const allNumberIds = (numbers.data || []).map((number) => number.id);
  const allSelected =
    allNumberIds.length > 0 &&
    allNumberIds.every((id) => selectedNumberIds.has(id));
  const toggleNumber = (id: string) => {
    setSelectedNumberIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleRecording = async (number: CustomerNumber) => {
    if (!customerRecordingEnabled || recordingToggles.has(number.id)) return;
    const current = number.settings?.recordingEnabled ?? true;
    setRecordingToggles((ids) => new Set(ids).add(number.id));
    try {
      await api.patch(`/customer-numbers/${number.id}/settings`, { recordingEnabled: !current }, customerId);
      notify(`Call recording ${current ? "disabled" : "enabled"} for ${number.inventory.canonicalNumber}`);
      await numbers.reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update DID recording", "error");
    } finally {
      setRecordingToggles((ids) => {
        const next = new Set(ids);
        next.delete(number.id);
        return next;
      });
    }
  };
  return (
    <section className="panel table-panel">
      <div className="panel-heading padded">
        <div>
          <span className="eyebrow">Assigned inventory</span>
          <h2>Customer DIDs</h2>
          <p>
            Configure destination, caller ID, normalization, limits, and
            failover per number.
          </p>
        </div>
        <AdminOnlyAction><Link className="button secondary" to="/global/did?tab=inventory">
          <Plus size={16} /> Assign number
        </Link></AdminOnlyAction>
      </div>
      {selectedNumberIds.size > 0 && (
        <div className="bulk-action-bar" role="status">
          <strong>{selectedNumberIds.size} numbers selected</strong>
          <span className="toolbar-spacer" />
          <button
            type="button"
            className="button primary compact"
            onClick={() => setBulkOpen(true)}
          >
            <SlidersHorizontal size={15} /> Bulk Edit
          </button>
          <button
            type="button"
            className="button secondary compact"
            onClick={() => setSelectedNumberIds(new Set())}
          >
            Deselect All
          </button>
        </div>
      )}
      <DataState
        loading={numbers.loading}
        error={numbers.error}
        empty={!numbers.data?.length}
        onRetry={numbers.reload}
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label="Select all customer DIDs"
                    checked={allSelected}
                    onChange={() =>
                      setSelectedNumberIds(
                        allSelected ? new Set() : new Set(allNumberIds),
                      )
                    }
                  />
                </th>
                <th>DID</th>
                <th>Recording</th>
                <th>Label</th>
                <th>Destination</th>
                <th>Caller ID</th>
                <th>Failover</th>
                <th>Channels</th>
                <th>XML</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(numbers.data || []).map((number) => (
                <tr key={number.id}>
                  <td className="selection-cell">
                    <input
                      type="checkbox"
                      aria-label={`Select ${number.inventory.canonicalNumber}`}
                      checked={selectedNumberIds.has(number.id)}
                      onChange={() => toggleNumber(number.id)}
                    />
                  </td>
                  <td className="mono">
                    <strong>{number.inventory.canonicalNumber}</strong>
                  </td>
                  <td>
                    <div className="did-row-toggle">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={customerRecordingEnabled && (number.settings?.recordingEnabled ?? true)}
                        aria-label={`${customerRecordingEnabled && (number.settings?.recordingEnabled ?? true) ? "Disable" : "Enable"} call recording for ${number.inventory.canonicalNumber}`}
                        title={customerRecordingEnabled ? undefined : "Customer recording is disabled in customer settings"}
                        className={customerRecordingEnabled && (number.settings?.recordingEnabled ?? true) ? "checked" : ""}
                        disabled={!customerRecordingEnabled || recordingToggles.has(number.id)}
                        onClick={() => void toggleRecording(number)}
                      ><span /></button>
                      <span>{recordingToggles.has(number.id) ? "Updating…" : customerRecordingEnabled && (number.settings?.recordingEnabled ?? true) ? "On" : "Off"}</span>
                    </div>
                  </td>
                  <td>{number.label || "—"}</td>
                  <td>
                    {number.settings?.destinationType === "SIP_USER" ? (
                      <span className="mono">
                        Ext {number.settings?.targetSipUser?.username || "—"}
                      </span>
                    ) : number.settings?.destinationType ===
                      "CUSTOMER_ENDPOINT" ? (
                      "Customer endpoint"
                    ) : number.settings?.destinationType ===
                      "EXTERNAL_NUMBER" ? (
                      number.settings?.forwardNumber || "External forward"
                    ) : number.settings?.destinationType === "REJECT" ? (
                      "Reject call"
                    ) : (
                      number.settings?.destinationType || "Customer default"
                    )}
                  </td>
                  <td>{number.settings?.callerIdMode || "Inherit"}</td>
                  <td>{number.settings?.failoverNumber || "—"}</td>
                  <td>{number.settings?.channelLimit || "Inherit"}</td>
                  <td>
                    {number.xml ? (
                      <span title={number.xml.fileName || undefined}>
                        v{number.xml.version} saved
                      </span>
                    ) : (
                      "Configure DID"
                    )}
                  </td>
                  <td>
                    <StatusBadge
                      active={number.status === "ACTIVE"}
                      label={number.status}
                    />
                  </td>
                  <td>
                    <button
                      className="button ghost compact"
                      onClick={() => setSelected(number)}
                    >
                      <Settings2 size={15} /> DID Override
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
      {selected && (
        <NumberSettingsDrawer
          number={selected}
          endpoints={endpoints.data || []}
          sipUsers={sipUsers.data?.users || []}
          profiles={profiles.data || []}
          customerId={customerId}
          customerRecordingEnabled={customerRecordingEnabled}
          notify={notify}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            void numbers.reload();
          }}
        />
      )}
      {bulkOpen && (
        <BulkNumberSettingsDrawer
          customerNumberIds={[...selectedNumberIds]}
          endpoints={endpoints.data || []}
          sipUsers={sipUsers.data?.users || []}
          profiles={profiles.data || []}
          customerId={customerId}
          customerRecordingEnabled={customerRecordingEnabled}
          notify={notify}
          onClose={() => setBulkOpen(false)}
          onSaved={() => {
            setBulkOpen(false);
            setSelectedNumberIds(new Set());
            void numbers.reload();
          }}
        />
      )}
    </section>
  );
}

function BulkNumberSettingsDrawer({
  customerNumberIds,
  endpoints,
  sipUsers,
  profiles,
  customerId,
  customerRecordingEnabled,
  notify,
  onClose,
  onSaved,
}: {
  customerNumberIds: string[];
  endpoints: Endpoint[];
  sipUsers: SipUser[];
  profiles: NormalizationProfile[];
  customerId: string;
  customerRecordingEnabled: boolean;
  notify: (message: string, type?: Toast["type"]) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    destinationType: "",
    primaryEndpointId: "",
    targetSipUserId: "",
    forwardNumber: "",
    failoverEndpointId: "",
    failoverNumber: "",
    egressNormalizationProfileId: "",
    callerIdMode: "",
    callerIdNumber: "",
    callerIdStripPrefix: "",
    callerIdAddPrefix: "",
    callTimeoutSeconds: "",
    channelLimit: "",
    recordingEnabled: "",
  });
  const change = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setTouched((current) => {
      const next = new Set(current);
      if (key === "recordingEnabled" && value === "") next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!touched.size) {
      notify("Choose at least one setting to update", "error");
      return;
    }
    setSaving(true);
    try {
      const numeric = new Set(["callTimeoutSeconds", "channelLimit"]);
      const settings = Object.fromEntries(
        [...touched].map((key) => {
          const value = form[key as keyof typeof form];
          return [
            key,
            key === "recordingEnabled"
              ? value === "true"
              : numeric.has(key)
                ? (value ? Number(value) : null)
                : value || null,
          ];
        }),
      );
      await api.patch(
        "/customer-numbers/bulk-settings",
        { customerNumberIds, settings, dbOnly: true },
        customerId,
      );
      notify(`${customerNumberIds.length} DIDs updated and XML regenerated`);
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to bulk update DIDs",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return createPortal(
    <div className="drawer-layer">
      <button
        className="drawer-scrim"
        onClick={onClose}
        aria-label="Close bulk settings"
      />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-number-settings-title"
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">Bulk DID override</span>
            <h2 id="bulk-number-settings-title">
              {customerNumberIds.length} selected numbers
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <form className="form-grid drawer-form" onSubmit={submit}>
          <div className="inheritance-note full">
            <SlidersHorizontal size={19} />
            <div>
              <strong>Only changed fields are applied</strong>
              <span>
                Untouched settings keep each DID's current value. Choose an
                empty option after touching a field to clear its override.
              </span>
            </div>
          </div>
          <Field label="Destination behavior">
            <select
              value={form.destinationType}
              onChange={(e) => change("destinationType", e.target.value)}
            >
              <option value="">Inherit customer default</option>
              <option value="SIP_USER">SIP Extension</option>
              <option value="CUSTOMER_ENDPOINT">Customer endpoint (IP)</option>
              <option value="EXTERNAL_NUMBER">External number (Forward)</option>
              <option value="REJECT">Reject</option>
            </select>
          </Field>
          {form.destinationType === "SIP_USER" ? (
            <Field label="Target SIP extension">
              <select
                value={form.targetSipUserId}
                onChange={(e) => change("targetSipUserId", e.target.value)}
              >
                <option value="">Clear / inherit</option>
                {sipUsers
                  .filter((user) => !user.isMonitor)
                  .map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.username} {user.isActive ? "" : "(Inactive)"}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <Field label="Primary endpoint">
              <select
                value={form.primaryEndpointId}
                onChange={(e) => change("primaryEndpointId", e.target.value)}
              >
                <option value="">Clear / inherit</option>
                {endpoints.map((endpoint) => (
                  <option value={endpoint.id} key={endpoint.id}>
                    {endpoint.name} · {endpoint.host}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Forward number">
            <input
              value={form.forwardNumber}
              onChange={(e) => change("forwardNumber", e.target.value)}
              placeholder="Keep existing unless edited"
            />
          </Field>
          <Field label="Failover endpoint">
            <select
              value={form.failoverEndpointId}
              onChange={(e) => change("failoverEndpointId", e.target.value)}
            >
              <option value="">Clear failover</option>
              {endpoints.map((endpoint) => (
                <option value={endpoint.id} key={endpoint.id}>
                  {endpoint.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Failover number">
            <input
              value={form.failoverNumber}
              onChange={(e) => change("failoverNumber", e.target.value)}
              placeholder="Keep existing unless edited"
            />
          </Field>
          <Field label="Egress normalization">
            <select
              value={form.egressNormalizationProfileId}
              onChange={(e) =>
                change("egressNormalizationProfileId", e.target.value)
              }
            >
              <option value="">Clear / inherit</option>
              <ProfileOptions profiles={profiles} ownerType="CUSTOMER" />
            </select>
          </Field>
          <Field label="Caller ID rule">
            <select
              value={form.callerIdMode}
              onChange={(e) => change("callerIdMode", e.target.value)}
            >
              <option value="">Clear / inherit</option>
              <option>PASSTHROUGH</option>
              <option>OVERRIDE</option>
              <option>STRIP_ADD</option>
              <option>CALLED_NUMBER</option>
              <option>ANONYMOUS</option>
            </select>
          </Field>
          <Field label="Caller ID number">
            <input
              value={form.callerIdNumber}
              onChange={(e) => change("callerIdNumber", e.target.value)}
              placeholder="Keep existing unless edited"
            />
          </Field>
          <Field label="Caller ID strip prefix">
            <input
              value={form.callerIdStripPrefix}
              onChange={(e) => change("callerIdStripPrefix", e.target.value)}
              placeholder="Keep existing unless edited"
            />
          </Field>
          <Field label="Caller ID add prefix">
            <input
              value={form.callerIdAddPrefix}
              onChange={(e) => change("callerIdAddPrefix", e.target.value)}
              placeholder="Keep existing unless edited"
            />
          </Field>
          <Field
            label="Call timeout (seconds)"
            hint="Applies only to the selected DIDs; leave blank to keep existing values."
          >
            <input
              type="number"
              min="1"
              max="600"
              value={form.callTimeoutSeconds}
              onChange={(e) => change("callTimeoutSeconds", e.target.value)}
              placeholder="Keep existing"
            />
          </Field>
          <Field label="Channel limit">
            <input
              type="number"
              min="1"
              value={form.channelLimit}
              onChange={(e) => change("channelLimit", e.target.value)}
              placeholder="Keep existing"
            />
          </Field>
          <Field label="Call Recording" hint={customerRecordingEnabled ? "Only the selected DIDs are changed." : "Enable recording in customer settings before configuring individual DIDs."}>
            <select
              value={form.recordingEnabled}
              disabled={!customerRecordingEnabled}
              title={customerRecordingEnabled ? undefined : "Customer recording is disabled in customer settings"}
              onChange={(e) => change("recordingEnabled", e.target.value)}
            >
              <option value="">Keep existing</option>
              <option value="true">Enable recording for selected</option>
              <option value="false">Disable recording for selected</option>
            </select>
          </Field>
          <FormActions
            onClose={onClose}
            saving={saving}
            label={`Update ${customerNumberIds.length} DIDs`}
          />
        </form>
      </aside>
    </div>,
    document.body,
  );
}

function NumberSettingsDrawer({
  number,
  endpoints,
  sipUsers,
  profiles,
  customerId,
  customerRecordingEnabled,
  notify,
  onClose,
  onSaved,
}: {
  number: CustomerNumber;
  endpoints: Endpoint[];
  sipUsers: SipUser[];
  profiles: NormalizationProfile[];
  customerId: string;
  customerRecordingEnabled: boolean;
  notify: (message: string, type?: Toast["type"]) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const current = number.settings || {};
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    destinationType: current.destinationType || "",
    primaryEndpointId: current.primaryEndpointId || "",
    targetSipUserId: current.targetSipUserId || "",
    forwardNumber: current.forwardNumber || "",
    failoverEndpointId: current.failoverEndpointId || "",
    failoverNumber: current.failoverNumber || "",
    egressNormalizationProfileId: current.egressNormalizationProfileId || "",
    callerIdMode: current.callerIdMode || "",
    callerIdNumber: current.callerIdNumber || "",
    callerIdStripPrefix: current.callerIdStripPrefix || "",
    callerIdAddPrefix: current.callerIdAddPrefix || "",
    callTimeoutSeconds: String(current.callTimeoutSeconds || ""),
    channelLimit: String(current.channelLimit || ""),
    recordingEnabled: current.recordingEnabled ?? true,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [
          key,
          key === "recordingEnabled"
            ? value
            : ["callTimeoutSeconds", "channelLimit"].includes(key)
              ? value
                ? Number(value)
                : null
              : value || null,
        ]),
      );
      await api.patch(
        `/customer-numbers/${number.id}/settings`,
        cleaned,
        customerId,
      );
      notify("DID settings saved and XML generated");
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to save DID settings or generate XML",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return createPortal(
    <div className="drawer-layer">
      <button
        className="drawer-scrim"
        onClick={onClose}
        aria-label="Close settings"
      />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="number-settings-title"
      >
        <div className="drawer-header">
          <div>
            <span className="eyebrow">DID override</span>
            <h2 id="number-settings-title">
              {number.inventory.canonicalNumber}
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <form className="form-grid drawer-form" onSubmit={submit}>
          <Field label="Destination behavior">
            <select
              value={form.destinationType}
              onChange={(e) =>
                setForm({ ...form, destinationType: e.target.value })
              }
            >
              <option value="">Inherit customer default</option>
              <option value="SIP_USER">SIP Extension</option>
              <option value="CUSTOMER_ENDPOINT">Customer endpoint (IP)</option>
              <option value="EXTERNAL_NUMBER">External number (Forward)</option>
              <option value="REJECT">Reject</option>
            </select>
          </Field>
          {form.destinationType === "SIP_USER" ? (
            <Field label="Target SIP extension">
              <select
                value={form.targetSipUserId}
                onChange={(e) =>
                  setForm({ ...form, targetSipUserId: e.target.value })
                }
              >
                <option value="">Select an extension</option>
                {sipUsers
                  .filter((user) => !user.isMonitor)
                  .map((user) => (
                    <option value={user.id} key={user.id}>
                      {user.username} {user.isActive ? "" : "(Inactive)"}
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <Field label="Primary endpoint">
              <select
                value={form.primaryEndpointId}
                onChange={(e) =>
                  setForm({ ...form, primaryEndpointId: e.target.value })
                }
              >
                <option value="">Inherit default</option>
                {endpoints.map((endpoint) => (
                  <option value={endpoint.id} key={endpoint.id}>
                    {endpoint.name} · {endpoint.host}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Forward number">
            <input
              value={form.forwardNumber}
              onChange={(e) =>
                setForm({ ...form, forwardNumber: e.target.value })
              }
              placeholder="External destination"
            />
          </Field>
          <Field label="Failover endpoint">
            <select
              value={form.failoverEndpointId}
              onChange={(e) =>
                setForm({ ...form, failoverEndpointId: e.target.value })
              }
            >
              <option value="">No endpoint failover</option>
              {endpoints.map((endpoint) => (
                <option value={endpoint.id} key={endpoint.id}>
                  {endpoint.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Failover number">
            <input
              value={form.failoverNumber}
              onChange={(e) =>
                setForm({ ...form, failoverNumber: e.target.value })
              }
            />
          </Field>
          <Field label="Egress normalization">
            <select
              value={form.egressNormalizationProfileId}
              onChange={(e) =>
                setForm({
                  ...form,
                  egressNormalizationProfileId: e.target.value,
                })
              }
            >
              <option value="">Inherit</option>
              <ProfileOptions profiles={profiles} ownerType="CUSTOMER" />
            </select>
          </Field>
          <Field label="Caller ID rule">
            <select
              value={form.callerIdMode}
              onChange={(e) =>
                setForm({ ...form, callerIdMode: e.target.value })
              }
            >
              <option value="">Inherit</option>
              <option>PASSTHROUGH</option>
              <option>OVERRIDE</option>
              <option>STRIP_ADD</option>
              <option>CALLED_NUMBER</option>
              <option>ANONYMOUS</option>
            </select>
          </Field>
          <Field label="Caller ID number">
            <input
              value={form.callerIdNumber}
              onChange={(e) =>
                setForm({ ...form, callerIdNumber: e.target.value })
              }
            />
          </Field>
          <Field label="Caller ID strip prefix">
            <input
              value={form.callerIdStripPrefix}
              onChange={(e) =>
                setForm({ ...form, callerIdStripPrefix: e.target.value })
              }
            />
          </Field>
          <Field label="Caller ID add prefix">
            <input
              value={form.callerIdAddPrefix}
              onChange={(e) =>
                setForm({ ...form, callerIdAddPrefix: e.target.value })
              }
            />
          </Field>
          <Field
            label="Call timeout (seconds)"
            hint="Applies only to this DID; leave blank for no explicit timeout."
          >
            <input
              type="number"
              min="1"
              max="600"
              value={form.callTimeoutSeconds}
              onChange={(e) =>
                setForm({ ...form, callTimeoutSeconds: e.target.value })
              }
            />
          </Field>
          <Field label="Channel limit">
            <input
              type="number"
              min="1"
              value={form.channelLimit}
              onChange={(e) =>
                setForm({ ...form, channelLimit: e.target.value })
              }
            />
          </Field>
          <Toggle
            label="Record calls for this DID"
            checked={form.recordingEnabled}
            disabled={!customerRecordingEnabled}
            title={customerRecordingEnabled ? undefined : "Customer recording is disabled in customer settings"}
            onChange={(recordingEnabled) => setForm({ ...form, recordingEnabled })}
          />
          <div className="inheritance-note full">
            <SlidersHorizontal size={19} />
            <div>
              <strong>Blank values use routing defaults</strong>
              <span>
                Only populated fields override defaults. A blank call timeout means
                this DID has no explicit timeout.
              </span>
            </div>
          </div>
          <FormActions
            onClose={onClose}
            saving={saving}
            label="Save DID settings"
          />
        </form>
      </aside>
    </div>,
    document.body,
  );
}

function RouteTestConsole({
  customerId,
  notify,
}: {
  customerId: string;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const endpoints = useResource(
    () => api.get<Endpoint[]>("/customer-endpoints", customerId),
    [customerId],
  );
  const [mode, setMode] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RoutingResolution | null>(null);
  const [form, setForm] = useState({
    destinationNumber: "",
    callerIdNumber: "",
    customerEndpointId: "",
    sourceIp: "",
    sourcePort: "5060",
    authUsername: "",
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setRunning(true);
    setResult(null);
    try {
      const resolution =
        mode === "OUTBOUND"
          ? await api.post<RoutingResolution>(
            "/routing/customer/outbound",
            {
              destinationNumber: form.destinationNumber,
              callerIdNumber: form.callerIdNumber || undefined,
              customerEndpointId: form.customerEndpointId || undefined,
            },
            customerId,
          )
          : await api.post<RoutingResolution>("/routing/resolve", {
            direction: "INBOUND",
            sourceIp: form.sourceIp,
            sourcePort: form.sourcePort ? Number(form.sourcePort) : undefined,
            authUsername: form.authUsername || undefined,
            destinationNumber: form.destinationNumber,
            callerIdNumber: form.callerIdNumber || undefined,
          });
      setResult(resolution);
      notify("Route resolved successfully");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Route resolution failed",
        "error",
      );
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="route-test-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Configuration preview</span>
            <h2>Test a call route</h2>
            <p>
              This previews the configured decision. FreeSWITCH XML CURL is
              served separately by Python from persisted XML files.
            </p>
          </div>
        </div>
        <div className="segmented route-test-mode">
          <button
            className={mode === "OUTBOUND" ? "active" : ""}
            onClick={() => {
              setMode("OUTBOUND");
              setResult(null);
            }}
          >
            Customer outbound
          </button>
          <button
            className={mode === "INBOUND" ? "active" : ""}
            onClick={() => {
              setMode("INBOUND");
              setResult(null);
            }}
          >
            Carrier inbound
          </button>
        </div>
        <form className="form-grid route-test-form" onSubmit={submit}>
          {mode === "INBOUND" && (
            <>
              <Field label="Carrier source IP">
                <input
                  required
                  value={form.sourceIp}
                  onChange={(e) =>
                    setForm({ ...form, sourceIp: e.target.value })
                  }
                  placeholder="198.51.100.20"
                />
              </Field>
              <Field label="Source port">
                <input
                  type="number"
                  min="0"
                  max="65535"
                  value={form.sourcePort}
                  onChange={(e) =>
                    setForm({ ...form, sourcePort: e.target.value })
                  }
                />
              </Field>
              <Field label="Digest username">
                <input
                  value={form.authUsername}
                  onChange={(e) =>
                    setForm({ ...form, authUsername: e.target.value })
                  }
                  placeholder="Optional"
                />
              </Field>
            </>
          )}
          {mode === "OUTBOUND" && (
            <Field label="Source customer endpoint">
              <select
                value={form.customerEndpointId}
                onChange={(e) =>
                  setForm({ ...form, customerEndpointId: e.target.value })
                }
              >
                <option value="">Use customer defaults</option>
                {endpoints.data?.map((endpoint) => (
                  <option value={endpoint.id} key={endpoint.id}>
                    {endpoint.name} · {endpoint.host}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label={
              mode === "INBOUND"
                ? "Raw carrier destination"
                : "Dialed destination"
            }
          >
            <input
              required
              inputMode="tel"
              value={form.destinationNumber}
              onChange={(e) =>
                setForm({ ...form, destinationNumber: e.target.value })
              }
              placeholder={mode === "INBOUND" ? "+18005551234" : "442071234567"}
            />
          </Field>
          <Field label="Caller ID">
            <input
              inputMode="tel"
              value={form.callerIdNumber}
              onChange={(e) =>
                setForm({ ...form, callerIdNumber: e.target.value })
              }
              placeholder="Optional"
            />
          </Field>
          <div className="form-actions full">
            <button className="button primary" disabled={running}>
              {running ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <FlaskConical size={16} />
              )}{" "}
              Resolve route
            </button>
          </div>
        </form>
      </section>
      <section className="panel route-result">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Authoritative output</span>
            <h2>Resolution trace</h2>
          </div>
          {result && <StatusBadge active label="Resolved" />}
        </div>
        {!result ? (
          <div className="empty-state compact-empty">
            <Braces />
            <h3>No resolution yet</h3>
            <p>
              Enter a real configured source and number. Errors are returned
              from the backend without changing routing configuration.
            </p>
          </div>
        ) : (
          <div className="resolution-output">
            <div className="resolution-summary">
              <div>
                <span>Raw number</span>
                <strong className="mono">
                  {result.plan.rawDestinationNumber}
                </strong>
              </div>
              <ArrowRight />
              <div>
                <span>Lookup number</span>
                <strong className="mono">{result.plan.lookupNumber}</strong>
              </div>
              <ArrowRight />
              <div>
                <span>Destination</span>
                <strong className="mono">
                  {result.plan.primary
                    ? `${result.plan.primary.host}:${result.plan.primary.port}`
                    : result.plan.rejectCause || "No bridge"}
                </strong>
              </div>
            </div>
            <TraceBlock
              title="Ingress normalization"
              result={result.plan.ingressNormalization}
            />
            {result.plan.egressNormalizations.map((normalization, index) => (
              <TraceBlock
                key={index}
                title={`Egress normalization ${index + 1}`}
                result={normalization}
              />
            ))}
            <dl className="definition-list resolution-definition">
              <div>
                <dt>Route ID</dt>
                <dd className="mono">
                  {result.plan.routeId || "Defaults only"}
                </dd>
              </div>
              <div>
                <dt>Caller ID mode</dt>
                <dd>{result.plan.callerIdMode}</dd>
              </div>
              <div>
                <dt>Timeout / channels</dt>
                <dd>
                  {result.plan.callTimeoutSeconds
                    ? `${result.plan.callTimeoutSeconds}s`
                    : result.plan.direction === "OUTBOUND"
                      ? "No outbound timeout"
                      : "No DID timeout"}{" "}
                  ·{" "}
                  {result.plan.channelLimit || "Unlimited"} channels
                </dd>
              </div>
              <div>
                <dt>Failover</dt>
                <dd>
                  {result.plan.failover
                    ? `${result.plan.failover.host}:${result.plan.failover.port}/${result.plan.failover.number}`
                    : "None"}
                </dd>
              </div>
            </dl>
            <details className="xml-output">
              <summary>
                <Braces size={16} /> Generated FreeSWITCH XML
              </summary>
              <pre>{result.xml}</pre>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}

function TraceBlock({
  title,
  result,
}: {
  title: string;
  result: RoutingResolution["plan"]["ingressNormalization"];
}) {
  return (
    <div className="trace-block">
      <div>
        <strong>{title}</strong>
        <span className="mono">
          {result.raw} → {result.normalized}
        </span>
      </div>
      {result.trace.length ? (
        <ol>
          {result.trace.map((step, index) => (
            <li key={index}>
              <span>{step.operation}</span>
              <code>{step.before}</code>
              <ArrowRight size={13} />
              <code>{step.after}</code>
            </li>
          ))}
        </ol>
      ) : (
        <small>No profile applied; value unchanged.</small>
      )}
    </div>
  );
}

function CustomerStats({ customer }: { customer: Customer }) {
  return (
    <>
      <div className="summary-grid">
        <SummaryCard
          icon={Phone}
          label="Numbers"
          value="Configuration metric"
        />
        <SummaryCard icon={RouteIcon} label="Routes" value="Tenant scoped" />
        <SummaryCard
          icon={Cable}
          label="Channels"
          value={String(customer.settings?.defaultChannelLimit || "Unlimited")}
        />
        <SummaryCard
          icon={CircleGauge}
          label="Traffic stats"
          value="Awaiting CDR source"
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Data boundary</span>
            <h2>Traffic statistics</h2>
          </div>
        </div>
        <div className="empty-state compact-empty">
          <Activity />
          <h3>CDR aggregation is not connected yet</h3>
          <p>
            The routing API owns configuration and XML resolution. Connect your
            CDR/analytics service here when its API is available; this UI does
            not invent call metrics.
          </p>
        </div>
      </section>
    </>
  );
}
function SectionPlaceholder({ name }: { name: string }) {
  return (
    <section className="panel">
      <div className="empty-state compact-empty">
        <Boxes />
        <h3>{name.replace(/\b\w/g, (letter) => letter.toUpperCase())}</h3>
        <p>
          This application-level module is intentionally left for the parent
          platform integration.
        </p>
      </div>
    </section>
  );
}

function CarriersPage({
  notify,
}: {
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const resource = useResource(() => api.get<Carrier[]>("/carriers"), []);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [open, setOpen] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState<Carrier | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    defaultChannelLimit: "",
    isActive: true,
  });
  const carriers = (resource.data || []).filter((item) =>
    `${item.name} ${item.code}`.toLowerCase().includes(deferred.toLowerCase()),
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/carriers", {
        ...form,
        code: form.code.toUpperCase(),
        defaultChannelLimit: form.defaultChannelLimit
          ? Number(form.defaultChannelLimit)
          : undefined,
      });
      notify("Carrier created");
      setOpen(false);
      await resource.reload();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to create carrier",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Management"
        title="Carriers"
        description="Provider interconnects, ingress identity, normalization defaults, and outbound prefix routes."
        actions={
          <button className="button primary" onClick={() => setOpen(true)}>
            <Plus size={17} /> Add carrier
          </button>
        }
      />
      <section className="panel table-panel">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search carrier or code"
        />
        <DataState
          loading={resource.loading}
          error={resource.error}
          empty={!carriers.length}
          onRetry={resource.reload}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Carrier</th>
                  <th>Endpoints</th>
                  <th>Source auth</th>
                  <th>Prefix routes</th>
                  <th>Channels</th>
                  <th>Ingress profile</th>
                  <th>Egress profile</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {carriers.map((carrier) => (
                  <tr key={carrier.id}>
                    <td>
                      <Link
                        className="entity-cell"
                        to={`/management/carriers/${carrier.id}`}
                      >
                        <span className="carrier-monogram">
                          <CloudCog size={18} />
                        </span>
                        <span>
                          <strong>{carrier.name}</strong>
                          <small>{carrier.code}</small>
                        </span>
                      </Link>
                    </td>
                    <td>
                      {carrier._count?.endpoints ??
                        carrier.endpoints?.length ??
                        0}
                    </td>
                    <td>{carrier._count?.sourceAuth ?? 0}</td>
                    <td>
                      {carrier._count?.routes ?? carrier.routes?.length ?? 0}
                    </td>
                    <td>{carrier.defaultChannelLimit || "Unlimited"}</td>
                    <td>
                      {carrier.defaultIngressProfileId
                        ? "Configured"
                        : "Default"}
                    </td>
                    <td>
                      {carrier.defaultEgressProfileId
                        ? "Configured"
                        : "Default"}
                    </td>
                    <td>
                      <StatusBadge active={carrier.isActive} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          onClick={() => setEditingCarrier(carrier)}
                          aria-label={`Edit ${carrier.name}`}
                        >
                          <Pencil size={16} />
                        </button>
                        <Link
                          className="icon-button"
                          to={`/management/carriers/${carrier.id}`}
                          aria-label={`Open ${carrier.name}`}
                        >
                          <ChevronRight size={17} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>
      {open && (
        <Modal
          title="Add carrier"
          description="Create the carrier first, then configure endpoints, source IPs, and prefix routing."
          onClose={() => setOpen(false)}
        >
          <form className="form-grid" onSubmit={submit}>
            <Field label="Carrier name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Carrier code">
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="Default channels">
              <input
                type="number"
                min="1"
                placeholder="Unlimited"
                value={form.defaultChannelLimit}
                onChange={(e) =>
                  setForm({ ...form, defaultChannelLimit: e.target.value })
                }
              />
            </Field>
            <Toggle
              label="Carrier is active"
              checked={form.isActive}
              onChange={(value) => setForm({ ...form, isActive: value })}
            />
            <FormActions
              onClose={() => setOpen(false)}
              saving={saving}
              label="Create carrier"
            />
          </form>
        </Modal>
      )}
      {editingCarrier && (
        <CarrierEditModal
          carrier={editingCarrier}
          onClose={() => setEditingCarrier(null)}
          onSaved={() => {
            setEditingCarrier(null);
            void resource.reload();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

function CarrierEditModal({
  carrier,
  onClose,
  onSaved,
  notify,
}: {
  carrier: Carrier;
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: carrier.name,
    code: carrier.code,
    isActive: carrier.isActive,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/carriers/${carrier.id}`, {
        name: form.name,
        code: form.code.toUpperCase(),
        isActive: form.isActive,
      });
      notify("Carrier updated");
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to update carrier",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Edit carrier"
      description="Update the carrier name, code, or availability."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <Field label="Carrier name">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Carrier code">
          <input
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </Field>
        <Toggle
          label="Carrier is active"
          checked={form.isActive}
          onChange={(value) => setForm({ ...form, isActive: value })}
        />
        <FormActions onClose={onClose} saving={saving} label="Save carrier" />
      </form>
    </Modal>
  );
}

function CarrierDetail({
  notify,
}: {
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const { carrierId = "" } = useParams();
  const resource = useResource(
    () => api.get<Carrier>(`/carriers/${carrierId}`),
    [carrierId],
  );
  const auth = useResource(() => api.get<SourceAuth[]>("/source-ip-auth"), []);
  const profiles = useNormalizationProfiles(undefined, carrierId);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeSaving, setRouteSaving] = useState(false);
  const emptyEndpointForm = {
    name: "",
    host: "",
    port: "5060",
    transport: "UDP",
    direction: "BOTH",
    channelLimit: "",
    priority: "100",
    ingressNormalizationProfileId: "",
    egressNormalizationProfileId: "",
    isActive: true,
  };
  const [form, setForm] = useState(emptyEndpointForm);
  const [routeForm, setRouteForm] = useState({
    name: "",
    matchPrefix: "",
    carrierEndpointId: "",
    egressNormalizationProfileId: "",
    priority: "100",
    cost: "",
    channelLimit: "",
    isActive: true,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const endpoint = await api.post<Endpoint>(
        `/carriers/${carrierId}/endpoints`,
        {
          ...form,
          port: Number(form.port),
          priority: Number(form.priority),
          channelLimit: form.channelLimit
            ? Number(form.channelLimit)
            : undefined,
          ingressNormalizationProfileId:
            form.ingressNormalizationProfileId || undefined,
          egressNormalizationProfileId:
            form.egressNormalizationProfileId || undefined,
          authType: "IP",
        },
      );
      try {
        await api.post("/source-ip-auth", {
          sourceType: "CARRIER",
          carrierId,
          carrierEndpointId: endpoint.id,
          ipAddress: form.host,
          port: Number(form.port),
          isActive: form.isActive,
        });
      } catch (error) {
        await api.delete(`/carriers/${carrierId}/endpoints/${endpoint.id}`);
        throw error;
      }
      notify("Carrier endpoint added");
      setOpen(false);
      setForm(emptyEndpointForm);
      await Promise.all([resource.reload(), auth.reload()]);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to add endpoint",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  const submitRoute = async (event: FormEvent) => {
    event.preventDefault();
    setRouteSaving(true);
    try {
      await api.post(`/carriers/${carrierId}/routes`, {
        name: routeForm.name,
        matchPrefix: routeForm.matchPrefix,
        carrierEndpointId: routeForm.carrierEndpointId,
        egressNormalizationProfileId:
          routeForm.egressNormalizationProfileId || undefined,
        priority: Number(routeForm.priority),
        cost: routeForm.cost ? Number(routeForm.cost) : undefined,
        channelLimit: routeForm.channelLimit
          ? Number(routeForm.channelLimit)
          : undefined,
        isActive: routeForm.isActive,
      });
      notify("Carrier prefix route created");
      setRouteOpen(false);
      setRouteForm({
        name: "",
        matchPrefix: "",
        carrierEndpointId: "",
        egressNormalizationProfileId: "",
        priority: "100",
        cost: "",
        channelLimit: "",
        isActive: true,
      });
      await resource.reload();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to create carrier route",
        "error",
      );
    } finally {
      setRouteSaving(false);
    }
  };
  const removeRoute = async (route: CarrierRoute) => {
    if (!window.confirm(`Delete carrier route ${route.name}?`)) return;
    try {
      await api.delete(`/carriers/${carrierId}/routes/${route.id}`);
      notify("Carrier route removed");
      await resource.reload();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to remove carrier route",
        "error",
      );
    }
  };
  const removeEndpoint = async (endpoint: Endpoint) => {
    if (!window.confirm(`Delete carrier endpoint ${endpoint.name}?`)) return;
    try {
      await api.delete(`/carriers/${carrierId}/endpoints/${endpoint.id}`);
      notify("Carrier endpoint and linked IP authentication removed");
      await Promise.all([resource.reload(), auth.reload()]);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to remove endpoint",
        "error",
      );
    }
  };
  const carrierAuth =
    auth.data?.filter((item) => item.carrierId === carrierId) || [];
  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/management/carriers">Carriers</Link>
        <ChevronRight size={14} />
        <span>{resource.data?.name || "Carrier"}</span>
      </div>
      <PageHeader
        title={resource.data?.name || "Carrier details"}
        description={
          resource.data
            ? `${resource.data.code} · provider interconnect`
            : "Loading carrier"
        }
        actions={
          resource.data && <StatusBadge active={resource.data.isActive} />
        }
      />
      <DataState
        loading={resource.loading}
        error={resource.error}
        onRetry={resource.reload}
      >
        {resource.data && (
          <div className="stack">
            <div className="summary-grid">
              <SummaryCard
                icon={Server}
                label="Endpoints"
                value={String(resource.data.endpoints?.length || 0)}
              />
              <SummaryCard
                icon={KeyRound}
                label="Source identities"
                value={String(carrierAuth.length)}
              />
              <SummaryCard
                icon={RouteIcon}
                label="Prefix routes"
                value={String(resource.data.routes?.length || 0)}
              />
              <SummaryCard
                icon={Cable}
                label="Channels"
                value={String(resource.data.defaultChannelLimit || "Unlimited")}
              />
            </div>
            <CarrierNormalization
              carrier={resource.data}
              profiles={profiles.data || []}
              loading={profiles.loading}
              error={profiles.error}
              reloadProfiles={profiles.reload}
              reloadCarrier={resource.reload}
              notify={notify}
            />
            <section className="panel table-panel">
              <div className="panel-heading padded">
                <div>
                  <span className="eyebrow">Carrier IP / auth</span>
                  <h2>Endpoints</h2>
                  <p>
                    Endpoint profiles override carrier defaults after source
                    identification.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setOpen(true)}
                >
                  <Plus size={16} /> Add endpoint
                </button>
              </div>
              <DataState
                loading={auth.loading || profiles.loading}
                error={auth.error || profiles.error}
                empty={!resource.data.endpoints?.length}
              >
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Endpoint</th>
                        <th>Host</th>
                        <th>Direction</th>
                        <th>Ingress</th>
                        <th>Egress</th>
                        <th>Channels</th>
                        <th>Source auth</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {resource.data.endpoints?.map((endpoint) => (
                        <tr key={endpoint.id}>
                          <td>
                            <strong>{endpoint.name}</strong>
                            <small className="table-sub">
                              {endpoint.transport} · priority{" "}
                              {endpoint.priority}
                            </small>
                          </td>
                          <td className="mono">
                            {endpoint.host}:{endpoint.port}
                          </td>
                          <td>{endpoint.direction}</td>
                          <td>
                            {profileName(
                              profiles.data || [],
                              endpoint.ingressNormalizationProfileId,
                            )}
                          </td>
                          <td>
                            {profileName(
                              profiles.data || [],
                              endpoint.egressNormalizationProfileId,
                            )}
                          </td>
                          <td>{endpoint.channelLimit || "Default"}</td>
                          <td>
                            {carrierAuth.some(
                              (item) =>
                                item.carrierEndpoint?.id === endpoint.id,
                            )
                              ? "IP linked"
                              : "Not linked"}
                          </td>
                          <td>
                            <StatusBadge active={endpoint.isActive} />
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="icon-button"
                                onClick={() => setEditingEndpoint(endpoint)}
                                aria-label="Edit endpoint"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="icon-button danger"
                                onClick={() => void removeEndpoint(endpoint)}
                                aria-label="Delete endpoint"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DataState>
            </section>
            <section className="panel table-panel">
              <div className="panel-heading padded">
                <div>
                  <span className="eyebrow">Outbound selection</span>
                  <h2>Carrier prefix routes</h2>
                  <p>
                    Longest prefix wins; priority breaks equal-prefix matches.
                    The route egress profile overrides endpoint and carrier
                    egress.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => setRouteOpen(true)}
                >
                  <Plus size={16} /> Add prefix route
                </button>
              </div>
              <DataState
                loading={false}
                error={null}
                empty={!resource.data.routes?.length}
              >
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Prefix</th>
                        <th>Endpoint</th>
                        <th>Egress profile</th>
                        <th>Priority</th>
                        <th>Cost</th>
                        <th>Channels</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {resource.data.routes?.map((route) => (
                        <tr key={route.id}>
                          <td>
                            <strong>{route.name}</strong>
                          </td>
                          <td className="mono">
                            {route.matchPrefix || "Default"}
                          </td>
                          <td>
                            {resource.data?.endpoints?.find(
                              (endpoint) =>
                                endpoint.id === route.carrierEndpointId,
                            )?.name || "Unavailable"}
                          </td>
                          <td>
                            {profileName(
                              profiles.data || [],
                              route.egressNormalizationProfileId,
                            )}
                          </td>
                          <td>{route.priority}</td>
                          <td>{route.cost || "—"}</td>
                          <td>{route.channelLimit || "Default"}</td>
                          <td>
                            <StatusBadge active={route.isActive} />
                          </td>
                          <td>
                            <button
                              className="icon-button danger"
                              onClick={() => void removeRoute(route)}
                              aria-label="Delete carrier route"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DataState>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Normalization order</span>
                  <h2>Inbound carrier flow</h2>
                </div>
              </div>
              <div className="routing-flow">
                <FlowStep
                  number="01"
                  title="Identify carrier"
                  text="Source IP / digest"
                />
                <ArrowRight />
                <FlowStep
                  number="02"
                  title="Ingress normalize"
                  text={profileName(
                    profiles.data || [],
                    resource.data.defaultIngressProfileId,
                  )}
                />
                <ArrowRight />
                <FlowStep
                  number="03"
                  title="Lookup DID"
                  text="Normalized number"
                />
                <ArrowRight />
                <FlowStep
                  number="04"
                  title="Route tenant"
                  text="Number → route → XML"
                />
              </div>
            </section>
          </div>
        )}
      </DataState>
      {open && (
        <Modal
          title="Add carrier endpoint"
          description="The endpoint host is also registered as the carrier source identity."
          onClose={() => setOpen(false)}
        >
          <form className="form-grid" onSubmit={submit}>
            <Field label="Endpoint name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="IP / host">
              <input
                required
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
              />
            </Field>
            <Field label="Port">
              <input
                type="number"
                min="1"
                max="65535"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value })}
              />
            </Field>
            <Field label="Direction">
              <select
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value })
                }
              >
                <option>INBOUND</option>
                <option>OUTBOUND</option>
                <option>BOTH</option>
              </select>
            </Field>
            <Field label="Transport">
              <select
                value={form.transport}
                onChange={(e) =>
                  setForm({ ...form, transport: e.target.value })
                }
              >
                <option>UDP</option>
                <option>TCP</option>
                <option>TLS</option>
              </select>
            </Field>
            <Field label="Priority">
              <input
                type="number"
                min="1"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              />
            </Field>
            <Field label="Channel limit">
              <input
                type="number"
                min="1"
                placeholder="Carrier default"
                value={form.channelLimit}
                onChange={(e) =>
                  setForm({ ...form, channelLimit: e.target.value })
                }
              />
            </Field>
            <Field label="Ingress normalization">
              <select
                value={form.ingressNormalizationProfileId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ingressNormalizationProfileId: e.target.value,
                  })
                }
              >
                <option value="">Inherit carrier default</option>
                <ProfileOptions
                  profiles={profiles.data || []}
                  ownerType="CARRIER"
                />
              </select>
            </Field>
            <Field label="Egress normalization">
              <select
                value={form.egressNormalizationProfileId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    egressNormalizationProfileId: e.target.value,
                  })
                }
              >
                <option value="">Inherit carrier default</option>
                <ProfileOptions
                  profiles={profiles.data || []}
                  ownerType="CARRIER"
                />
              </select>
            </Field>
            <Toggle
              label="Endpoint is active"
              checked={form.isActive}
              onChange={(value) => setForm({ ...form, isActive: value })}
            />
            <FormActions
              onClose={() => setOpen(false)}
              saving={saving}
              label="Add endpoint"
            />
          </form>
        </Modal>
      )}
      {routeOpen && (
        <Modal
          title="Add carrier prefix route"
          description="Choose the outbound endpoint and optional route-level egress normalization."
          onClose={() => setRouteOpen(false)}
        >
          <form className="form-grid" onSubmit={submitRoute}>
            <Field label="Route name">
              <input
                required
                value={routeForm.name}
                onChange={(e) =>
                  setRouteForm({ ...routeForm, name: e.target.value })
                }
              />
            </Field>
            <Field label="Match prefix" hint="Blank matches any number">
              <input
                pattern="\+?[0-9]*"
                inputMode="tel"
                value={routeForm.matchPrefix}
                onChange={(e) =>
                  setRouteForm({ ...routeForm, matchPrefix: e.target.value })
                }
              />
            </Field>
            <Field label="Carrier endpoint">
              <select
                required
                value={routeForm.carrierEndpointId}
                onChange={(e) =>
                  setRouteForm({
                    ...routeForm,
                    carrierEndpointId: e.target.value,
                  })
                }
              >
                <option value="">Select endpoint</option>
                {resource.data?.endpoints
                  ?.filter((endpoint) => endpoint.isActive)
                  .map((endpoint) => (
                    <option value={endpoint.id} key={endpoint.id}>
                      {endpoint.name} · {endpoint.host}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Egress normalization">
              <select
                value={routeForm.egressNormalizationProfileId}
                onChange={(e) =>
                  setRouteForm({
                    ...routeForm,
                    egressNormalizationProfileId: e.target.value,
                  })
                }
              >
                <option value="">Inherit endpoint/carrier</option>
                <ProfileOptions
                  profiles={profiles.data || []}
                  ownerType="CARRIER"
                />
              </select>
            </Field>
            <Field label="Priority">
              <input
                required
                type="number"
                min="1"
                value={routeForm.priority}
                onChange={(e) =>
                  setRouteForm({ ...routeForm, priority: e.target.value })
                }
              />
            </Field>
            <Field label="Cost">
              <input
                type="number"
                min="0"
                step="0.000001"
                value={routeForm.cost}
                onChange={(e) =>
                  setRouteForm({ ...routeForm, cost: e.target.value })
                }
              />
            </Field>
            <Field label="Channel limit">
              <input
                type="number"
                min="1"
                placeholder="Inherit"
                value={routeForm.channelLimit}
                onChange={(e) =>
                  setRouteForm({ ...routeForm, channelLimit: e.target.value })
                }
              />
            </Field>
            <Toggle
              label="Route is active"
              checked={routeForm.isActive}
              onChange={(value) =>
                setRouteForm({ ...routeForm, isActive: value })
              }
            />
            <FormActions
              onClose={() => setRouteOpen(false)}
              saving={routeSaving}
              label="Create prefix route"
            />
          </form>
        </Modal>
      )}
      {editingEndpoint && (
        <EndpointNormalizationModal
          endpoint={editingEndpoint}
          profiles={profiles.data || []}
          ownerType="CARRIER"
          carrierId={carrierId}
          onClose={() => setEditingEndpoint(null)}
          notify={notify}
          onSaved={() => {
            setEditingEndpoint(null);
            void Promise.all([resource.reload(), auth.reload()]);
          }}
        />
      )}
    </div>
  );
}

function CarrierNormalization({
  carrier,
  profiles,
  loading,
  error,
  reloadProfiles,
  reloadCarrier,
  notify,
}: {
  carrier: Carrier;
  profiles: NormalizationProfile[];
  loading: boolean;
  error: string | null;
  reloadProfiles: () => Promise<void>;
  reloadCarrier: () => Promise<void>;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [defaults, setDefaults] = useState({
    ingress: carrier.defaultIngressProfileId || "",
    egress: carrier.defaultEgressProfileId || "",
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/carriers/${carrier.id}`, {
        defaultIngressProfileId: defaults.ingress || null,
        defaultEgressProfileId: defaults.egress || null,
      });
      notify("Carrier normalization defaults saved");
      await reloadCarrier();
    } catch (errorValue) {
      notify(
        errorValue instanceof Error
          ? errorValue.message
          : "Unable to save carrier defaults",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="carrier-normalization-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Provider fallback</span>
            <h2>Carrier defaults</h2>
            <p>
              Ingress runs before assigned-number lookup. Egress runs after
              customer egress when sending to this carrier.
            </p>
          </div>
        </div>
        <form className="form-grid settings-form" onSubmit={submit}>
          <Field label="Default ingress profile">
            <select
              value={defaults.ingress}
              onChange={(e) =>
                setDefaults({ ...defaults, ingress: e.target.value })
              }
            >
              <option value="">No normalization</option>
              <ProfileOptions profiles={profiles} ownerType="CARRIER" />
            </select>
          </Field>
          <Field label="Default egress profile">
            <select
              value={defaults.egress}
              onChange={(e) =>
                setDefaults({ ...defaults, egress: e.target.value })
              }
            >
              <option value="">No normalization</option>
              <ProfileOptions profiles={profiles} ownerType="CARRIER" />
            </select>
          </Field>
          <div className="form-actions full">
            <button className="button primary" disabled={saving || loading}>
              {saving && <LoaderCircle className="spin" size={16} />} Save
              defaults
            </button>
          </div>
        </form>
      </section>
      <NormalizationProfilesPanel
        ownerType="CARRIER"
        carrierId={carrier.id}
        profiles={profiles}
        loading={loading}
        error={error}
        reload={reloadProfiles}
        notify={notify}
      />
    </div>
  );
}

function FlowStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flow-step">
      <span>{number}</span>
      <strong>{title}</strong>
      <small>{text}</small>
    </div>
  );
}

function didStatusLabel(number: InventoryNumber) {
  if (number.activationStatus === 'DEACTIVATED_BY_SUBSCRIPTION' || number.subscriptionDisabled) return 'Deactivated by Subscription';
  if (number.activationStatus === 'DISABLED_BY_ADMIN' || number.manuallyDisabled || number.assignment?.status === 'SUSPENDED' || number.status === 'SUSPENDED') return 'Disabled by Super Admin';
  return number.assignment ? 'Active' : 'Available';
}

function DidPage({
  notify,
}: {
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const location = useLocation();
  const initial = new URLSearchParams(location.search).get("tab") || "assigned";
  const [tab, setTab] = useState(initial);
  const resource = useResource(
    () => api.get<InventoryNumber[]>("/number-inventory"),
    [],
  );
  const customers = useResource(() => api.get<Customer[]>("/customers"), []);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [assigning, setAssigning] = useState<InventoryNumber | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleDid = async (number: InventoryNumber) => {
    const enabled = Boolean(number.manuallyDisabled);
    if (!enabled && !window.confirm(number.subscriptionDisabled
      ? `Add a Super Admin disable override for ${number.canonicalNumber}? It will remain disabled even if the subscription is reactivated.`
      : `Disable DID ${number.canonicalNumber}? Incoming calls to this number will stop routing.`)) return;
    setTogglingId(number.id);
    try {
      const result = await api.patch<{ activationStatus: InventoryNumber['activationStatus']; routeWarning?: string }>(`/number-inventory/${number.id}/activation`, { enabled });
      await resource.reload();
      const message = result.routeWarning || (enabled && result.activationStatus === 'DEACTIVATED_BY_SUBSCRIPTION'
        ? `Admin control enabled; ${number.canonicalNumber} remains deactivated by Subscription`
        : `${number.canonicalNumber} ${enabled ? 'enabled' : 'disabled'} by Super Admin`);
      notify(message, result.routeWarning ? 'error' : 'success');
    } catch (error) {
      await resource.reload();
      notify(error instanceof Error ? error.message : 'Unable to change DID status', 'error');
    } finally {
      setTogglingId(null);
    }
  };
  const filtered = (resource.data || []).filter(
    (item) =>
      item.canonicalNumber.includes(deferred) &&
      (tab === "assigned"
        ? Boolean(item.assignment)
        : tab === "inventory"
          ? true
          : false),
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Global inventory"
        title="DID management"
        description="Provision numbers globally, then assign each DID to exactly one customer before configuring its route."
      />
      <div className="tabs" role="tablist">
        {["assigned", "inventory", "provision"].map((item) => (
          <button
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            onClick={() => setTab(item)}
            key={item}
          >
            {item[0].toUpperCase() + item.slice(1)}
            {item === "assigned" && (
              <span>
                {resource.data?.filter((number) => Boolean(number.assignment))
                  .length || 0}
              </span>
            )}
          </button>
        ))}
      </div>
      {tab === "provision" ? (
        <ProvisionNumbers notify={notify} onSaved={resource.reload} />
      ) : (
        <section className="panel table-panel">
          <Toolbar
            query={query}
            onQuery={setQuery}
            placeholder="Search DID"
            extra={
              <div className="inventory-count">{filtered.length} numbers</div>
            }
          />
          <DataState
            loading={resource.loading}
            error={resource.error}
            empty={!filtered.length}
            onRetry={resource.reload}
          >
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>DID</th>
                    <th>Customer</th>
                    <th>Provider / carrier</th>
                    <th>Destination</th>
                    <th>Package</th>
                    <th>Tags</th>
                    <th>Media</th>
                    <th>Status</th>
                    <th>Admin control</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((number) => (
                    <tr key={number.id}>
                      <td>
                        <strong className="mono">
                          {number.displayNumber || number.canonicalNumber}
                        </strong>
                        <small className="table-sub">
                          {number.countryCode || "Global"} {number.region || ""}
                        </small>
                      </td>
                      <td>
                        {number.assignment?.customer?.name || "Unassigned"}
                      </td>
                      <td>{String(number.metadata?.provider || "—")}</td>
                      <td>{number.assignment ? "Customer routing" : "—"}</td>
                      <td>{String(number.metadata?.package || "—")}</td>
                      <td>{String(number.metadata?.tags || "—")}</td>
                      <td>{String(number.metadata?.rtpProxy || "Direct")}</td>
                      <td>
                        <StatusBadge
                          active={didStatusLabel(number) === 'Active' || didStatusLabel(number) === 'Available'}
                          label={didStatusLabel(number)}
                        />
                        {number.subscriptionDisabled && number.manuallyDisabled && <small className="table-sub">Also disabled by Super Admin</small>}
                      </td>
                      <td>
                        <div className="did-row-toggle">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={!number.manuallyDisabled}
                            aria-label={`${number.manuallyDisabled ? 'Enable' : 'Disable'} DID ${number.canonicalNumber} by Super Admin`}
                            title={number.subscriptionDisabled ? 'Subscription deactivation remains in effect until the subscription API enables this DID' : undefined}
                            className={!number.manuallyDisabled ? 'checked' : ''}
                            disabled={togglingId === number.id}
                            onClick={() => void toggleDid(number)}
                          ><span /></button>
                          <span>{togglingId === number.id ? 'Updating…' : number.manuallyDisabled ? 'Off' : 'On'}</span>
                        </div>
                      </td>
                      <td>
                        {!number.assignment && number.status === "AVAILABLE" && !number.manuallyDisabled && !number.subscriptionDisabled ? (
                          <button
                            className="button ghost compact"
                            onClick={() => setAssigning(number)}
                          >
                            <UserRound size={15} /> Assign
                          </button>
                        ) : number.assignment ? (
                          <Link
                            className="icon-button"
                            to={`/management/customers/${number.assignment?.customerId}/did`}
                            aria-label="Open customer DID"
                          >
                            <ChevronRight size={17} />
                          </Link>
                        ) : <span className="table-sub">Enable to assign</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DataState>
        </section>
      )}
      {assigning && (
        <AssignNumberModal
          number={assigning}
          customers={customers.data || []}
          notify={notify}
          onClose={() => setAssigning(null)}
          onSaved={() => {
            setAssigning(null);
            void resource.reload();
          }}
        />
      )}
    </div>
  );
}

function ProvisionNumbers({
  notify,
  onSaved,
}: {
  notify: (message: string, type?: Toast["type"]) => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [saving, setSaving] = useState(false);
  const [single, setSingle] = useState({
    canonicalNumber: "",
    displayNumber: "",
    numberType: "DID",
    countryCode: "",
    region: "",
  });
  const [bulk, setBulk] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (mode === "single") {
        await api.post(
          "/number-inventory",
          Object.fromEntries(
            Object.entries(single).filter(([, value]) => value),
          ),
        );
        notify("Number added to global inventory");
        setSingle({
          canonicalNumber: "",
          displayNumber: "",
          numberType: "DID",
          countryCode: "",
          region: "",
        });
      } else {
        const numbers = bulk
          .split(/[\n,]+/)
          .map((value) => value.trim())
          .filter(Boolean);
        const results = await Promise.allSettled(
          numbers.map((canonicalNumber) =>
            api.post("/number-inventory", {
              canonicalNumber,
              numberType: "DID",
            }),
          ),
        );
        const failed = results.filter(
          (item) => item.status === "rejected",
        ).length;
        notify(
          `${results.length - failed} numbers provisioned${failed ? `; ${failed} failed` : ""}`,
          failed ? "error" : "success",
        );
        setBulk("");
      }
      await onSaved();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to provision numbers",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="panel provision-panel">
      <div className="provision-copy">
        <span className="provision-icon">
          <Upload />
        </span>
        <span className="eyebrow">Global storage first</span>
        <h2>Provision number inventory</h2>
        <p>
          A DID must exist here before it can be assigned to a customer.
          Provisioning does not create a route.
        </p>
        <div className="flow-vertical">
          <span>
            <strong>1</strong> Add inventory
          </span>
          <span>
            <strong>2</strong> Assign customer
          </span>
          <span>
            <strong>3</strong> Configure destination
          </span>
        </div>
      </div>
      <div className="provision-form">
        <div className="segmented">
          <button
            className={mode === "single" ? "active" : ""}
            onClick={() => setMode("single")}
          >
            Single number
          </button>
          <button
            className={mode === "bulk" ? "active" : ""}
            onClick={() => setMode("bulk")}
          >
            Bulk upload
          </button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          {mode === "single" ? (
            <>
              <Field label="Canonical number" hint="Digits; optional leading +">
                <input
                  required
                  pattern="\+?[0-9]{3,39}"
                  placeholder="8005551234"
                  value={single.canonicalNumber}
                  onChange={(e) =>
                    setSingle({ ...single, canonicalNumber: e.target.value })
                  }
                />
              </Field>
              <Field label="Display number">
                <input
                  placeholder="+1 800 555 1234"
                  value={single.displayNumber}
                  onChange={(e) =>
                    setSingle({ ...single, displayNumber: e.target.value })
                  }
                />
              </Field>
              <Field label="Number type">
                <select
                  value={single.numberType}
                  onChange={(e) =>
                    setSingle({ ...single, numberType: e.target.value })
                  }
                >
                  <option>DID</option>
                  <option>TFN</option>
                </select>
              </Field>
              <Field label="Country code">
                <input
                  maxLength={3}
                  placeholder="US"
                  value={single.countryCode}
                  onChange={(e) =>
                    setSingle({
                      ...single,
                      countryCode: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
              <Field label="Region">
                <input
                  value={single.region}
                  onChange={(e) =>
                    setSingle({ ...single, region: e.target.value })
                  }
                />
              </Field>
            </>
          ) : (
            <Field
              label="Numbers"
              hint="One number per line or comma-separated"
              full
            >
              <textarea
                required
                rows={11}
                placeholder={"8005551001\n8005551002\n8005551003"}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
            </Field>
          )}
          <div className="form-actions full">
            <button className="button primary" disabled={saving}>
              {saving && <LoaderCircle className="spin" size={16} />}{" "}
              {mode === "single" ? "Add to inventory" : "Provision numbers"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function AssignNumberModal({
  number,
  customers,
  notify,
  onClose,
  onSaved,
}: {
  number: InventoryNumber;
  customers: Customer[];
  notify: (message: string, type?: Toast["type"]) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post(`/number-inventory/${number.id}/assign`, {
        customerId,
        label: label || undefined,
      });
      notify(`${number.canonicalNumber} assigned`);
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to assign number",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Assign DID"
      description={`Link ${number.canonicalNumber} to a customer. The customer can then receive number-level routing settings.`}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <Field label="Customer">
          <select
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Select an active customer</option>
            {customers
              .filter((item) => item.isActive)
              .map((customer) => (
                <option value={customer.id} key={customer.id}>
                  {customer.name} · {customer.accountCode}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Label">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Support line"
          />
        </Field>
        <FormActions onClose={onClose} saving={saving} label="Assign number" />
      </form>
    </Modal>
  );
}

function GlobalIpAuth({
  notify,
}: {
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const resource = useResource(
    () => api.get<SourceAuth[]>("/source-ip-auth"),
    [],
  );
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [editingEntry, setEditingEntry] = useState<SourceAuth | null>(null);
  const entries = (resource.data || []).filter((item) =>
    `${item.ipAddress} ${item.customer?.name || ""} ${item.carrier?.name || ""}`
      .toLowerCase()
      .includes(deferred.toLowerCase()),
  );
  const remove = async (entry: SourceAuth) => {
    if (
      !window.confirm(`Remove ${entry.ipAddress} from source authentication?`)
    )
      return;
    try {
      if (entry.customerEndpoint?.id && entry.customerId) {
        await api.delete(
          `/customer-endpoints/${entry.customerEndpoint.id}`,
          entry.customerId,
        );
      } else if (entry.carrierEndpoint?.id && entry.carrierId) {
        await api.delete(
          `/carriers/${entry.carrierId}/endpoints/${entry.carrierEndpoint.id}`,
        );
      } else {
        await api.delete(`/source-ip-auth/${entry.id}`);
      }
      notify("Endpoint and source authentication removed");
      await resource.reload();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to remove source",
        "error",
      );
    }
  };
  return (
    <div className="page">
      <PageHeader
        eyebrow="Global identity registry"
        title="IP authentication"
        description="Every carrier and customer source the switch can identify. Ownership remains explicit and tenant-linked."
      />
      <section className="panel table-panel">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search IP, customer, or carrier"
        />
        <DataState
          loading={resource.loading}
          error={resource.error}
          empty={!entries.length}
          onRetry={resource.reload}
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Source type</th>
                  <th>Kamailio grp</th>
                  <th>IP address</th>
                  <th>Port</th>
                  <th>Endpoint</th>
                  <th>Direction</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const endpoint =
                    entry.customerEndpoint || entry.carrierEndpoint;
                  return (
                    <tr key={entry.id}>
                      <td>
                        <strong>
                          {entry.customer?.name ||
                            entry.carrier?.name ||
                            "Unknown owner"}
                        </strong>
                        <small className="table-sub">
                          {entry.customer?.accountCode || entry.carrier?.code}
                        </small>
                      </td>
                      <td>
                        <span className="type-badge">{entry.sourceType}</span>
                      </td>
                      <td className="mono">
                        {entry.kamailioGroup ??
                          (entry.sourceType === "CARRIER" ? 1 : 2)}
                      </td>
                      <td className="mono">{entry.ipAddress}</td>
                      <td className="mono">{entry.port || "Any"}</td>
                      <td>{endpoint?.name || "Identity only"}</td>
                      <td>{endpoint?.direction || "BOTH"}</td>
                      <td>
                        <StatusBadge active={entry.isActive} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            onClick={() => setEditingEntry(entry)}
                            aria-label="Edit source authentication"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button danger"
                            onClick={() => void remove(entry)}
                            aria-label="Remove source auth"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>
      {editingEntry && (
        <IpAuthenticationEditModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null);
            void resource.reload();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}

function IpAuthenticationEditModal({
  entry,
  onClose,
  onSaved,
  notify,
}: {
  entry: SourceAuth;
  onClose: () => void;
  onSaved: () => void;
  notify: (message: string, type?: Toast["type"]) => void;
}) {
  const endpoint = entry.customerEndpoint || entry.carrierEndpoint;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: endpoint?.name || "",
    ipAddress: entry.ipAddress,
    port: String(entry.port || 0),
    isActive: entry.isActive,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      ...(endpoint
        ? { name: form.name, host: form.ipAddress }
        : { ipAddress: form.ipAddress }),
      port: Number(form.port),
      isActive: form.isActive,
    };
    try {
      if (entry.customerEndpoint?.id && entry.customerId) {
        await api.patch(
          `/customer-endpoints/${entry.customerEndpoint.id}`,
          payload,
          entry.customerId,
        );
      } else if (entry.carrierEndpoint?.id && entry.carrierId) {
        await api.patch(
          `/carriers/${entry.carrierId}/endpoints/${entry.carrierEndpoint.id}`,
          payload,
        );
      } else {
        await api.patch(
          `/source-ip-auth/${entry.id}`,
          payload,
          entry.customerId || undefined,
        );
      }
      notify("IP authentication updated and Kamailio reloaded");
      onSaved();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to update IP authentication",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Edit IP authentication"
      description="The linked endpoint and Kamailio address cache are updated together."
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        {endpoint && (
          <Field label="Endpoint name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
        )}
        <Field label="IP address / host">
          <input
            required
            value={form.ipAddress}
            onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
          />
        </Field>
        <Field label="Port">
          <input
            required
            type="number"
            min={endpoint ? 1 : 0}
            max="65535"
            value={form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value })}
          />
        </Field>
        <Toggle
          label="Authentication is active"
          checked={form.isActive}
          onChange={(value) => setForm({ ...form, isActive: value })}
        />
        <FormActions
          onClose={onClose}
          saving={saving}
          label="Save authentication"
        />
      </form>
    </Modal>
  );
}

function GlobalRouting() {
  const resource = useResource(
    () => api.get<Route[]>("/switch-routes/global?direction=OUTBOUND"),
    [],
  );
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const routes = (resource.data || []).filter(
    (route) =>
      `${route.name} ${route.matchValue} ${route.customer?.name || ""}`
        .toLowerCase()
        .includes(deferred.toLowerCase()) && route.direction === "OUTBOUND",
  );
  return (
    <div className="page">
      <PageHeader
        eyebrow="Global outbound registry"
        title="Outbound routing"
        description="Read-only customer-to-carrier routes. Inbound routing belongs to assigned DID configuration."
        actions={
          <button className="button secondary" onClick={resource.reload}>
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />
      <section className="panel table-panel">
        <Toolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search outbound route, prefix, or customer"
        />
        <DataState
          loading={resource.loading}
          error={resource.error}
          empty={!routes.length}
          onRetry={resource.reload}
        >
          <RoutesTable
            routes={routes}
            actions={(route) => (
              <Link
                className="icon-button"
                to={`/management/customers/${route.customerId}/outbound-routing`}
                aria-label="Open customer outbound routing"
              >
                <ChevronRight size={17} />
              </Link>
            )}
          />
        </DataState>
      </section>
    </div>
  );
}

function ApiConnection() {
  const swagger = apiBaseUrl.replace(/\/api\/v1$/, "/api/docs");
  return (
    <div className="page">
      <PageHeader
        eyebrow="Developer tools"
        title="API connection"
        description="This console talks directly to the routing API. It does not send access tokens or own application authentication."
      />
      <div className="api-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Runtime</span>
              <h2>Frontend configuration</h2>
            </div>
          </div>
          <dl className="definition-list">
            <div>
              <dt>API base URL</dt>
              <dd className="mono">{apiBaseUrl}</dd>
            </div>
            <div>
              <dt>Customer context</dt>
              <dd className="mono">X-Customer-ID</dd>
            </div>
            <div>
              <dt>Authentication</dt>
              <dd>Handled by parent application; none here</dd>
            </div>
          </dl>
          <a
            className="button primary"
            href={swagger}
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={16} /> Open Swagger UI
          </a>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Testing workflow</span>
              <h2>No frontend required</h2>
            </div>
          </div>
          <ol className="testing-list">
            <li>
              <span>01</span>
              <div>
                <strong>Swagger UI</strong>
                <p>
                  Use the generated forms at the backend{" "}
                  <span className="mono">/api/docs</span> endpoint.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Bruno, Postman, or Insomnia</strong>
                <p>
                  Set the API base URL and add{" "}
                  <span className="mono">X-Customer-ID</span> for tenant routes.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Automated API tests</strong>
                <p>
                  Run the backend Jest suite for customer-context isolation and
                  route behavior.
                </p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}

function PlaceholderPage() {
  const location = useLocation();
  const title =
    location.pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ||
    "Module";
  return (
    <div className="page">
      <PageHeader
        eyebrow="Parent platform module"
        title={(title[0]?.toUpperCase() || "") + title.slice(1)}
        description="Navigation is reserved for the full billing platform."
      />
      <section className="panel">
        <div className="empty-state">
          <Boxes />
          <h3>Integration-ready placeholder</h3>
          <p>
            This screen requires an application API outside the billing switch
            routing boundary. It is intentionally not backed by fabricated data.
          </p>
          <Link className="button secondary" to="/">
            <ArrowRight size={16} /> Return to routing overview
          </Link>
        </div>
      </section>
    </div>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return createPortal(
    <div className="modal-layer" role="presentation">
      <button
        className="modal-scrim"
        onClick={onClose}
        aria-label="Close modal"
      />
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
function Field({
  label,
  hint,
  children,
  full = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
  title,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className="toggle-field full">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={checked ? "checked" : ""}
        disabled={disabled}
        title={title}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
      <span>{label}</span>
    </label>
  );
}
function FormActions({
  onClose,
  saving,
  label,
}: {
  onClose: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="form-actions full">
      <button type="button" className="button secondary" onClick={onClose}>
        Cancel
      </button>
      <button className="button primary" disabled={saving}>
        {saving && <LoaderCircle className="spin" size={16} />}
        {label}
      </button>
    </div>
  );
}

export default App;
