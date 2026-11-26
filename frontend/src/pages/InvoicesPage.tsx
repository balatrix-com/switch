import { useCallback, useEffect, useState } from "react";
import { api, apiBaseUrl, authToken } from "../lib/api";
import type { Customer } from "../types";
import { ArrowDownToLine, FileText, Mail, Plus, ReceiptText, Trash2, Wallet } from "lucide-react";
import { UiButton, UiDrawer, UiField, UiInput, UiSelect, UiSkeleton } from "../components/ui/Primitives";
import balatrixLogo from "../assets/balatrix-logo.svg";
import "./InvoicesPage.css";

type Otc = { description: string; amount: number };
type Adjustment = { description: string; amount: number };
type InvoiceInput = { customerId: string; startDate: string; endDate: string; mrcMode: "AUTO" | "MANUAL" | "HYBRID"; skipMrc: boolean; skipOtc: boolean; skipUsage: boolean; manualMrcAmount?: number; manualMrcBasis: "PER_NUMBER" | "FLAT"; manualMrcDescription?: string; manualOtcItems: Otc[]; customAdjustments: Adjustment[]; includeCallRecordings: boolean; notes?: string };
type FreeMinutesReport = { included: number; consumed: number; remaining: number; asOf: string } | null;
type Item = { category: string; description: string; quantity: number; unitPrice: number; totalAmount: number; metadata?: { callCount?: number; durationSeconds?: number; freeMinutesUsed?: number; billableSeconds?: number; billingBasis?: string; assignedNumberCount?: number } };
type Preview = { customer: { name: string }; currency: string; items: Item[]; mrcAmount: number; otcTotal: number; usageTotal: number; servicesTotal: number; totalAmount: number; wallet: { openingBalance: number | null; closingBalance: number | null; topUps: number }; freeMinutesReport: FreeMinutesReport; minimumSpendNote: string };
type Invoice = { id: string; invoiceNumber: string; customer: { name: string }; startDate: string; endDate: string; mrcType: string; mrcAmount: number; otcTotal: number; usageTotal: number; totalAmount: number; status: string; currency: string; walletSnapshot?: { openingBalance: number | null; topUps: number; closingBalance: number | null; freeMinutesReport?: FreeMinutesReport }; items?: Item[] };
const date = (value: Date) => value.toISOString().slice(0, 10);
const currency = (value: number | string, code = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(Number(value));

function InvoiceItemDetails({ item, currencyCode }: { item: Item; currencyCode: string }) {
  if (item.metadata?.billingBasis === "PER_NUMBER") {
    return <small className="invoice-item-detail">{item.metadata.assignedNumberCount ?? item.quantity} assigned numbers × {currency(item.unitPrice, currencyCode)} each</small>;
  }
  if (item.metadata?.callCount !== undefined) {
    return <small className="invoice-item-detail">{item.metadata.callCount} calls · {item.metadata.durationSeconds} sec · {item.metadata.freeMinutesUsed} free min · {item.metadata.billableSeconds} billable sec</small>;
  }
  return null;
}

function FreeMinutesSummary({ report }: { report: FreeMinutesReport }) {
  if (!report) return null;
  return <section className="invoice-minutes-report" aria-label="Free DID minutes usage"><h3>Included DID minutes</h3><div><span>Plan allowance <strong>{report.included}</strong></span><span>Used in invoice period <strong>{report.consumed}</strong></span><span>Remaining at period end <strong>{report.remaining}</strong></span></div><small>TFN and Local DIDs share one inbound allowance. Remaining includes prior usage and adjustments.</small></section>;
}

function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  return <article className="invoice-document">
    <div className="invoice-document-head"><img src={balatrixLogo} alt="Balatrix" /><div><span className="eyebrow">Billing document</span><h2>Invoice</h2><span className="mono">{invoice.invoiceNumber}</span></div></div>
    <div className="invoice-document-meta"><div><span className="eyebrow">Bill to</span><strong>{invoice.customer.name}</strong></div><div><span className="eyebrow">Billing period</span><strong>{invoice.startDate.slice(0, 10)} – {invoice.endDate.slice(0, 10)}</strong><span className={`invoice-status invoice-status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></div></div>
    <div className="invoice-document-items"><table><thead><tr><th>Plan / description</th><th>Price</th></tr></thead><tbody>{invoice.items?.length ? invoice.items.map((item, index) => <tr key={index}><td><strong>{item.description}</strong><InvoiceItemDetails item={item} currencyCode={invoice.currency} /></td><td>{currency(item.totalAmount, invoice.currency)}</td></tr>) : <tr><td>No chargeable items</td><td>—</td></tr>}</tbody></table></div>
    <div className="invoice-document-total"><span>Total</span><strong>{currency(invoice.totalAmount, invoice.currency)}</strong></div>
    <FreeMinutesSummary report={invoice.walletSnapshot?.freeMinutesReport || null} />
    <div className="invoice-document-foot">Issued by Balatrix · {invoice.invoiceNumber}</div>
  </article>;
}

export function InvoicesPage({ notify }: { notify: (message: string, type?: "success" | "error") => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [invoiceToRemove, setInvoiceToRemove] = useState<Invoice | null>(null);
  const [removing, setRemoving] = useState(false);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [input, setInput] = useState<InvoiceInput>({ customerId: "", startDate: date(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), endDate: date(new Date()), mrcMode: "AUTO", skipMrc: false, skipOtc: false, skipUsage: false, manualMrcBasis: "PER_NUMBER", manualOtcItems: [], customAdjustments: [], includeCallRecordings: true });
  const reload = useCallback(() => api.get<Invoice[]>("/invoices").then(setInvoices).catch((error: Error) => notify(error.message, "error")).finally(() => setLoading(false)), [notify]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { void api.get<Customer[]>("/customers").then(setCustomers).catch((error: Error) => notify(error.message, "error")); }, [notify]);
  const patch = (values: Partial<InvoiceInput>) => { setInput((old) => ({ ...old, ...values })); setPreview(null); };
  const dateError = input.startDate && input.endDate && input.endDate < input.startDate ? "End date must be on or after the start date." : "";
  const preset = (kind: "this" | "last" | "first" | "second") => {
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
    if (kind === "last") patch({ startDate: date(new Date(year, month - 1, 1)), endDate: date(new Date(year, month, 0)) });
    else if (kind === "first") patch({ startDate: date(new Date(year, month, 1)), endDate: date(new Date(year, month, 20)) });
    else if (kind === "second") patch({ startDate: date(new Date(year, month, 21)), endDate: date(new Date(year, month + 1, 0)) });
    else patch({ startDate: date(new Date(year, month, 1)), endDate: date(new Date(year, month + 1, 0)) });
  };
  const getPreview = async () => {
    if (dateError) { notify(dateError, "error"); return; }
    setBusy(true);
    try { setPreview(await api.post<Preview>("/invoices/preview", input)); setStep(3); }
    catch (error) { notify(error instanceof Error ? error.message : "Preview failed", "error"); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    if (dateError) { notify(dateError, "error"); return; }
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
  const removeInvoice = async () => {
    if (!invoiceToRemove || removing) return;
    setRemoving(true);
    try {
      await api.delete(`/invoices/${invoiceToRemove.id}`);
      notify(`Invoice ${invoiceToRemove.invoiceNumber} permanently deleted`, "success");
      if (selected?.id === invoiceToRemove.id) setSelected(null);
      setInvoiceToRemove(null);
      await reload();
    } catch (error) { notify(error instanceof Error ? error.message : "Cannot remove invoice", "error"); }
    finally { setRemoving(false); }
  };
  const outstanding = invoices.filter((invoice) => !['PAID', 'VOID', 'CANCELLED'].includes(invoice.status.toUpperCase()));
  const activeInvoices = invoices.filter((invoice) => invoice.status.toUpperCase() !== 'CANCELLED');
  const invoicedTotal = activeInvoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0);
  const visibleInvoices = invoices.filter(invoice => `${invoice.invoiceNumber} ${invoice.customer.name} ${invoice.status}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="invoices-page">
    <header className="invoice-page-head"><div><span className="eyebrow">Customer billing</span><h1>Invoices</h1><p>Review charges, prepare invoices, and export supporting call records.</p></div><UiButton variant="primary" onClick={() => { setOpen(true); setStep(0); setPreview(null); }}><Plus size={16} /> Generate invoice</UiButton></header>
    <div className="invoice-overview"><div className="invoice-overview-card"><FileText size={19} /><span>Active invoices</span><strong>{activeInvoices.length}</strong></div><div className="invoice-overview-card"><ReceiptText size={19} /><span>Open invoices</span><strong>{outstanding.length}</strong></div><div className="invoice-overview-card"><Wallet size={19} /><span>Invoiced total</span><strong>{activeInvoices.length && activeInvoices.every((invoice) => invoice.currency === activeInvoices[0].currency) ? currency(invoicedTotal, activeInvoices[0].currency) : activeInvoices.length ? 'Multiple currencies' : '—'}</strong></div></div>
    <section className="panel table-panel invoice-list">
      <div className="toolbar"><UiInput aria-label="Filter invoices" placeholder="Search invoice, customer, or status" value={query} onChange={event => setQuery(event.target.value)} /><span className="inventory-count">{visibleInvoices.length} records</span></div>
      {loading ? <UiSkeleton rows={5} /> : <div className="table-scroll"><table><thead><tr><th>Invoice #</th><th>Customer</th><th>Billing period</th><th>MRC</th><th>OTC</th><th>Usage</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visibleInvoices.map((invoice) => <tr key={invoice.id}><td><strong className="mono">{invoice.invoiceNumber}</strong></td><td>{invoice.customer.name}</td><td>{invoice.startDate.slice(0, 10)} – {invoice.endDate.slice(0, 10)}</td><td>{invoice.mrcType} · {currency(invoice.mrcAmount, invoice.currency)}</td><td>{currency(invoice.otcTotal, invoice.currency)}</td><td>{currency(invoice.usageTotal, invoice.currency)}</td><td><strong>{currency(invoice.totalAmount, invoice.currency)}</strong></td><td><span className={`invoice-status invoice-status-${invoice.status.toLowerCase()}`}>{invoice.status}</span></td><td><div className="invoice-row-actions"><button className="button ghost compact" onClick={() => void api.get<Invoice>(`/invoices/${invoice.id}`).then(setSelected).catch((error: Error) => notify(error.message, 'error'))}>Details</button><button title="Print or save PDF" aria-label={`Print ${invoice.invoiceNumber}`} className="button ghost compact" onClick={() => void print(invoice)}><FileText size={15} /></button><button title="Download CDR" aria-label={`Download CDR for ${invoice.invoiceNumber}`} className="button ghost compact" onClick={() => void downloadCdr(invoice)}><ArrowDownToLine size={15} /></button>{invoice.status !== 'CANCELLED' && <button title="Email invoice" aria-label={`Email ${invoice.invoiceNumber}`} className="button ghost compact" onClick={() => void email(invoice)}><Mail size={15} /></button>}{invoice.status === 'PENDING' && <button title="Delete invoice" aria-label={`Delete ${invoice.invoiceNumber}`} className="button ghost compact invoice-remove-button" onClick={() => setInvoiceToRemove(invoice)}><Trash2 size={15} /></button>}</div></td></tr>)}</tbody></table>{!visibleInvoices.length && <div className="invoice-empty"><FileText size={25} /><strong>{invoices.length ? "No matching invoices" : "No invoices yet"}</strong></div>}</div>}
    </section>
    {open && <div className="invoice-overlay"><div className="invoice-dialog" role="dialog" aria-modal="true" aria-label="Generate invoice"><header><h2>Generate invoice</h2><button type="button" className="button ghost" onClick={() => setOpen(false)}>Close</button></header><nav className="invoice-steps">{["Scope & dates", "MRC", "OTC", "Preview"].map((label, index) => <span className={step === index ? "current" : ""} key={label}>{index + 1}. {label}</span>)}</nav>
      {step < 3 && <div className="invoice-charge-options" role="group" aria-label="Invoice charge options"><label><input type="checkbox" checked={input.skipMrc} onChange={(event) => patch({ skipMrc: event.target.checked })} /> Skip MRC</label><label><input type="checkbox" checked={input.skipOtc} onChange={(event) => patch({ skipOtc: event.target.checked })} /> Skip OTC</label><label><input type="checkbox" checked={input.skipUsage} onChange={(event) => patch({ skipUsage: event.target.checked })} /> Skip call usage and minimum</label></div>}
      {step === 0 && <div className="invoice-fields invoice-scope-grid">
        <UiField label="Customer"><UiSelect required value={input.customerId} onChange={(event) => patch({ customerId: event.target.value })}><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.accountCode}</option>)}</UiSelect></UiField>
        <div className="invoice-date-grid"><UiField label="Start date"><UiInput type="date" value={input.startDate} onChange={(event) => patch({ startDate: event.target.value })} /></UiField><UiField label="End date" error={dateError}><UiInput type="date" min={input.startDate} value={input.endDate} onChange={(event) => patch({ endDate: event.target.value })} /></UiField></div>
        <div className="invoice-presets" aria-label="Billing period presets">{([['this', 'This month'], ['last', 'Last month'], ['first', '1st–20th'], ['second', '21st–end']] as const).map(([key, label]) => <UiButton variant="ghost" size="compact" onClick={() => preset(key)} key={key}>{label}</UiButton>)}</div>
      </div>}
      {step === 1 && <div className="invoice-fields">{input.skipMrc ? <p>MRC charges will be omitted from this invoice.</p> : <><div className="invoice-mrc-options" role="radiogroup" aria-label="MRC calculation mode">{([{ value: 'AUTO', title: 'Automatic', description: 'Use recurring fees from active subscriptions.' }, { value: 'MANUAL', title: 'Manual', description: 'Replace automatic MRC with a per-number or flat charge.' }, { value: 'HYBRID', title: 'Auto + Manual', description: 'Add a per-number or flat charge to automatic MRC.' }] as const).map((option) => <label key={option.value} className={input.mrcMode === option.value ? 'selected' : ''}><input type="radio" name="mrcMode" checked={input.mrcMode === option.value} onChange={() => patch({ mrcMode: option.value })} /><strong>{option.title}</strong><small>{option.description}</small></label>)}</div>{input.mrcMode !== "AUTO" && <><div className="invoice-date-grid"><UiField label="Manual charge basis"><UiSelect value={input.manualMrcBasis} onChange={(event) => patch({ manualMrcBasis: event.target.value as InvoiceInput['manualMrcBasis'] })}><option value="PER_NUMBER">Per assigned number</option><option value="FLAT">Flat amount</option></UiSelect></UiField><UiField label={input.manualMrcBasis === "PER_NUMBER" ? "Rate per assigned number" : "Flat manual amount"} hint={input.manualMrcBasis === "PER_NUMBER" ? "Multiplied by numbers currently assigned to this customer, including suspended numbers. The count appears in the preview." : undefined}><UiInput type="number" min="0" step="0.01" value={input.manualMrcAmount ?? ""} onChange={(event) => patch({ manualMrcAmount: Number(event.target.value) })} /></UiField></div><UiField label="Description"><UiInput maxLength={255} value={input.manualMrcDescription || ""} onChange={(event) => patch({ manualMrcDescription: event.target.value })} /></UiField></>}</>}</div>}
      {step === 2 && <div className="invoice-fields">{input.skipOtc ? <p>OTC charges will be omitted from this invoice.</p> : <><p>Plan activation fees are included automatically. Add any other one-time fees below.</p>{input.manualOtcItems.map((item, index) => <div className="invoice-otc-row" key={index}><UiInput aria-label={`OTC ${index + 1} description`} placeholder="Description" value={item.description} onChange={(event) => patch({ manualOtcItems: input.manualOtcItems.map((old, position) => position === index ? { ...old, description: event.target.value } : old) })} /><UiInput aria-label={`OTC ${index + 1} amount`} type="number" min="0" step="0.01" value={item.amount} onChange={(event) => patch({ manualOtcItems: input.manualOtcItems.map((old, position) => position === index ? { ...old, amount: Number(event.target.value) } : old) })} /><UiButton variant="ghost" onClick={() => patch({ manualOtcItems: input.manualOtcItems.filter((_, position) => position !== index) })}>Remove</UiButton></div>)}<UiButton variant="secondary" onClick={() => patch({ manualOtcItems: [...input.manualOtcItems, { description: "", amount: 0 }] })}><Plus size={15} /> Add one-time fee</UiButton></>}<div className="invoice-adjustments"><h3>Custom price adjustments</h3><p>Add a positive amount for an extra charge or a negative amount for a discount. These appear as separate lines on this invoice.</p>{input.customAdjustments.map((item, index) => <div className="invoice-otc-row" key={index}><UiInput aria-label={`Adjustment ${index + 1} description`} placeholder="Reason, e.g. goodwill discount" value={item.description} onChange={(event) => patch({ customAdjustments: input.customAdjustments.map((old, position) => position === index ? { ...old, description: event.target.value } : old) })} /><UiInput aria-label={`Adjustment ${index + 1} signed amount`} type="number" step="0.01" value={item.amount} onChange={(event) => patch({ customAdjustments: input.customAdjustments.map((old, position) => position === index ? { ...old, amount: Number(event.target.value) } : old) })} /><UiButton variant="ghost" onClick={() => patch({ customAdjustments: input.customAdjustments.filter((_, position) => position !== index) })}>Remove</UiButton></div>)}<UiButton variant="secondary" onClick={() => patch({ customAdjustments: [...input.customAdjustments, { description: "", amount: 0 }] })}><Plus size={15} /> Add adjustment</UiButton></div><label><input type="checkbox" checked={input.includeCallRecordings} onChange={(event) => patch({ includeCallRecordings: event.target.checked })} /> Include recording charges</label><label>Notes<textarea value={input.notes || ""} onChange={(event) => patch({ notes: event.target.value })} /></label></div>}
      {step === 3 && preview && <div className="invoice-preview"><h3>{preview.customer.name} · {input.startDate} to {input.endDate}</h3><p className="invoice-payable-notice">This is a new, separately payable invoice. Existing invoices for the same dates remain payable; this does not replace or credit them.</p><table><thead><tr><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>{preview.items.map((item, index) => <tr key={index}><td>{item.category}</td><td>{item.description}<InvoiceItemDetails item={item} currencyCode={preview.currency} /></td><td>{currency(item.totalAmount, preview.currency)}</td></tr>)}</tbody></table><FreeMinutesSummary report={preview.freeMinutesReport} /><strong>Total: {currency(preview.totalAmount, preview.currency)}</strong><p>{preview.minimumSpendNote}</p><p>Wallet: opening {preview.wallet.openingBalance === null ? "unknown" : currency(preview.wallet.openingBalance, preview.currency)} · top-ups {currency(preview.wallet.topUps, preview.currency)} · closing {preview.wallet.closingBalance === null ? "unknown" : currency(preview.wallet.closingBalance, preview.currency)}</p></div>}
      <footer>{step > 0 && <UiButton variant="ghost" onClick={() => setStep(step - 1)}>Back</UiButton>}{step < 2 && <UiButton variant="primary" disabled={step === 0 && (!input.customerId || !input.startDate || !input.endDate || Boolean(dateError))} onClick={() => setStep(step + 1)}>Continue</UiButton>}{step === 2 && <UiButton variant="primary" loading={busy} onClick={() => void getPreview()}>Preview invoice</UiButton>}{step === 3 && <UiButton variant="primary" loading={busy} onClick={() => void generate()}>Generate & save invoice</UiButton>}</footer>
    </div></div>}
    {selected && <UiDrawer title={selected.invoiceNumber} eyebrow="Invoice details" className="invoice-inspector" onClose={() => setSelected(null)}>
      <InvoiceDocument invoice={selected} />
      <div className="record-footer"><button className="button secondary" onClick={() => void downloadCdr(selected)}>Download CDR</button><button className="button primary" onClick={() => void print(selected)}>Print / Save PDF</button></div>
    </UiDrawer>}
    {invoiceToRemove && <div className="invoice-overlay"><div className="invoice-dialog invoice-remove-dialog" role="alertdialog" aria-modal="true" aria-labelledby="invoice-remove-title" aria-describedby="invoice-remove-description"><header><h2 id="invoice-remove-title">Delete {invoiceToRemove.invoiceNumber}?</h2></header><p id="invoice-remove-description">This permanently deletes the unpaid invoice and its line items. It cannot be recovered. If the invoice was emailed, the customer may still have a copy. Wallet transactions and CDRs are not deleted.</p><footer><UiButton variant="ghost" disabled={removing} onClick={() => setInvoiceToRemove(null)}>Keep invoice</UiButton><UiButton variant="danger" loading={removing} onClick={() => void removeInvoice()}>Delete permanently</UiButton></footer></div></div>}
  </div>;
}
