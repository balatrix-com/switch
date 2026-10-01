import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HardDrive,
  LoaderCircle,
  Mic,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { CustomerRecordingMapping, RecordingRateCard } from "../types";

interface CustomerRecordingBillingSectionProps {
  customerId: string;
  customerAccountCode?: string;
  notify?: (message: string, type?: "success" | "error") => void;
  onUpdated?: () => void;
}

const rate = (value: string | number | undefined) =>
  Number(value || 0).toFixed(6);

export function CustomerRecordingBillingSection({
  customerId,
  customerAccountCode,
  notify,
  onUpdated,
}: CustomerRecordingBillingSectionProps) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [cards, setCards] = useState<RecordingRateCard[]>([]);
  const [assignedMapping, setAssignedMapping] =
    useState<CustomerRecordingMapping | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const [allCards, mappings] = await Promise.all([
        api.recordingRateCards.list().catch(() => [] as RecordingRateCard[]),
        api.recordingRateCards
          .listMappings()
          .catch(() => [] as CustomerRecordingMapping[]),
      ]);

      setCards(Array.isArray(allCards) ? allCards : []);

      const foundMapping = (Array.isArray(mappings) ? mappings : []).find(
        (m) =>
          m.custId === customerId ||
          (customerAccountCode && m.custId === customerAccountCode),
      );

      if (foundMapping) {
        setAssignedMapping(foundMapping);
        setSelectedCardId(String(foundMapping.recRcId));
      } else {
        setAssignedMapping(null);
        setSelectedCardId("");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load recording billing configuration",
      );
    } finally {
      setLoading(false);
    }
  }, [customerId, customerAccountCode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const assignedCard = cards.find((c) => c.id === assignedMapping?.recRcId);
  const isChanged =
    selectedCardId !== (assignedMapping ? String(assignedMapping.recRcId) : "");

  const handleSave = async () => {
    if (!selectedCardId) return;
    setSaving(true);
    try {
      await api.recordingRateCards.assignToCustomer(
        customerId,
        Number(selectedCardId),
      );
      notify?.("Recording rate card assigned successfully", "success");
      await loadData();
      onUpdated?.();
    } catch (err: unknown) {
      notify?.(
        err instanceof Error
          ? err.message
          : "Failed to assign recording rate card",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (
      !window.confirm(
        "Remove recording rate card assignment for this customer? Call recording billing will no longer be applied.",
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await api.recordingRateCards.removeFromCustomer(customerId);
      notify?.("Recording rate card assignment removed", "success");
      await loadData();
      onUpdated?.();
    } catch (err: unknown) {
      notify?.(
        err instanceof Error
          ? err.message
          : "Failed to remove recording rate card assignment",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel recording-billing-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Call Recording & Retention</span>
          <h2>
            <Mic size={18} style={{ verticalAlign: "middle", marginRight: 8, color: "var(--accent)" }} />
            Recording Billing
          </h2>
          <p>Configure call recording rate cards, per-pulse billing, and audio retention for this customer</p>
        </div>
        <div>
          {assignedCard ? (
            <span className="status-badge active">
              <span />
              Plan Assigned
            </span>
          ) : (
            <span className="status-badge inactive">
              <span />
              No Recording Plan
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)" }}>
          <LoaderCircle className="spin" size={22} style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
          <span>Loading recording billing settings...</span>
        </div>
      ) : error ? (
        <div className="settings-form">
          <div className="empty-state error-state" style={{ padding: "20px" }}>
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        </div>
      ) : (
        <form
          className="form-grid settings-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          {/* Active plan details overview */}
          {assignedCard ? (
            <div className="inheritance-note full" style={{ borderLeft: "3px solid var(--accent)", background: "rgba(16, 185, 129, 0.05)" }}>
              <HardDrive size={20} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                  <strong style={{ color: "var(--text)", fontSize: "0.85rem" }}>
                    Active Tier: {assignedCard.name}
                  </strong>
                  <span className={`status-badge ${assignedCard.activeIs === "Y" ? "active" : "inactive"}`} style={{ fontSize: "0.7rem", padding: "2px 8px" }}>
                    <span />
                    {assignedCard.activeIs === "Y" ? "Operational" : "Deactivated"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "18px", marginTop: "6px", flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-soft)" }}>
                  <span>Rate: <strong className="mono" style={{ color: "var(--accent)" }}>${rate(assignedCard.rate)}</strong> / {assignedCard.pulse || 60}s pulse</span>
                  <span>Retention: <strong className="mono">{assignedCard.days || 30} days</strong></span>
                </div>
              </div>
            </div>
          ) : (
            <div className="inheritance-note full" style={{ borderLeft: "3px solid var(--amber)", background: "rgba(245, 158, 11, 0.05)", borderColor: "rgba(245, 158, 11, 0.3)" }}>
              <AlertCircle size={20} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: "#fde68a", fontSize: "0.85rem" }}>No Recording Rate Card Assigned</strong>
                <span style={{ fontSize: "0.75rem", color: "var(--text-soft)", marginTop: "2px", display: "block" }}>
                  Recorded calls will not be charged or will use the platform default tier. Assign an active rate card below to activate billing.
                </span>
              </div>
            </div>
          )}

          {/* Super admin assignment control */}
          {isSuperAdmin ? (
            <>
              <div className="field full">
                <label htmlFor="recording-rate-card-select">
                  <span>Assign Recording Rate Card</span>
                </label>
                <select
                  id="recording-rate-card-select"
                  value={selectedCardId}
                  onChange={(e) => setSelectedCardId(e.target.value)}
                  disabled={saving}
                >
                  <option value="">-- Select Recording Rate Card --</option>
                  {cards
                    .filter(
                      (c) =>
                        c.activeIs === "Y" ||
                        (assignedMapping && c.id === assignedMapping.recRcId),
                    )
                    .map((card) => (
                      <option key={card.id} value={card.id}>
                        {card.name} (${rate(card.rate)} / {card.pulse || 60}s · {card.days || 30}d retention)
                        {card.activeIs !== "Y" ? " [Inactive]" : ""}
                      </option>
                    ))}
                </select>
                <small>
                  Select an active call recording pricing tier to apply to this customer's recordings.
                </small>
              </div>

              <div className="form-actions full" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  {assignedMapping && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={saving}
                      onClick={() => void handleRemove()}
                      title="Remove assigned recording rate card"
                      style={{ color: "var(--danger)", borderColor: "rgba(244, 63, 94, 0.3)" }}
                    >
                      <Trash2 size={15} />
                      <span>Remove Plan</span>
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="button primary"
                  disabled={saving || !selectedCardId || !isChanged}
                >
                  {saving && <LoaderCircle className="spin" size={16} />}
                  <span>Save Recording Plan</span>
                </button>
              </div>
            </>
          ) : (
            <div className="full" style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontStyle: "italic", padding: "8px 0" }}>
              To adjust recording pricing or retention policies, please reach out to a Super Administrator.
            </div>
          )}
        </form>
      )}
    </section>
  );
}
