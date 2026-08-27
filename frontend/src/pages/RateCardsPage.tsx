import {
  BadgeDollarSign,
  DatabaseZap,
  LoaderCircle,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
  Upload,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type {
  BillingMutation,
  Carrier,
  Customer,
  MinimumBillingMapping,
  MinimumBillingSetting,
  RateCard,
  RateCardItem,
  RateCardMapping,
  RateCardType,
} from "../types";

type Notify = (message: string, type?: "success" | "error") => void;
type Tab = "cards" | "assignments" | "minimum";
type CacheResult = BillingMutation<unknown>["cacheRefresh"];

type BillingData = {
  cards: RateCard[];
  customerMappings: RateCardMapping[];
  carrierMappings: RateCardMapping[];
  minimumSettings: MinimumBillingSetting[];
  minimumMappings: {
    customers: MinimumBillingMapping[];
    carriers: MinimumBillingMapping[];
  };
  customers: Customer[];
  carriers: Carrier[];
};

const blankData: BillingData = {
  cards: [],
  customerMappings: [],
  carrierMappings: [],
  minimumSettings: [],
  minimumMappings: { customers: [], carriers: [] },
  customers: [],
  carriers: [],
};

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      fields.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  fields.push(value.trim());
  return fields;
}

function parseRateCardCsv(text: string): RateCardItem[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV must contain a header and at least one rate row");
  const headers = splitCsvLine(lines[0]).map((value) => value.toLowerCase().replaceAll(" ", "_"));
  const find = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const prefixIndex = find("prefix", "destination_prefix");
  const directionIndex = find("direction");
  const rateIndex = find("rate_per_minute", "rate", "sell_rate", "cost_rate");
  if (prefixIndex < 0 || directionIndex < 0 || rateIndex < 0) {
    throw new Error("Required CSV headers: prefix, direction, rate_per_minute");
  }
  const descriptionIndex = find("description", "destination");
  const priorityIndex = find("priority");
  const fromIndex = find("effective_from");
  const toIndex = find("effective_to");
  return lines.slice(1).map((line, rowIndex) => {
    const cells = splitCsvLine(line);
    const direction = cells[directionIndex]?.toUpperCase();
    if (direction !== "INBOUND" && direction !== "OUTBOUND") {
      throw new Error(`Row ${rowIndex + 2}: direction must be INBOUND or OUTBOUND`);
    }
    if (cells[rateIndex] === "" || Number.isNaN(Number(cells[rateIndex]))) {
      throw new Error(`Row ${rowIndex + 2}: rate_per_minute must be numeric`);
    }
    return {
      prefix: cells[prefixIndex] || "*",
      direction,
      ratePerMinute: cells[rateIndex],
      description: descriptionIndex >= 0 ? cells[descriptionIndex] || undefined : undefined,
      priority: priorityIndex >= 0 && cells[priorityIndex] ? Number(cells[priorityIndex]) : 100,
      effectiveFrom: fromIndex >= 0 ? cells[fromIndex] || undefined : undefined,
      effectiveTo: toIndex >= 0 ? cells[toIndex] || undefined : undefined,
      isActive: true,
    };
  });
}

export function RateCardsPage({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<Tab>("cards");
  const [data, setData] = useState<BillingData>(blankData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastCache, setLastCache] = useState<CacheResult | null>(null);
  const [cardForm, setCardForm] = useState({
    name: "", type: "CUSTOMER" as RateCardType, currency: "USD", description: "",
    defaultMinimumBillingSettingId: "",
  });
  const [uploadCardId, setUploadCardId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [customerAssignment, setCustomerAssignment] = useState({ ownerId: "", rateCardId: "" });
  const [carrierAssignment, setCarrierAssignment] = useState({ ownerId: "", rateCardId: "" });
  const [minimumForm, setMinimumForm] = useState({
    name: "", party: "CUSTOMER" as "CUSTOMER" | "VENDOR",
    initialIncrementSeconds: "60", incrementSeconds: "60", description: "",
  });
  const [customerMinimum, setCustomerMinimum] = useState({ ownerId: "", settingId: "" });
  const [carrierMinimum, setCarrierMinimum] = useState({ ownerId: "", settingId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cards, customerMappings, carrierMappings, minimumSettings, minimumMappings, customers, carriers] =
        await Promise.all([
          api.get<RateCard[]>("/rate-cards"),
          api.get<RateCardMapping[]>("/rate-card-mappings/customers"),
          api.get<RateCardMapping[]>("/rate-card-mappings/carriers"),
          api.get<MinimumBillingSetting[]>("/minimum-billing/settings"),
          api.get<BillingData["minimumMappings"]>("/minimum-billing/mappings"),
          api.get<Customer[]>("/customers"),
          api.get<Carrier[]>("/carriers"),
        ]);
      setData({ cards, customerMappings, carrierMappings, minimumSettings, minimumMappings, customers, carriers });
      setUploadCardId((current) => current || cards[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load billing configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reportMutation = useCallback((result: BillingMutation<unknown>, action: string) => {
    setLastCache(result.cacheRefresh);
    if (result.cacheRefresh.status === "success") notify(`${action}. Billing cache refreshed.`);
    else notify(`${action}, but cache refresh failed: ${result.cacheRefresh.message}`, "error");
  }, [notify]);

  const mutate = async (action: () => Promise<BillingMutation<unknown>>, message: string) => {
    setSaving(true);
    try {
      reportMutation(await action(), message);
      await load();
      return true;
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : `${message} failed`, "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const createCard = (event: FormEvent) => {
    event.preventDefault();
    void mutate(
      () => api.post("/rate-cards", {
        ...cardForm,
        description: cardForm.description || undefined,
        defaultMinimumBillingSettingId: cardForm.defaultMinimumBillingSettingId || undefined,
      }),
      "Rate card created",
    ).then((saved) => {
      if (saved) setCardForm((current) => ({ ...current, name: "", description: "" }));
    });
  };

  const uploadRates = async (event: FormEvent) => {
    event.preventDefault();
    if (!uploadCardId || !uploadFile) return notify("Select a rate card and CSV file", "error");
    try {
      const items = parseRateCardCsv(await uploadFile.text());
      const saved = await mutate(
        () => api.post(`/rate-cards/${uploadCardId}/upload`, {
          fileName: uploadFile.name, replaceExisting, items,
        }),
        `${items.length} rates uploaded`,
      );
      if (saved) setUploadFile(null);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Unable to read CSV", "error");
    }
  };

  const createMinimum = (event: FormEvent) => {
    event.preventDefault();
    void mutate(
      () => api.post("/minimum-billing/settings", {
        ...minimumForm,
        initialIncrementSeconds: Number(minimumForm.initialIncrementSeconds),
        incrementSeconds: Number(minimumForm.incrementSeconds),
        description: minimumForm.description || undefined,
      }),
      "Minimum billing profile created",
    ).then((saved) => {
      if (saved) setMinimumForm((current) => ({ ...current, name: "", description: "" }));
    });
  };

  const customerCards = useMemo(() => data.cards.filter((card) => card.type === "CUSTOMER" && card.isActive), [data.cards]);
  const vendorCards = useMemo(() => data.cards.filter((card) => card.type === "VENDOR" && card.isActive), [data.cards]);
  const customerMinimumProfiles = data.minimumSettings.filter((setting) => setting.party === "CUSTOMER" && setting.isActive);
  const carrierMinimumProfiles = data.minimumSettings.filter((setting) => setting.party === "VENDOR" && setting.isActive);

  return (
    <div className="page billing-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Billing configuration</div>
          <h1>Rate cards & minimum billing</h1>
          <p>Manage customer sell rates and carrier cost rates independently. Every saved change requests a billing-engine cache refresh.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" disabled={saving} onClick={() => void mutate(
            async () => ({ data: null, cacheRefresh: await api.post<CacheResult>("/billing/cache/refresh", {}) }),
            "Cache refreshed",
          )}>
            <RefreshCw size={16} className={saving ? "spin" : ""} /> Refresh cache
          </button>
        </div>
      </header>

      {lastCache && (
        <div className={`cache-banner ${lastCache.status}`} role="status">
          <DatabaseZap size={17} />
          <span><strong>Cache {lastCache.status}</strong>{lastCache.message}</span>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Billing sections">
        <button className={tab === "cards" ? "active" : ""} onClick={() => setTab("cards")}><BadgeDollarSign size={15} /> Rate cards <span>{data.cards.length}</span></button>
        <button className={tab === "assignments" ? "active" : ""} onClick={() => setTab("assignments")}><UsersRound size={15} /> Assignments <span>{data.customerMappings.length + data.carrierMappings.length}</span></button>
        <button className={tab === "minimum" ? "active" : ""} onClick={() => setTab("minimum")}><Settings2 size={15} /> Minimum billing <span>{data.minimumSettings.length}</span></button>
      </div>

      {loading ? <LoadingPanel /> : error ? <ErrorPanel message={error} retry={load} /> : (
        <>
          {tab === "cards" && (
            <div className="billing-grid">
              <section className="panel table-panel billing-main-panel">
                <div className="panel-heading"><div><div className="eyebrow">Sell & cost catalogs</div><h2>Rate cards</h2></div></div>
                <div className="table-scroll">
                  <table>
                    <thead><tr><th>Name</th><th>Side</th><th>Currency</th><th>Rates</th><th>Mappings</th><th>Version</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {data.cards.map((card) => (
                        <tr key={card.id}>
                          <td><strong>{card.name}</strong><span className="table-sub">{card.description || "No description"}</span></td>
                          <td><span className={`billing-side ${card.type.toLowerCase()}`}>{card.type === "CUSTOMER" ? <UsersRound size={13} /> : <Server size={13} />}{card.type}</span></td>
                          <td className="mono">{card.currency}</td>
                          <td className="mono">{card._count?.items ?? 0}</td>
                          <td className="mono">{card.type === "CUSTOMER" ? card._count?.customerMappings : card._count?.carrierMappings}</td>
                          <td className="mono">v{card.version}</td>
                          <td><span className={`status-badge ${card.isActive ? "active" : "inactive"}`}><span />{card.isActive ? "Active" : "Inactive"}</span></td>
                          <td><div className="row-actions">
                            <button className="button ghost compact" disabled={saving} onClick={() => void mutate(
                              () => api.patch(`/rate-cards/${card.id}`, { isActive: !card.isActive }),
                              `Rate card ${card.isActive ? "disabled" : "enabled"}`,
                            )}>{card.isActive ? "Disable" : "Enable"}</button>
                            <button className="icon-button danger" aria-label={`Delete ${card.name}`} disabled={saving} onClick={() => {
                              if (window.confirm(`Delete rate card ${card.name}?`)) void mutate(() => api.delete(`/rate-cards/${card.id}`), "Rate card deleted");
                            }}><Trash2 size={15} /></button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.cards.length && <div className="inline-empty">No rate cards configured.</div>}
                </div>
              </section>
              <div className="billing-side-stack">
                <section className="panel billing-form-panel">
                  <div className="panel-heading"><div><div className="eyebrow">New catalog</div><h2>Create rate card</h2></div></div>
                  <form className="form-grid compact-form" onSubmit={createCard}>
                    <label className="field full"><span>Name</span><input required maxLength={120} value={cardForm.name} onChange={(e) => setCardForm({ ...cardForm, name: e.target.value })} /></label>
                    <label className="field"><span>Billing side</span><select value={cardForm.type} onChange={(e) => setCardForm({ ...cardForm, type: e.target.value as RateCardType, defaultMinimumBillingSettingId: "" })}><option value="CUSTOMER">Customer sell</option><option value="VENDOR">Carrier cost</option></select></label>
                    <label className="field"><span>Currency</span><input required minLength={3} maxLength={3} value={cardForm.currency} onChange={(e) => setCardForm({ ...cardForm, currency: e.target.value.toUpperCase() })} /></label>
                    <label className="field full"><span>Default minimum profile</span><select value={cardForm.defaultMinimumBillingSettingId} onChange={(e) => setCardForm({ ...cardForm, defaultMinimumBillingSettingId: e.target.value })}><option value="">System default (60/60)</option>{data.minimumSettings.filter((setting) => setting.party === (cardForm.type === "CUSTOMER" ? "CUSTOMER" : "VENDOR")).map((setting) => <option key={setting.id} value={setting.id}>{setting.name} ({setting.initialIncrementSeconds}/{setting.incrementSeconds})</option>)}</select></label>
                    <label className="field full"><span>Description</span><textarea rows={2} value={cardForm.description} onChange={(e) => setCardForm({ ...cardForm, description: e.target.value })} /></label>
                    <button className="button primary full" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />}Create rate card</button>
                  </form>
                </section>
                <section className="panel billing-form-panel">
                  <div className="panel-heading"><div><div className="eyebrow">CSV import</div><h2>Upload rates</h2></div></div>
                  <form className="form-grid compact-form" onSubmit={uploadRates}>
                    <label className="field full"><span>Rate card</span><select required value={uploadCardId} onChange={(e) => setUploadCardId(e.target.value)}><option value="">Select rate card</option>{data.cards.map((card) => <option key={card.id} value={card.id}>{card.name} · {card.type}</option>)}</select></label>
                    <label className="field full"><span>CSV file</span><input required type="file" accept=".csv,text/csv" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} /><small>Headers: prefix, direction, rate_per_minute. Optional: description, priority, effective_from, effective_to.</small></label>
                    <label className="check-row full"><input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} /> Replace existing rates in this card</label>
                    <button className="button secondary full" disabled={saving || !uploadFile}><Upload size={16} /> Upload CSV</button>
                  </form>
                </section>
              </div>
            </div>
          )}

          {tab === "assignments" && (
            <div className="two-column-panels">
              <AssignmentPanel icon={UsersRound} title="Customer sell rate card" ownerLabel="Customer" owners={data.customers.map((owner) => ({ id: owner.id, name: `${owner.name} · ${owner.accountCode}` }))} cards={customerCards} value={customerAssignment} onChange={setCustomerAssignment} saving={saving} onAssign={() => void mutate(() => api.put(`/rate-card-mappings/customers/${customerAssignment.ownerId}`, { rateCardId: customerAssignment.rateCardId }), "Customer rate card assigned")} mappings={data.customerMappings} kind="customer" onRemove={(id) => void mutate(() => api.delete(`/rate-card-mappings/customers/${id}`), "Customer rate card removed")} />
              <AssignmentPanel icon={Server} title="Carrier vendor rate card" ownerLabel="Carrier" owners={data.carriers.map((owner) => ({ id: owner.id, name: `${owner.name} · ${owner.code}` }))} cards={vendorCards} value={carrierAssignment} onChange={setCarrierAssignment} saving={saving} onAssign={() => void mutate(() => api.put(`/rate-card-mappings/carriers/${carrierAssignment.ownerId}`, { rateCardId: carrierAssignment.rateCardId }), "Carrier rate card assigned")} mappings={data.carrierMappings} kind="carrier" onRemove={(id) => void mutate(() => api.delete(`/rate-card-mappings/carriers/${id}`), "Carrier rate card removed")} />
            </div>
          )}

          {tab === "minimum" && (
            <div className="billing-grid">
              <section className="panel table-panel billing-main-panel">
                <div className="panel-heading"><div><div className="eyebrow">Billing pulses</div><h2>Minimum billing profiles</h2></div></div>
                <div className="table-scroll"><table><thead><tr><th>Name</th><th>Side</th><th>Initial</th><th>Next pulse</th><th>Mappings</th><th>Status</th><th /></tr></thead><tbody>{data.minimumSettings.map((setting) => <tr key={setting.id}><td><strong>{setting.name}</strong><span className="table-sub">{setting.description || "Reusable pulse profile"}</span></td><td><span className={`billing-side ${setting.party.toLowerCase()}`}>{setting.party}</span></td><td className="mono">{setting.initialIncrementSeconds}s</td><td className="mono">{setting.incrementSeconds}s</td><td className="mono">{setting.party === "CUSTOMER" ? setting._count?.customerMappings : setting._count?.carrierMappings}</td><td><span className={`status-badge ${setting.isActive ? "active" : "inactive"}`}><span />{setting.isActive ? "Active" : "Inactive"}</span></td><td><button className="icon-button danger" aria-label={`Delete ${setting.name}`} disabled={saving} onClick={() => { if (window.confirm(`Delete minimum profile ${setting.name}?`)) void mutate(() => api.delete(`/minimum-billing/settings/${setting.id}`), "Minimum profile deleted"); }}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
              </section>
              <div className="billing-side-stack">
                <section className="panel billing-form-panel">
                  <div className="panel-heading"><div><div className="eyebrow">New pulse rule</div><h2>Create profile</h2></div></div>
                  <form className="form-grid compact-form" onSubmit={createMinimum}>
                    <label className="field full"><span>Name</span><input required value={minimumForm.name} onChange={(e) => setMinimumForm({ ...minimumForm, name: e.target.value })} /></label>
                    <label className="field full"><span>Billing side</span><select value={minimumForm.party} onChange={(e) => setMinimumForm({ ...minimumForm, party: e.target.value as "CUSTOMER" | "VENDOR" })}><option value="CUSTOMER">Customer</option><option value="VENDOR">Vendor / carrier</option></select></label>
                    <label className="field"><span>Initial seconds</span><input required type="number" min="1" max="86400" value={minimumForm.initialIncrementSeconds} onChange={(e) => setMinimumForm({ ...minimumForm, initialIncrementSeconds: e.target.value })} /></label>
                    <label className="field"><span>Next pulse seconds</span><input required type="number" min="1" max="86400" value={minimumForm.incrementSeconds} onChange={(e) => setMinimumForm({ ...minimumForm, incrementSeconds: e.target.value })} /></label>
                    <label className="field full"><span>Description</span><textarea rows={2} value={minimumForm.description} onChange={(e) => setMinimumForm({ ...minimumForm, description: e.target.value })} /></label>
                    <button className="button primary full" disabled={saving}>Create profile</button>
                  </form>
                </section>
                <MinimumAssignment title="Customer minimum billing" owners={data.customers.map((owner) => ({ id: owner.id, name: owner.name }))} profiles={customerMinimumProfiles} value={customerMinimum} onChange={setCustomerMinimum} onAssign={() => void mutate(() => api.put(`/minimum-billing/customers/${customerMinimum.ownerId}`, { settingId: customerMinimum.settingId }), "Customer minimum billing assigned")} onRemove={(id) => void mutate(() => api.delete(`/minimum-billing/customers/${id}`), "Customer minimum billing override removed")} saving={saving} mappings={data.minimumMappings.customers} kind="customer" />
                <MinimumAssignment title="Carrier minimum billing" owners={data.carriers.map((owner) => ({ id: owner.id, name: owner.name }))} profiles={carrierMinimumProfiles} value={carrierMinimum} onChange={setCarrierMinimum} onAssign={() => void mutate(() => api.put(`/minimum-billing/carriers/${carrierMinimum.ownerId}`, { settingId: carrierMinimum.settingId }), "Carrier minimum billing assigned")} onRemove={(id) => void mutate(() => api.delete(`/minimum-billing/carriers/${id}`), "Carrier minimum billing override removed")} saving={saving} mappings={data.minimumMappings.carriers} kind="carrier" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssignmentPanel({ icon: Icon, title, ownerLabel, owners, cards, value, onChange, saving, onAssign, mappings, kind, onRemove }: {
  icon: LucideIcon; title: string; ownerLabel: string; owners: { id: string; name: string }[]; cards: RateCard[];
  value: { ownerId: string; rateCardId: string }; onChange: (value: { ownerId: string; rateCardId: string }) => void;
  saving: boolean; onAssign: () => void; mappings: RateCardMapping[]; kind: "customer" | "carrier"; onRemove: (id: string) => void;
}) {
  return <section className="panel table-panel"><div className="panel-heading"><div><div className="eyebrow">Effective mapping</div><h2><Icon size={17} /> {title}</h2></div></div><div className="assignment-form"><label className="field"><span>{ownerLabel}</span><select value={value.ownerId} onChange={(e) => onChange({ ...value, ownerId: e.target.value })}><option value="">Select {ownerLabel.toLowerCase()}</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label className="field"><span>Rate card</span><select value={value.rateCardId} onChange={(e) => onChange({ ...value, rateCardId: e.target.value })}><option value="">Select rate card</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · {card.currency}</option>)}</select></label><button className="button primary" disabled={saving || !value.ownerId || !value.rateCardId} onClick={onAssign}>Assign</button></div><div className="table-scroll"><table><thead><tr><th>{ownerLabel}</th><th>Rate card</th><th>Effective</th><th /></tr></thead><tbody>{mappings.map((mapping) => { const ownerId = kind === "customer" ? mapping.customerId! : mapping.carrierId!; return <tr key={ownerId}><td><strong>{kind === "customer" ? mapping.customer?.name : mapping.carrier?.name}</strong></td><td>{mapping.rateCard.name}<span className="table-sub">{mapping.rateCard.currency} · v{mapping.rateCard.version}</span></td><td className="mono">{new Date(mapping.effectiveFrom).toLocaleDateString()}</td><td><button className="icon-button danger" aria-label="Remove mapping" onClick={() => onRemove(ownerId)}><Trash2 size={15} /></button></td></tr>; })}</tbody></table>{!mappings.length && <div className="inline-empty">No mappings configured.</div>}</div></section>;
}

function MinimumAssignment({ title, owners, profiles, value, onChange, onAssign, onRemove, saving, mappings, kind }: {
  title: string; owners: { id: string; name: string }[]; profiles: MinimumBillingSetting[];
  value: { ownerId: string; settingId: string }; onChange: (value: { ownerId: string; settingId: string }) => void;
  onAssign: () => void; onRemove: (id: string) => void; saving: boolean; mappings: MinimumBillingMapping[]; kind: "customer" | "carrier";
}) {
  return <section className="panel billing-form-panel"><div className="panel-heading"><div><div className="eyebrow">Owner override</div><h2>{title}</h2></div></div><div className="form-grid compact-form"><label className="field"><span>{kind === "customer" ? "Customer" : "Carrier"}</span><select value={value.ownerId} onChange={(e) => onChange({ ...value, ownerId: e.target.value })}><option value="">Select owner</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label className="field"><span>Profile</span><select value={value.settingId} onChange={(e) => onChange({ ...value, settingId: e.target.value })}><option value="">Select profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} ({profile.initialIncrementSeconds}/{profile.incrementSeconds})</option>)}</select></label><button className="button secondary full" disabled={saving || !value.ownerId || !value.settingId} onClick={onAssign}>Save override</button><div className="mapping-summary full">{mappings.length ? mappings.map((mapping) => { const ownerId = kind === "customer" ? mapping.customerId! : mapping.carrierId!; return <span key={ownerId}><strong>{kind === "customer" ? mapping.customer?.name : mapping.carrier?.name}</strong>{mapping.setting.initialIncrementSeconds}/{mapping.setting.incrementSeconds}<button className="mapping-remove" aria-label="Remove override" disabled={saving} onClick={() => onRemove(ownerId)}>×</button></span>; }) : <small>No owner overrides; rate-card default or system 60/60 applies.</small>}</div></div></section>;
}

function LoadingPanel() { return <section className="panel"><div className="loading-grid"><div /><div /><div /><div /></div></section>; }
function ErrorPanel({ message, retry }: { message: string; retry: () => Promise<void> }) { return <section className="panel"><div className="empty-state error-state"><DatabaseZap /><h3>Billing configuration unavailable</h3><p>{message}</p><button className="button secondary" onClick={() => void retry()}><RefreshCw size={15} /> Retry</button></div></section>; }
