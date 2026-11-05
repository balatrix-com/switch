import { useEffect, useState } from "react";
import { api, apiBaseUrl, authToken } from "../lib/api";
import type { Customer } from "../types";
import "./InvoicesPage.css";

type Otc = { description: string; amount: number };
type InvoiceInput = { customerId: string; startDate: string; endDate: string; mrcMode: "AUTO" | "MANUAL" | "HYBRID"; manualMrcAmount?: number; manualMrcDescription?: string; manualOtcItems: Otc[]; includeCallRecordings: boolean; notes?: string };
type Item = { category: string; description: string; quantity: number; totalAmount: number; metadata?: Record<string, number> };
type Preview = { customer: { name: string }; currency: string; items: Item[]; mrcAmount: number; otcTotal: number; usageTotal: number; servicesTotal: number; totalAmount: number; wallet: { openingBalance: number | null; closingBalance: number | null; topUps: number }; minimumSpendNote: string };
type Invoice = { id: string; invoiceNumber: string; customer: { name: string }; startDate: string; endDate: string; mrcType: string; mrcAmount: number; otcTotal: number; usageTotal: number; totalAmount: number; status: string; currency: string; walletSnapshot?: { openingBalance: number | null; topUps: number; closingBalance: number | null }; items?: Item[] };
const date = (value: Date) => value.toISOString().slice(0, 10);
const currency = (value: number | string, code = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(Number(value));

export function InvoicesPage({ notify }: { notify: (message: string, type?: "success" | "error") => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [input, setInput] = useState<InvoiceInput>({ customerId: "", startDate: date(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), endDate: date(new Date()), mrcMode: "AUTO", manualOtcItems: [], includeCallRecordings: true });
  const reload = () => api.get<Invoice[]>("/invoices").then(setInvoices).catch((error: Error) => notify(error.message, "error"));
  useEffect(() => { void reload(); void api.get<Customer[]>("/customers").then(setCustomers).catch((error: Error) => notify(error.message, "error")); }, []);
  const patch = (values: Partial<InvoiceInput>) => { setInput((old) => ({ ...old, ...values })); setPreview(null); };
  const preset = (kind: "this" | "last" | "first" | "second") => {
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
    if (kind === "last") patch({ startDate: date(new Date(year, month - 1, 1)), endDate: date(new Date(year, month, 0)) });
    else if (kind === "first") patch({ startDate: date(new Date(year, month, 1)), endDate: date(new Date(year, month, 20)) });
    else if (kind === "second") patch({ startDate: date(new Date(year, month, 21)), endDate: date(new Date(year, month + 1, 0)) });
    else patch({ startDate: date(new Date(year, month, 1)), endDate: date(new Date(year, month + 1, 0)) });
  };
  const getPreview = async () => {
    setBusy(true);
    try { setPreview(await api.post<Preview>("/invoices/preview", input)); setStep(3); }
    catch (error) { notify(error instanceof Error ? error.message : "Preview failed", "error"); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    setBusy(true);
    try { const invoice = await api.post<Invoice>("/invoices/generate", input); notify(`Invoice ${invoice.invoiceNumber} saved`, "success"); setOpen(false); setPreview(null); await reload(); setSelected(await api.get<Invoice>(`/invoices/${invoice.id}`)); }
    catch (error) { notify(error instanceof Error ? error.message : "Invoice generation failed", "error"); }
    finally { setBusy(false); }
  };
  const print = async (invoice: Invoice) => {
    try {
      const response = await fetch(`${apiBaseUrl}/invoices/${invoice.id}/print`, { headers: { Authorization: `Bearer ${authToken.get() || ""}` } });
      if (!response.ok) throw new Error(`Print view failed (${response.status})`);
      const url = URL.createObjectURL(await response.blob()); window.open(url, "_blank", "noopener,noreferrer"); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { notify(error instanceof Error ? error.message : "Cannot open invoice", "error"); }
  };
  const downloadCdr = async (invoice: Invoice) => {
    try {
      const response = await fetch(`${apiBaseUrl}/invoices/${invoice.id}/cdr.csv`, { headers: { Authorization: `Bearer ${authToken.get() || ""}` } });
      if (!response.ok) throw new Error(`CDR export failed (${response.status})`);
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `${invoice.invoiceNumber}-cdr.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { notify(error instanceof Error ? error.message : "CDR export failed", "error"); }
  };
  const email = async (invoice: Invoice) => {
    try { await api.post(`/invoices/${invoice.id}/send-email`, {}); notify(`Invoice ${invoice.invoiceNumber} emailed`, "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Invoice email failed", "error"); }
  };
  return <main className="invoices-page">
    <header className="invoice-page-head"><div><span className="eyebrow">Customer billing</span><h1>Invoices</h1><p>Generate invoices for a custom date range.</p></div><button className="button primary" onClick={() => { setOpen(true); setStep(0); setPreview(null); }}>Generate new invoice</button></header>
    <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Invoice #</th><th>Customer</th><th>Date range</th><th>MRC</th><th>OTC</th><th>Usage</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td className="mono">{invoice.invoiceNumber}</td><td>{invoice.customer.name}</td><td>{invoice.startDate.slice(0, 10)} – {invoice.endDate.slice(0, 10)}</td><td>{invoice.mrcType} · {currency(invoice.mrcAmount, invoice.currency)}</td><td>{currency(invoice.otcTotal, invoice.currency)}</td><td>{currency(invoice.usageTotal, invoice.currency)}</td><td><strong>{currency(invoice.totalAmount, invoice.currency)}</strong></td><td>{invoice.status}</td><td><button className="button ghost compact" onClick={() => void api.get<Invoice>(`/invoices/${invoice.id}`).then(setSelected)}>View</button><button className="button ghost compact" onClick={() => void print(invoice)}>Print / PDF</button><button className="button ghost compact" onClick={() => void downloadCdr(invoice)}>CDR CSV</button><button className="button ghost compact" onClick={() => void email(invoice)}>Email</button></td></tr>)}</tbody></table>{!invoices.length && <p className="invoice-empty">No invoices yet.</p>}</div></section>
    {open && <div className="invoice-overlay"><div className="invoice-dialog" role="dialog" aria-modal="true" aria-label="Generate invoice"><header><h2>Generate invoice</h2><button type="button" className="button ghost" onClick={() => setOpen(false)}>Close</button></header><nav className="invoice-steps">{["Scope & dates", "MRC", "OTC", "Preview"].map((label, index) => <span className={step === index ? "current" : ""} key={label}>{index + 1}. {label}</span>)}</nav>
      {step === 0 && <div className="invoice-fields"><label>Customer<select value={input.customerId} onChange={(event) => patch({ customerId: event.target.value })}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.accountCode}</option>)}</select></label><label>Start date<input type="date" value={input.startDate} onChange={(event) => patch({ startDate: event.target.value })} /></label><label>End date<input type="date" value={input.endDate} onChange={(event) => patch({ endDate: event.target.value })} /></label><div className="invoice-presets">{([['this', 'This month'], ['last', 'Last month'], ['first', '1st–20th'], ['second', '21st–end']] as const).map(([key, label]) => <button type="button" className="button ghost compact" onClick={() => preset(key)} key={key}>{label}</button>)}</div></div>}
      {step === 1 && <div className="invoice-fields"><label><input type="radio" checked={input.mrcMode === "AUTO"} onChange={() => patch({ mrcMode: "AUTO" })} /> Automatic MRC from active subscriptions</label><label><input type="radio" checked={input.mrcMode === "MANUAL"} onChange={() => patch({ mrcMode: "MANUAL" })} /> Manual MRC replaces automatic MRC</label><label><input type="radio" checked={input.mrcMode === "HYBRID"} onChange={() => patch({ mrcMode: "HYBRID" })} /> Automatic MRC plus manual adjustment</label>{input.mrcMode !== "AUTO" && <><label>Manual amount<input type="number" min="0" step="0.01" value={input.manualMrcAmount ?? ""} onChange={(event) => patch({ manualMrcAmount: Number(event.target.value) })} /></label><label>Description<input maxLength={255} value={input.manualMrcDescription || ""} onChange={(event) => patch({ manualMrcDescription: event.target.value })} /></label></>}</div>}
      {step === 2 && <div className="invoice-fields"><p>Plan activation fees are included automatically. Add any other one-time fees below.</p>{input.manualOtcItems.map((item, index) => <div className="invoice-otc-row" key={index}><input aria-label={`OTC ${index + 1} description`} placeholder="Description" value={item.description} onChange={(event) => patch({ manualOtcItems: input.manualOtcItems.map((old, position) => position === index ? { ...old, description: event.target.value } : old) })} /><input aria-label={`OTC ${index + 1} amount`} type="number" min="0" step="0.01" value={item.amount} onChange={(event) => patch({ manualOtcItems: input.manualOtcItems.map((old, position) => position === index ? { ...old, amount: Number(event.target.value) } : old) })} /><button type="button" className="button ghost" onClick={() => patch({ manualOtcItems: input.manualOtcItems.filter((_, position) => position !== index) })}>Remove</button></div>)}<button type="button" className="button ghost" onClick={() => patch({ manualOtcItems: [...input.manualOtcItems, { description: "", amount: 0 }] })}>+ Add manual OTC</button><label><input type="checkbox" checked={input.includeCallRecordings} onChange={(event) => patch({ includeCallRecordings: event.target.checked })} /> Include recording charges</label><label>Notes<textarea value={input.notes || ""} onChange={(event) => patch({ notes: event.target.value })} /></label></div>}
      {step === 3 && preview && <div className="invoice-preview"><h3>{preview.customer.name} · {input.startDate} to {input.endDate}</h3><table><thead><tr><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>{preview.items.map((item, index) => <tr key={index}><td>{item.category}</td><td>{item.description}{item.metadata?.callCount !== undefined && <small className="invoice-item-detail">{item.metadata.callCount} calls · {item.metadata.durationSeconds} sec · {item.metadata.freeMinutesUsed} free min · {item.metadata.billableSeconds} billable sec</small>}</td><td>{currency(item.totalAmount, preview.currency)}</td></tr>)}</tbody></table><strong>Total: {currency(preview.totalAmount, preview.currency)}</strong><p>{preview.minimumSpendNote}</p><p>Wallet: opening {preview.wallet.openingBalance === null ? "unknown" : currency(preview.wallet.openingBalance, preview.currency)} · top-ups {currency(preview.wallet.topUps, preview.currency)} · closing {preview.wallet.closingBalance === null ? "unknown" : currency(preview.wallet.closingBalance, preview.currency)}</p></div>}
      <footer>{step > 0 && <button type="button" className="button ghost" onClick={() => setStep(step - 1)}>Back</button>}{step < 2 && <button type="button" className="button primary" disabled={step === 0 && (!input.customerId || !input.startDate || !input.endDate)} onClick={() => setStep(step + 1)}>Continue</button>}{step === 2 && <button type="button" className="button primary" disabled={busy} onClick={() => void getPreview()}>{busy ? "Calculating…" : "Preview invoice"}</button>}{step === 3 && <button type="button" className="button primary" disabled={busy} onClick={() => void generate()}>{busy ? "Saving…" : "Generate & save invoice"}</button>}</footer>
    </div></div>}
    {selected && <div className="invoice-overlay"><div className="invoice-dialog" role="dialog" aria-modal="true" aria-label="Invoice details"><header><h2>{selected.invoiceNumber}</h2><button type="button" className="button ghost" onClick={() => setSelected(null)}>Close</button></header><p>{selected.customer.name} · {selected.startDate.slice(0, 10)} to {selected.endDate.slice(0, 10)}</p><div className="invoice-preview"><table><tbody>{selected.items?.map((item, index) => <tr key={index}><td>{item.category}</td><td>{item.description}{item.metadata?.callCount !== undefined && <small className="invoice-item-detail">{item.metadata.callCount} calls · {item.metadata.durationSeconds} sec · {item.metadata.freeMinutesUsed} free min · {item.metadata.billableSeconds} billable sec</small>}</td><td>{currency(item.totalAmount, selected.currency)}</td></tr>)}</tbody></table><strong>Total: {currency(selected.totalAmount, selected.currency)}</strong>{selected.walletSnapshot && <p>Wallet: opening {selected.walletSnapshot.openingBalance === null ? "unknown" : currency(selected.walletSnapshot.openingBalance, selected.currency)} · top-ups {currency(selected.walletSnapshot.topUps, selected.currency)} · closing {selected.walletSnapshot.closingBalance === null ? "unknown" : currency(selected.walletSnapshot.closingBalance, selected.currency)}</p>}</div><footer><button className="button primary" onClick={() => void print(selected)}>Print / Save PDF</button></footer></div></div>}
  </main>;
}
