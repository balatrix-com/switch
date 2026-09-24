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
            <Mic size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Recording Billing
          </h2>
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
        <div style={{ padding: "20px", textAlign: "center", color: "var(--muted)" }}>
          <LoaderCircle className="spin" size={20} style={{ display: "inline-block", marginRight: 8 }} />
          Loading recording billing settings...
        </div>
      ) : error ? (
        <div className="empty-state" style={{ color: "var(--danger)" }}>
          <AlertCircle size={18} style={{ verticalAlign: "middle", marginRight: 6 }} />
          {error}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Active plan details overview */}
          {assignedCard ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "12px",
                padding: "14px",
                backgroundColor: "var(--surface-sunken, rgba(255,255,255,0.03))",
                borderRadius: "8px",
                border: "1px solid var(--border)",
              }}
            >
              <div>
                <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                  Current Plan
                </span>
                <div style={{ fontWeight: 600, fontSize: "14px", marginTop: "2px" }}>
                  {assignedCard.name}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                  Pulse Rate
                </span>
                <div style={{ fontWeight: 600, fontSize: "14px", marginTop: "2px" }} className="mono">
                  ${rate(assignedCard.rate)} / {assignedCard.pulse || 60}s
                </div>
              </div>
              <div>
                <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                  Retention Window
                </span>
                <div style={{ fontWeight: 600, fontSize: "14px", marginTop: "2px" }}>
                  <Clock size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                  {assignedCard.days || 30} days
                </div>
              </div>
              <div>
                <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)" }}>
                  Plan Status
                </span>
                <div style={{ marginTop: "2px" }}>
                  <span
                    className={`status-badge ${assignedCard.activeIs === "Y" ? "active" : "inactive"}`}
                    style={{ fontSize: "12px", padding: "2px 8px" }}
                  >
                    <span />
                    {assignedCard.activeIs === "Y" ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                backgroundColor: "var(--surface-sunken, rgba(255,255,255,0.02))",
                border: "1px dashed var(--border)",
                color: "var(--muted)",
                fontSize: "13px",
              }}
            >
              No recording rate card plan is currently assigned to this customer. Recorded calls will not be charged or will use default tier.
            </div>
          )}

          {/* Super admin assignment control */}
          {isSuperAdmin ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <label className="field" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontWeight: 500, fontSize: "13px" }}>Assign Recording Rate Card</span>
                <select
                  value={selectedCardId}
                  onChange={(e) => setSelectedCardId(e.target.value)}
                  disabled={saving}
                  style={{ maxWidth: "480px" }}
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
                <small style={{ color: "var(--muted)", fontSize: "12px" }}>
                  Select an active call recording pricing tier to apply to this customer's recordings.
                </small>
              </label>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                <button
                  type="button"
                  className="button primary"
                  disabled={saving || !selectedCardId || !isChanged}
                  onClick={() => void handleSave()}
                >
                  {saving && <LoaderCircle className="spin" size={15} style={{ marginRight: 6 }} />}
                  Save Recording Plan
                </button>

                {assignedMapping && (
                  <button
                    type="button"
                    className="button secondary danger"
                    disabled={saving}
                    onClick={() => void handleRemove()}
                    title="Remove assigned recording rate card"
                    style={{ color: "var(--danger, #ef4444)" }}
                  >
                    <Trash2 size={15} style={{ marginRight: 6 }} />
                    Remove Plan
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>
              To adjust recording pricing or retention policies, please reach out to your administrator.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
