import {
  DatabaseZap,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import type {
  Customer,
  CustomerRecordingMapping,
  RecordingRateCard,
} from "../types";

type Notify = (message: string, type?: "success" | "error") => void;

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

export function RecordingRateCardsPage({ notify }: { notify: Notify }) {
  const [recordingCards, setRecordingCards] = useState<RecordingRateCard[]>([]);
  const [recordingMappings, setRecordingMappings] = useState<CustomerRecordingMapping[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingRecCardId, setEditingRecCardId] = useState<number | null>(null);
  const [recCardForm, setRecCardForm] = useState<RecCardForm>(emptyRecCardForm);
  const [recAssignment, setRecAssignment] = useState({ customerId: "", recRcId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recCards, recMappings, customerList] = await Promise.all([
        api.recordingRateCards.list().catch(() => []),
        api.recordingRateCards.listMappings().catch(() => []),
        api.get<Customer[]>("/customers").catch(() => []),
      ]);
      setRecordingCards(Array.isArray(recCards) ? recCards : []);
      setRecordingMappings(Array.isArray(recMappings) ? recMappings : []);
      setCustomers(Array.isArray(customerList) ? customerList : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load recording billing configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      activeIs: card.activeIs,
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
        pulse: Number(recCardForm.pulse),
        days: Number(recCardForm.days),
        activeIs: recCardForm.activeIs,
      };
      if (editingRecCardId !== null) {
        await api.recordingRateCards.update(editingRecCardId, payload);
        notify("Recording rate card updated", "success");
      } else {
        await api.recordingRateCards.create(payload);
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
      await api.recordingRateCards.update(card.id, { activeIs: nextActive });
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
      await api.recordingRateCards.delete(card.id);
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
      await api.recordingRateCards.assignToCustomer(
        recAssignment.customerId,
        Number(recAssignment.recRcId),
      );
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
      await api.recordingRateCards.removeFromCustomer(customerId);
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
          <div className="eyebrow">Recording billing configuration</div>
          <h1>Recording rate cards</h1>
          <p>Configure call recording pricing tiers, retention periods, and map customers to their active recording rate cards.</p>
        </div>
        <div className="page-actions">
          <button className="button secondary" disabled={saving || loading} onClick={() => void load()}>
            <RefreshCw size={16} className={saving || loading ? "spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      {loading ? (
        <LoadingPanel />
      ) : error ? (
        <ErrorPanel message={error} retry={load} />
      ) : (
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
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.accountCode} (ID: {c.id})
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
                    const matchedCustomer = customers.find(
                      (c) => c.id === mapping.custId || c.accountCode === mapping.custId
                    );
                    const matchedCard = recordingCards.find((rc) => rc.id === mapping.recRcId);
                    return (
                      <tr key={mapping.custId}>
                        <td>
                          <strong>{matchedCustomer ? matchedCustomer.name : mapping.custId}</strong>
                          <span className="table-sub mono">
                            {matchedCustomer ? `${matchedCustomer.accountCode} · ID: ${matchedCustomer.id}` : mapping.custId}
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
    </div>
  );
}

function LoadingPanel() {
  return (
    <section className="panel">
      <div className="loading-grid">
        <div />
        <div />
        <div />
        <div />
      </div>
    </section>
  );
}

function ErrorPanel({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return (
    <section className="panel">
      <div className="empty-state error-state">
        <DatabaseZap />
        <h3>Recording billing configuration unavailable</h3>
        <p>{message}</p>
        <button className="button secondary" onClick={() => void retry()}>
          <RefreshCw size={15} /> Retry
        </button>
      </div>
    </section>
  );
}
