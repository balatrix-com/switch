import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeDollarSign,
  DatabaseZap,
  LoaderCircle,
  Mic,
  Pencil,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type {
  BillingMutation,
  Carrier,
  Customer,
  CustomerRecordingMapping,
  MinimumBillingMapping,
  MinimumBillingSetting,
  RateCard,
  RateCardMapping,
  RateCardType,
  RecordingRateCard,
} from "../types";

type Notify = (message: string, type?: "success" | "error") => void;
type Tab = "cards" | "assignments" | "minimum" | "recording";
type CacheResult = BillingMutation<unknown>["cacheRefresh"];

type BillingData = {
  cards: RateCard[];
  customerMappings: RateCardMapping[];
  carrierMappings: RateCardMapping[];
  minimumSettings: MinimumBillingSetting[];
  minimumMappings: { customers: MinimumBillingMapping[]; carriers: MinimumBillingMapping[] };
  customers: Customer[];
  carriers: Carrier[];
};

type CardForm = {
  name: string;
  type: RateCardType;
  currency: string;
  description: string;
  inboundRatePerMinute: string;
  inboundInitialIncrementSeconds: string;
  inboundIncrementSeconds: string;
  outboundRatePerMinute: string;
  outboundInitialIncrementSeconds: string;
  outboundIncrementSeconds: string;
};

const blankData: BillingData = {
  cards: [], customerMappings: [], carrierMappings: [], minimumSettings: [],
  minimumMappings: { customers: [], carriers: [] }, customers: [], carriers: [],
};

const emptyCardForm = (): CardForm => ({
  name: "",
  type: "CUSTOMER",
  currency: "USD",
  description: "",
  inboundRatePerMinute: "0.000000",
  inboundInitialIncrementSeconds: "60",
  inboundIncrementSeconds: "60",
  outboundRatePerMinute: "0.000000",
  outboundInitialIncrementSeconds: "60",
  outboundIncrementSeconds: "60",
});

type RecCardForm = {
  name: string;
  rate: string;
  pulse: string;
  days: string;
  activeIs: "Y" | "N";
};

const emptyRecCardForm = (): RecCardForm => ({
  name: "",
  rate: "0.050000",
  pulse: "60",
  days: "30",
  activeIs: "Y",
});

const rate = (value: string | number) => Number(value || 0).toFixed(6);

export function RateCardsPage({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<Tab>("cards");
  const [data, setData] = useState<BillingData>(blankData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastCache, setLastCache] = useState<CacheResult | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState<CardForm>(emptyCardForm);
  const [customerAssignment, setCustomerAssignment] = useState({ ownerId: "", rateCardId: "" });
  const [carrierAssignment, setCarrierAssignment] = useState({ ownerId: "", rateCardId: "" });
  const [minimumForm, setMinimumForm] = useState({
    name: "", party: "CUSTOMER" as "CUSTOMER" | "VENDOR",
    initialIncrementSeconds: "60", incrementSeconds: "60", description: "",
  });
  const [customerMinimum, setCustomerMinimum] = useState({ ownerId: "", settingId: "" });
  const [carrierMinimum, setCarrierMinimum] = useState({ ownerId: "", settingId: "" });
  const [recordingCards, setRecordingCards] = useState<RecordingRateCard[]>([]);
  const [recordingMappings, setRecordingMappings] = useState<CustomerRecordingMapping[]>([]);
  const [editingRecCardId, setEditingRecCardId] = useState<number | null>(null);
  const [recCardForm, setRecCardForm] = useState<RecCardForm>(emptyRecCardForm);
  const [recAssignment, setRecAssignment] = useState({ customerId: "", recRcId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        cards,
        customerMappings,
        carrierMappings,
        minimumSettings,
        minimumMappings,
        customers,
        carriers,
        recCards,
        recMappings,
      ] = await Promise.all([
        api.get<RateCard[]>("/rate-cards"),
        api.get<RateCardMapping[]>("/rate-card-mappings/customers"),
        api.get<RateCardMapping[]>("/rate-card-mappings/carriers"),
        api.get<MinimumBillingSetting[]>("/minimum-billing/settings"),
        api.get<BillingData["minimumMappings"]>("/minimum-billing/mappings"),
        api.get<Customer[]>("/customers"),
        api.get<Carrier[]>("/carriers"),
        api.get<RecordingRateCard[]>("/recording-rate-cards").catch(() => []),
        api.get<CustomerRecordingMapping[]>("/recording-rate-cards/mappings").catch(() => []),
      ]);
      setData({ cards, customerMappings, carrierMappings, minimumSettings, minimumMappings, customers, carriers });
      setRecordingCards(Array.isArray(recCards) ? recCards : []);
      setRecordingMappings(Array.isArray(recMappings) ? recMappings : []);
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

  const resetCardForm = () => {
    setEditingCardId(null);
    setCardForm(emptyCardForm());
  };

  const editCard = (card: RateCard) => {
    setEditingCardId(card.id);
    setCardForm({
      name: card.name,
      type: card.type,
      currency: card.currency,
      description: card.description || "",
      inboundRatePerMinute: rate(card.inboundRatePerMinute),
      inboundInitialIncrementSeconds: String(card.inboundInitialIncrementSeconds),
      inboundIncrementSeconds: String(card.inboundIncrementSeconds),
      outboundRatePerMinute: rate(card.outboundRatePerMinute),
      outboundInitialIncrementSeconds: String(card.outboundInitialIncrementSeconds),
      outboundIncrementSeconds: String(card.outboundIncrementSeconds),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveCard = (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: cardForm.name.trim(),
      ...(!editingCardId ? { type: cardForm.type } : {}),
      currency: cardForm.currency.toUpperCase(),
      description: cardForm.description || undefined,
      inboundRatePerMinute: cardForm.inboundRatePerMinute,
      inboundInitialIncrementSeconds: Number(cardForm.inboundInitialIncrementSeconds),
      inboundIncrementSeconds: Number(cardForm.inboundIncrementSeconds),
      outboundRatePerMinute: cardForm.outboundRatePerMinute,
      outboundInitialIncrementSeconds: Number(cardForm.outboundInitialIncrementSeconds),
      outboundIncrementSeconds: Number(cardForm.outboundIncrementSeconds),
    };
    void mutate(
      () => editingCardId
        ? api.patch(`/rate-cards/${editingCardId}`, payload)
        : api.post("/rate-cards", payload),
      editingCardId ? "Rate card updated" : "Rate card created",
    ).then((saved) => { if (saved) resetCardForm(); });
  };

  const createMinimum = (event: FormEvent) => {
    event.preventDefault();
    void mutate(() => api.post("/minimum-billing/settings", {
      ...minimumForm,
      initialIncrementSeconds: Number(minimumForm.initialIncrementSeconds),
      incrementSeconds: Number(minimumForm.incrementSeconds),
      description: minimumForm.description || undefined,
    }), "Minimum billing profile created").then((saved) => {
      if (saved) setMinimumForm((current) => ({ ...current, name: "", description: "" }));
    });
  };

  const customerCards = useMemo(() => data.cards.filter((card) => card.type === "CUSTOMER" && card.isActive), [data.cards]);
  const vendorCards = useMemo(() => data.cards.filter((card) => card.type === "VENDOR" && card.isActive), [data.cards]);
  const customerMinimumProfiles = data.minimumSettings.filter((setting) => setting.party === "CUSTOMER" && setting.isActive);
  const carrierMinimumProfiles = data.minimumSettings.filter((setting) => setting.party === "VENDOR" && setting.isActive);

  const resetRecCardForm = () => {
    setEditingRecCardId(null);
    setRecCardForm(emptyRecCardForm());
  };

  const editRecCard = (card: RecordingRateCard) => {
    setEditingRecCardId(card.id);
    setRecCardForm({
      name: card.name,
      rate: rate(card.rate),
      pulse: String(card.pulse || 60),
      days: String(card.days || 30),
      activeIs: card.activeIs || "Y",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveRecCard = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: recCardForm.name.trim(),
        rate: recCardForm.rate,
        pulse: Number(recCardForm.pulse) || 60,
        days: Number(recCardForm.days) || 30,
        activeIs: recCardForm.activeIs,
      };
      if (editingRecCardId !== null) {
        await api.patch(`/recording-rate-cards/${editingRecCardId}`, payload);
        notify("Recording rate card updated", "success");
      } else {
        await api.post("/recording-rate-cards", payload);
        notify("Recording rate card created", "success");
      }
      resetRecCardForm();
      await load();
    } catch (err: any) {
      notify(err instanceof Error ? err.message : "Failed to save recording rate card", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleRecCard = async (card: RecordingRateCard) => {
    setSaving(true);
    try {
      const nextActive = card.activeIs === "Y" ? "N" : "Y";
      await api.patch(`/recording-rate-cards/${card.id}`, { activeIs: nextActive });
      notify(`Recording rate card ${nextActive === "Y" ? "enabled" : "disabled"}`, "success");
      await load();
    } catch (err: any) {
      notify(err instanceof Error ? err.message : "Failed to update recording rate card status", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteRecCard = async (card: RecordingRateCard) => {
    if (!window.confirm(`Delete recording rate card "${card.name}"?`)) return;
    setSaving(true);
    try {
      await api.delete(`/recording-rate-cards/${card.id}`);
      notify("Recording rate card deleted", "success");
      if (editingRecCardId === card.id) resetRecCardForm();
      await load();
    } catch (err: any) {
      notify(err instanceof Error ? err.message : "Failed to delete recording rate card", "error");
    } finally {
      setSaving(false);
    }
  };

  const assignRecCard = async () => {
    if (!recAssignment.customerId || !recAssignment.recRcId) return;
    setSaving(true);
    try {
      await api.put(`/recording-rate-cards/customers/${recAssignment.customerId}`, {
        recRcId: Number(recAssignment.recRcId),
      });
      notify("Recording rate card assigned to customer", "success");
      setRecAssignment({ customerId: "", recRcId: "" });
      await load();
    } catch (err: any) {
      notify(err instanceof Error ? err.message : "Failed to assign recording rate card", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeRecAssignment = async (customerId: string) => {
    if (!window.confirm("Remove recording rate card assignment for this customer?")) return;
    setSaving(true);
    try {
      await api.delete(`/recording-rate-cards/customers/${customerId}`);
      notify("Recording rate card assignment removed", "success");
      await load();
    } catch (err: any) {
      notify(err instanceof Error ? err.message : "Failed to remove recording assignment", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page billing-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Billing configuration</div>
          <h1>Flat rate cards</h1>
          <p>Set one inbound and one outbound per-minute rate directly in the UI for customer sell and carrier cost billing.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" disabled={saving} onClick={() => void mutate(
            async () => ({ data: null, cacheRefresh: await api.post<CacheResult>("/billing/cache/refresh", {}) }),
            "Cache refreshed",
          )}><RefreshCw size={16} className={saving ? "spin" : ""} /> Refresh cache</button>
        </div>
      </header>

      {lastCache && <div className={`cache-banner ${lastCache.status}`} role="status"><DatabaseZap size={17} /><span><strong>Cache {lastCache.status}</strong>{lastCache.message}</span></div>}

      <div className="tabs" role="tablist" aria-label="Billing sections">
        <button className={tab === "cards" ? "active" : ""} onClick={() => setTab("cards")}><BadgeDollarSign size={15} /> Rate cards <span>{data.cards.length}</span></button>
        <button className={tab === "assignments" ? "active" : ""} onClick={() => setTab("assignments")}><UsersRound size={15} /> Assignments <span>{data.customerMappings.length + data.carrierMappings.length}</span></button>
        <button className={tab === "minimum" ? "active" : ""} onClick={() => setTab("minimum")}><Settings2 size={15} /> Minimum overrides <span>{data.minimumSettings.length}</span></button>
        <button className={tab === "recording" ? "active" : ""} onClick={() => setTab("recording")}><Mic size={15} /> Recording rate cards <span>{recordingCards.length}</span></button>
      </div>

      {loading ? <LoadingPanel /> : error ? <ErrorPanel message={error} retry={load} /> : <>
        {tab === "cards" && <div className="billing-grid flat-card-layout">
          <section className="panel table-panel billing-main-panel">
            <div className="panel-heading"><div><div className="eyebrow">Sell & cost catalogs</div><h2>Configured rate cards</h2></div></div>
            <div className="table-scroll"><table><thead><tr><th>Name</th><th>Side</th><th>Inbound</th><th>Outbound</th><th>Mappings</th><th>Version</th><th>Status</th><th /></tr></thead><tbody>
              {data.cards.map((card) => <tr key={card.id}>
                <td><strong>{card.name}</strong><span className="table-sub">{card.currency} · {card.description || "Flat direction rates"}</span></td>
                <td><span className={`billing-side ${card.type.toLowerCase()}`}>{card.type === "CUSTOMER" ? <UsersRound size={13} /> : <Server size={13} />}{card.type}</span></td>
                <td><strong className="mono">{rate(card.inboundRatePerMinute)}/min</strong><span className="table-sub mono">{card.inboundInitialIncrementSeconds}/{card.inboundIncrementSeconds} sec</span></td>
                <td><strong className="mono">{rate(card.outboundRatePerMinute)}/min</strong><span className="table-sub mono">{card.outboundInitialIncrementSeconds}/{card.outboundIncrementSeconds} sec</span></td>
                <td className="mono">{card.type === "CUSTOMER" ? card._count?.customerMappings : card._count?.carrierMappings}</td>
                <td className="mono">v{card.version}</td>
                <td><span className={`status-badge ${card.isActive ? "active" : "inactive"}`}><span />{card.isActive ? "Active" : "Inactive"}</span></td>
                <td><div className="row-actions">
                  <button className="icon-button" aria-label={`Edit ${card.name}`} disabled={saving} onClick={() => editCard(card)}><Pencil size={15} /></button>
                  <button className="button ghost compact" disabled={saving} onClick={() => void mutate(() => api.patch(`/rate-cards/${card.id}`, { isActive: !card.isActive }), `Rate card ${card.isActive ? "disabled" : "enabled"}`)}>{card.isActive ? "Disable" : "Enable"}</button>
                  <button className="icon-button danger" aria-label={`Delete ${card.name}`} disabled={saving} onClick={() => { if (window.confirm(`Delete rate card ${card.name}?`)) void mutate(() => api.delete(`/rate-cards/${card.id}`), "Rate card deleted"); }}><Trash2 size={15} /></button>
                </div></td>
              </tr>)}</tbody></table>{!data.cards.length && <div className="inline-empty">No rate cards configured. Create the first card using the form.</div>}</div>
          </section>

          <section className="panel billing-form-panel flat-rate-editor">
            <div className="panel-heading"><div><div className="eyebrow">{editingCardId ? "Editing configuration" : "New configuration"}</div><h2>{editingCardId ? "Edit rate card" : "Create rate card"}</h2></div>{editingCardId && <button className="icon-button" aria-label="Cancel editing" onClick={resetCardForm}><X size={18} /></button>}</div>
            <form className="form-grid compact-form" onSubmit={saveCard}>
              <label className="field full"><span>Name</span><input required maxLength={120} value={cardForm.name} onChange={(event) => setCardForm({ ...cardForm, name: event.target.value })} /></label>
              <label className="field"><span>Billing side</span><select disabled={Boolean(editingCardId)} value={cardForm.type} onChange={(event) => setCardForm({ ...cardForm, type: event.target.value as RateCardType })}><option value="CUSTOMER">Customer sell</option><option value="VENDOR">Carrier cost</option></select><small>Customer cards calculate revenue; carrier cards calculate cost.</small></label>
              <label className="field"><span>Currency</span><input required minLength={3} maxLength={3} value={cardForm.currency} onChange={(event) => setCardForm({ ...cardForm, currency: event.target.value.toUpperCase() })} /></label>

              <fieldset className="rate-direction-card inbound full">
                <legend><ArrowDownLeft size={16} /> Inbound billing</legend>
                <div className="rate-fields">
                  <label className="field"><span>Rate per minute</span><input required type="number" min="0" step="0.000001" value={cardForm.inboundRatePerMinute} onChange={(event) => setCardForm({ ...cardForm, inboundRatePerMinute: event.target.value })} /><small>Flat rate for every inbound call.</small></label>
                  <label className="field"><span>Initial seconds</span><input required type="number" min="1" max="86400" value={cardForm.inboundInitialIncrementSeconds} onChange={(event) => setCardForm({ ...cardForm, inboundInitialIncrementSeconds: event.target.value })} /><small>Minimum billed after answer.</small></label>
                  <label className="field"><span>Next pulse</span><input required type="number" min="1" max="86400" value={cardForm.inboundIncrementSeconds} onChange={(event) => setCardForm({ ...cardForm, inboundIncrementSeconds: event.target.value })} /><small>Rounding block after the initial period.</small></label>
                </div>
              </fieldset>

              <fieldset className="rate-direction-card outbound full">
                <legend><ArrowUpRight size={16} /> Outbound billing</legend>
                <div className="rate-fields">
                  <label className="field"><span>Rate per minute</span><input required type="number" min="0" step="0.000001" value={cardForm.outboundRatePerMinute} onChange={(event) => setCardForm({ ...cardForm, outboundRatePerMinute: event.target.value })} /><small>Flat rate for every outbound call.</small></label>
                  <label className="field"><span>Initial seconds</span><input required type="number" min="1" max="86400" value={cardForm.outboundInitialIncrementSeconds} onChange={(event) => setCardForm({ ...cardForm, outboundInitialIncrementSeconds: event.target.value })} /><small>Minimum billed after answer.</small></label>
                  <label className="field"><span>Next pulse</span><input required type="number" min="1" max="86400" value={cardForm.outboundIncrementSeconds} onChange={(event) => setCardForm({ ...cardForm, outboundIncrementSeconds: event.target.value })} /><small>Rounding block after the initial period.</small></label>
                </div>
              </fieldset>

              <label className="field full"><span>Description</span><textarea rows={2} value={cardForm.description} onChange={(event) => setCardForm({ ...cardForm, description: event.target.value })} /></label>
              <div className="form-actions full">{editingCardId && <button type="button" className="button secondary" onClick={resetCardForm}>Cancel</button>}<button className="button primary" disabled={saving}>{saving && <LoaderCircle className="spin" size={16} />}{editingCardId ? "Save rate card" : "Create rate card"}</button></div>
            </form>
          </section>
        </div>}

        {tab === "assignments" && <div className="two-column-panels">
          <AssignmentPanel icon={UsersRound} title="Customer sell rate card" ownerLabel="Customer" owners={data.customers.map((owner) => ({ id: owner.id, name: `${owner.name} · ${owner.accountCode}` }))} cards={customerCards} value={customerAssignment} onChange={setCustomerAssignment} saving={saving} onAssign={() => void mutate(() => api.put(`/rate-card-mappings/customers/${customerAssignment.ownerId}`, { rateCardId: customerAssignment.rateCardId }), "Customer rate card assigned")} mappings={data.customerMappings} kind="customer" onRemove={(id) => void mutate(() => api.delete(`/rate-card-mappings/customers/${id}`), "Customer rate card removed")} />
          <AssignmentPanel icon={Server} title="Carrier cost rate card" ownerLabel="Carrier" owners={data.carriers.map((owner) => ({ id: owner.id, name: `${owner.name} · ${owner.code}` }))} cards={vendorCards} value={carrierAssignment} onChange={setCarrierAssignment} saving={saving} onAssign={() => void mutate(() => api.put(`/rate-card-mappings/carriers/${carrierAssignment.ownerId}`, { rateCardId: carrierAssignment.rateCardId }), "Carrier rate card assigned")} mappings={data.carrierMappings} kind="carrier" onRemove={(id) => void mutate(() => api.delete(`/rate-card-mappings/carriers/${id}`), "Carrier rate card removed")} />
        </div>}

        {tab === "minimum" && <div className="billing-grid">
          <section className="panel table-panel billing-main-panel"><div className="panel-heading"><div><div className="eyebrow">Optional owner overrides</div><h2>Minimum billing profiles</h2></div></div><div className="inheritance-note minimum-note"><Settings2 size={17} /><div><strong>Rate-card pulses are the default</strong><span>Only create an override when one customer or carrier must use a different pulse from the inbound/outbound values stored on its assigned card.</span></div></div><div className="table-scroll"><table><thead><tr><th>Name</th><th>Side</th><th>Initial</th><th>Next pulse</th><th>Mappings</th><th>Status</th><th /></tr></thead><tbody>{data.minimumSettings.map((setting) => <tr key={setting.id}><td><strong>{setting.name}</strong><span className="table-sub">{setting.description || "Reusable owner override"}</span></td><td><span className={`billing-side ${setting.party.toLowerCase()}`}>{setting.party}</span></td><td className="mono">{setting.initialIncrementSeconds}s</td><td className="mono">{setting.incrementSeconds}s</td><td className="mono">{setting.party === "CUSTOMER" ? setting._count?.customerMappings : setting._count?.carrierMappings}</td><td><span className={`status-badge ${setting.isActive ? "active" : "inactive"}`}><span />{setting.isActive ? "Active" : "Inactive"}</span></td><td><button className="icon-button danger" aria-label={`Delete ${setting.name}`} disabled={saving} onClick={() => { if (window.confirm(`Delete minimum profile ${setting.name}?`)) void mutate(() => api.delete(`/minimum-billing/settings/${setting.id}`), "Minimum profile deleted"); }}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div></section>
          <div className="billing-side-stack"><section className="panel billing-form-panel"><div className="panel-heading"><div><div className="eyebrow">New override</div><h2>Create minimum profile</h2></div></div><form className="form-grid compact-form" onSubmit={createMinimum}><label className="field full"><span>Name</span><input required value={minimumForm.name} onChange={(event) => setMinimumForm({ ...minimumForm, name: event.target.value })} /></label><label className="field full"><span>Billing side</span><select value={minimumForm.party} onChange={(event) => setMinimumForm({ ...minimumForm, party: event.target.value as "CUSTOMER" | "VENDOR" })}><option value="CUSTOMER">Customer</option><option value="VENDOR">Vendor / carrier</option></select></label><label className="field"><span>Initial seconds</span><input required type="number" min="1" max="86400" value={minimumForm.initialIncrementSeconds} onChange={(event) => setMinimumForm({ ...minimumForm, initialIncrementSeconds: event.target.value })} /></label><label className="field"><span>Next pulse seconds</span><input required type="number" min="1" max="86400" value={minimumForm.incrementSeconds} onChange={(event) => setMinimumForm({ ...minimumForm, incrementSeconds: event.target.value })} /></label><label className="field full"><span>Description</span><textarea rows={2} value={minimumForm.description} onChange={(event) => setMinimumForm({ ...minimumForm, description: event.target.value })} /></label><button className="button primary full" disabled={saving}>Create override</button></form></section>
            <MinimumAssignment title="Customer minimum override" owners={data.customers.map((owner) => ({ id: owner.id, name: owner.name }))} profiles={customerMinimumProfiles} value={customerMinimum} onChange={setCustomerMinimum} onAssign={() => void mutate(() => api.put(`/minimum-billing/customers/${customerMinimum.ownerId}`, { settingId: customerMinimum.settingId }), "Customer minimum billing assigned")} onRemove={(id) => void mutate(() => api.delete(`/minimum-billing/customers/${id}`), "Customer minimum override removed")} saving={saving} mappings={data.minimumMappings.customers} kind="customer" />
            <MinimumAssignment title="Carrier minimum override" owners={data.carriers.map((owner) => ({ id: owner.id, name: owner.name }))} profiles={carrierMinimumProfiles} value={carrierMinimum} onChange={setCarrierMinimum} onAssign={() => void mutate(() => api.put(`/minimum-billing/carriers/${carrierMinimum.ownerId}`, { settingId: carrierMinimum.settingId }), "Carrier minimum billing assigned")} onRemove={(id) => void mutate(() => api.delete(`/minimum-billing/carriers/${id}`), "Carrier minimum override removed")} saving={saving} mappings={data.minimumMappings.carriers} kind="carrier" />
          </div>
        </div>}

        {tab === "recording" && (
          <div className="recording-billing-flow" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="billing-grid flat-card-layout">
              {/* Table of Recording Rate Cards */}
              <section className="panel table-panel billing-main-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">Call recording plans</div>
                    <h2>Configured recording rate cards</h2>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Rate ($)</th>
                        <th>Pulse</th>
                        <th>Retention</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {recordingCards.map((card) => {
                        const isActive = card.activeIs === "Y";
                        return (
                          <tr key={card.id}>
                            <td>
                              <strong>{card.name}</strong>
                              <span className="table-sub">Plan #{card.id}</span>
                            </td>
                            <td>
                              <strong className="mono">${rate(card.rate)}</strong>
                              <span className="table-sub mono">per {card.pulse || 60}s</span>
                            </td>
                            <td className="mono">{card.pulse || 60}s</td>
                            <td className="mono">{card.days || 30} days</td>
                            <td>
                              <span className={`status-badge ${isActive ? "active" : "inactive"}`}>
                                <span />
                                {isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${card.name}`}
                                  disabled={saving}
                                  onClick={() => editRecCard(card)}
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  className="button ghost compact"
                                  disabled={saving}
                                  onClick={() => void toggleRecCard(card)}
                                >
                                  {isActive ? "Disable" : "Enable"}
                                </button>
                                <button
                                  className="icon-button danger"
                                  aria-label={`Delete ${card.name}`}
                                  disabled={saving}
                                  onClick={() => void deleteRecCard(card)}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!recordingCards.length && (
                    <div className="inline-empty">
                      No recording rate cards configured. Create the first card using the form.
                    </div>
                  )}
                </div>
              </section>

              {/* Form to Create/Edit Recording Rate Card */}
              <section className="panel billing-form-panel flat-rate-editor">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">
                      {editingRecCardId !== null ? "Editing recording card" : "New recording plan"}
                    </div>
                    <h2>
                      {editingRecCardId !== null ? "Edit recording rate card" : "Create recording rate card"}
                    </h2>
                  </div>
                  {editingRecCardId !== null && (
                    <button className="icon-button" aria-label="Cancel editing" onClick={resetRecCardForm}>
                      <X size={18} />
                    </button>
                  )}
                </div>
                <form className="form-grid compact-form" onSubmit={saveRecCard}>
                  <label className="field full">
                    <span>Plan Name *</span>
                    <input
                      required
                      maxLength={120}
                      placeholder="e.g. Standard Recording Plan"
                      value={recCardForm.name}
                      onChange={(e) => setRecCardForm({ ...recCardForm, name: e.target.value })}
                    />
                  </label>

                  <label className="field">
                    <span>Rate per pulse ($) *</span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.000001"
                      placeholder="0.050000"
                      value={recCardForm.rate}
                      onChange={(e) => setRecCardForm({ ...recCardForm, rate: e.target.value })}
                    />
                    <small>Charge per pulse block.</small>
                  </label>

                  <label className="field">
                    <span>Pulse duration (sec)</span>
                    <input
                      required
                      type="number"
                      min="1"
                      max="86400"
                      placeholder="60"
                      value={recCardForm.pulse}
                      onChange={(e) => setRecCardForm({ ...recCardForm, pulse: e.target.value })}
                    />
                    <small>Pulse in seconds (default: 60s).</small>
                  </label>

                  <label className="field">
                    <span>Retention duration (days)</span>
                    <input
                      required
                      type="number"
                      min="1"
                      max="3650"
                      placeholder="30"
                      value={recCardForm.days}
                      onChange={(e) => setRecCardForm({ ...recCardForm, days: e.target.value })}
                    />
                    <small>Retention period (default: 30 days).</small>
                  </label>

                  <label className="field">
                    <span>Active status</span>
                    <select
                      value={recCardForm.activeIs}
                      onChange={(e) => setRecCardForm({ ...recCardForm, activeIs: e.target.value as "Y" | "N" })}
                    >
                      <option value="Y">Active</option>
                      <option value="N">Inactive</option>
                    </select>
                    <small>Active status toggle.</small>
                  </label>

                  <div className="form-actions full">
                    {editingRecCardId !== null && (
                      <button type="button" className="button secondary" onClick={resetRecCardForm}>
                        Cancel
                      </button>
                    )}
                    <button className="button primary" disabled={saving}>
                      {saving && <LoaderCircle className="spin" size={16} />}
                      {editingRecCardId !== null ? "Save recording card" : "Create recording card"}
                    </button>
                  </div>
                </form>
              </section>
            </div>

            {/* Customer Recording Assignment Panel */}
            <section className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">Effective mapping</div>
                  <h2>
                    <UsersRound size={17} /> Customer recording rate card
                  </h2>
                </div>
              </div>
              <div className="assignment-form">
                <label className="field">
                  <span>Customer</span>
                  <select
                    value={recAssignment.customerId}
                    onChange={(e) => setRecAssignment({ ...recAssignment, customerId: e.target.value })}
                  >
                    <option value="">Select customer</option>
                    {data.customers.map((c) => (
                      <option key={c.id} value={c.accountCode || c.id}>
                        {c.name} · {c.accountCode}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Recording rate card</span>
                  <select
                    value={recAssignment.recRcId}
                    onChange={(e) => setRecAssignment({ ...recAssignment, recRcId: e.target.value })}
                  >
                    <option value="">Select recording rate card</option>
                    {recordingCards
                      .filter((rc) => rc.activeIs === "Y")
                      .map((rc) => (
                        <option key={rc.id} value={rc.id}>
                          {rc.name} (${rate(rc.rate)} / {rc.pulse || 60}s · {rc.days || 30}d retention)
                        </option>
                      ))}
                  </select>
                </label>

                <button
                  className="button primary"
                  disabled={saving || !recAssignment.customerId || !recAssignment.recRcId}
                  onClick={() => void assignRecCard()}
                >
                  Assign
                </button>
              </div>

              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Recording Plan</th>
                      <th>Rate / Pulse</th>
                      <th>Retention</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recordingMappings.map((mapping) => {
                      const matchedCustomer = data.customers.find(
                        (c) => c.accountCode === mapping.custId || c.id === mapping.custId
                      );
                      const matchedCard = recordingCards.find((rc) => rc.id === mapping.recRcId);
                      return (
                        <tr key={mapping.custId}>
                          <td>
                            <strong>{matchedCustomer ? matchedCustomer.name : mapping.custId}</strong>
                            <span className="table-sub mono">
                              {matchedCustomer ? matchedCustomer.accountCode : mapping.custId}
                            </span>
                          </td>
                          <td>
                            {matchedCard ? (
                              <>
                                <strong>{matchedCard.name}</strong>
                                <span className="table-sub">Plan #{matchedCard.id}</span>
                              </>
                            ) : (
                              <span className="mono">Plan #{mapping.recRcId}</span>
                            )}
                          </td>
                          <td className="mono">
                            {matchedCard ? (
                              <>${rate(matchedCard.rate)} / {matchedCard.pulse || 60}s</>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="mono">
                            {matchedCard ? `${matchedCard.days || 30} days` : "—"}
                          </td>
                          <td className="mono">
                            {mapping.updatedAt ? new Date(mapping.updatedAt).toLocaleDateString() : "—"}
                          </td>
                          <td>
                            <button
                              className="icon-button danger"
                              aria-label="Remove recording rate card assignment"
                              title="Remove assignment"
                              onClick={() => void removeRecAssignment(mapping.custId)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!recordingMappings.length && (
                  <div className="inline-empty">No customer recording assignments configured.</div>
                )}
              </div>
            </section>
          </div>
        )}
      </>}
    </div>
  );
}

function AssignmentPanel({ icon: Icon, title, ownerLabel, owners, cards, value, onChange, saving, onAssign, mappings, kind, onRemove }: {
  icon: LucideIcon; title: string; ownerLabel: string; owners: { id: string; name: string }[]; cards: RateCard[];
  value: { ownerId: string; rateCardId: string }; onChange: (value: { ownerId: string; rateCardId: string }) => void;
  saving: boolean; onAssign: () => void; mappings: RateCardMapping[]; kind: "customer" | "carrier"; onRemove: (id: string) => void;
}) {
  return <section className="panel table-panel"><div className="panel-heading"><div><div className="eyebrow">Effective mapping</div><h2><Icon size={17} /> {title}</h2></div></div><div className="assignment-form"><label className="field"><span>{ownerLabel}</span><select value={value.ownerId} onChange={(event) => onChange({ ...value, ownerId: event.target.value })}><option value="">Select {ownerLabel.toLowerCase()}</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label className="field"><span>Rate card</span><select value={value.rateCardId} onChange={(event) => onChange({ ...value, rateCardId: event.target.value })}><option value="">Select rate card</option>{cards.map((card) => <option key={card.id} value={card.id}>{card.name} · {card.currency}</option>)}</select></label><button className="button primary" disabled={saving || !value.ownerId || !value.rateCardId} onClick={onAssign}>Assign</button></div><div className="table-scroll"><table><thead><tr><th>{ownerLabel}</th><th>Rate card</th><th>Effective</th><th /></tr></thead><tbody>{mappings.map((mapping) => { const ownerId = kind === "customer" ? mapping.customerId! : mapping.carrierId!; return <tr key={ownerId}><td><strong>{kind === "customer" ? mapping.customer?.name : mapping.carrier?.name}</strong></td><td>{mapping.rateCard.name}<span className="table-sub">{mapping.rateCard.currency} · v{mapping.rateCard.version}</span></td><td className="mono">{new Date(mapping.effectiveFrom).toLocaleDateString()}</td><td><button className="icon-button danger" aria-label="Remove mapping" onClick={() => onRemove(ownerId)}><Trash2 size={15} /></button></td></tr>; })}</tbody></table>{!mappings.length && <div className="inline-empty">No mappings configured.</div>}</div></section>;
}

function MinimumAssignment({ title, owners, profiles, value, onChange, onAssign, onRemove, saving, mappings, kind }: {
  title: string; owners: { id: string; name: string }[]; profiles: MinimumBillingSetting[];
  value: { ownerId: string; settingId: string }; onChange: (value: { ownerId: string; settingId: string }) => void;
  onAssign: () => void; onRemove: (id: string) => void; saving: boolean; mappings: MinimumBillingMapping[]; kind: "customer" | "carrier";
}) {
  return <section className="panel billing-form-panel"><div className="panel-heading"><div><div className="eyebrow">Owner override</div><h2>{title}</h2></div></div><div className="form-grid compact-form"><label className="field"><span>{kind === "customer" ? "Customer" : "Carrier"}</span><select value={value.ownerId} onChange={(event) => onChange({ ...value, ownerId: event.target.value })}><option value="">Select owner</option>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label className="field"><span>Profile</span><select value={value.settingId} onChange={(event) => onChange({ ...value, settingId: event.target.value })}><option value="">Select profile</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} ({profile.initialIncrementSeconds}/{profile.incrementSeconds})</option>)}</select></label><button className="button secondary full" disabled={saving || !value.ownerId || !value.settingId} onClick={onAssign}>Save override</button><div className="mapping-summary full">{mappings.length ? mappings.map((mapping) => { const ownerId = kind === "customer" ? mapping.customerId! : mapping.carrierId!; return <span key={ownerId}><strong>{kind === "customer" ? mapping.customer?.name : mapping.carrier?.name}</strong>{mapping.setting.initialIncrementSeconds}/{mapping.setting.incrementSeconds}<button className="mapping-remove" aria-label="Remove override" disabled={saving} onClick={() => onRemove(ownerId)}>×</button></span>; }) : <small>No owner override; the assigned rate card’s direction-specific pulse applies.</small>}</div></div></section>;
}

function LoadingPanel() { return <section className="panel"><div className="loading-grid"><div /><div /><div /><div /></div></section>; }
function ErrorPanel({ message, retry }: { message: string; retry: () => Promise<void> }) { return <section className="panel"><div className="empty-state error-state"><DatabaseZap /><h3>Billing configuration unavailable</h3><p>{message}</p><button className="button secondary" onClick={() => void retry()}><RefreshCw size={15} /> Retry</button></div></section>; }
