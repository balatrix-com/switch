import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { api } from '../lib/api';

type SupportMember = {
  id: string;
  email: string;
  name: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  supportAssignments: { customerId: string; customer: { name: string } }[];
};

export function SupportMembersPanel({ customerId, notify }: {
  customerId: string;
  notify: (message: string, type?: 'success' | 'error') => void;
}) {
  const [members, setMembers] = useState<SupportMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [existingId, setExistingId] = useState('');
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setMembers(await api.get<SupportMember[]>('/support-members')); }
    catch (error) { notify(error instanceof Error ? error.message : 'Unable to load Support Members', 'error'); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const assigned = useMemo(() => members.filter((member) => member.supportAssignments.some((assignment) => assignment.customerId === customerId)), [members, customerId]);
  const available = useMemo(() => members.filter((member) => !member.supportAssignments.some((assignment) => assignment.customerId === customerId)), [members, customerId]);

  const action = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { await work(); notify(success); await load(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Unable to update Support Member', 'error'); }
    finally { setBusy(false); }
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    void action(async () => {
      await api.post('/support-members', { name: name.trim(), email: email.trim(), password, customerId });
      setName(''); setEmail(''); setPassword('');
    }, 'Support Member created and assigned');
  };

  const assign = (event: FormEvent) => {
    event.preventDefault();
    if (!existingId) return;
    void action(async () => {
      await api.post(`/support-members/${existingId}/assignments`, { customerId });
      setExistingId('');
    }, 'Support Member assigned');
  };

  return <div className="support-management">
    <section className="panel">
      <div className="panel-heading"><div><p className="eyebrow">Staff access</p><h2><ShieldCheck size={17} /> Support Members</h2><p>Only Super Admin can grant or remove access to this customer.</p></div><button className="button ghost compact" onClick={() => void load()} disabled={loading || busy}><RefreshCw size={15} /> Refresh</button></div>
      <div className="support-management-body">
        {loading ? <p>Loading Support Members…</p> : assigned.length === 0 ? <p>No Support Members are assigned to this customer.</p> : <div className="support-member-list">
          {assigned.map((member) => <div className="support-member-row" key={member.id}>
            <span className="support-member-avatar"><UserRound size={18} /></span>
            <span className="support-member-identity"><strong>{member.name || member.email}</strong><small>{member.email} · {member.supportAssignments.length} customer{member.supportAssignments.length === 1 ? '' : 's'}</small></span>
            <span className={`status-badge ${member.status === 'ACTIVE' ? 'active' : 'inactive'}`}><span />{member.status === 'ACTIVE' ? 'Active' : 'Suspended'}</span>
            <div className="support-member-actions">
              <button className="button secondary compact" disabled={busy} onClick={() => { setEditingId(member.id); setEditName(member.name || ''); }}><Pencil size={14} /> Edit name</button>
              <button className="button secondary compact" disabled={busy} onClick={() => void action(() => api.patch(`/support-members/${member.id}`, { status: member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' }), member.status === 'ACTIVE' ? 'Support Member suspended' : 'Support Member reactivated')}>{member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>
              <button className="button secondary compact" disabled={busy} onClick={() => { setResetId(member.id); setResetPassword(''); }}><KeyRound size={14} /> Reset password</button>
              <button className="button ghost compact" disabled={busy} onClick={() => void action(() => api.delete(`/support-members/${member.id}/assignments/${customerId}`), 'Assignment removed')}>Unassign</button>
              <button className="button ghost compact danger-text" disabled={busy} title="Delete this staff account and all its customer assignments" onClick={() => { if (window.confirm(`Delete ${member.email} and revoke all customer assignments?`)) void action(() => api.delete(`/support-members/${member.id}`), 'Support Member account deleted'); }}><Trash2 size={14} /> Delete account</button>
            </div>
            {editingId === member.id && <form className="support-reset-form" onSubmit={(event) => { event.preventDefault(); void action(async () => { await api.patch(`/support-members/${member.id}`, { name: editName.trim() }); setEditingId(null); }, 'Support Member updated'); }}><label className="field">Display name<input maxLength={100} value={editName} onChange={(event) => setEditName(event.target.value)} /></label><button className="button primary compact" disabled={busy}>Save name</button><button className="button ghost compact" type="button" onClick={() => setEditingId(null)}>Cancel</button></form>}
            {resetId === member.id && <form className="support-reset-form" onSubmit={(event) => { event.preventDefault(); void action(async () => { await api.post(`/support-members/${member.id}/reset-password`, { password: resetPassword }); setResetId(null); setResetPassword(''); }, 'Password reset'); }}><label className="field">New temporary password<input autoComplete="new-password" type="password" minLength={10} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label><button className="button primary compact" disabled={busy}>Save password</button><button className="button ghost compact" type="button" onClick={() => setResetId(null)}>Cancel</button></form>}
          </div>)}
        </div>}
      </div>
    </section>
    <div className="support-forms">
      <section className="panel support-form-panel"><div className="panel-heading"><div><p className="eyebrow">New staff account</p><h2>Create and assign</h2></div></div><form onSubmit={create} className="support-form"><label className="field">Name<input maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field">Email<input type="email" required autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="field">Temporary password<input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button primary" disabled={busy}><Plus size={16} /> Create Support Member</button></form></section>
      <section className="panel support-form-panel"><div className="panel-heading"><div><p className="eyebrow">Existing staff account</p><h2>Assign to customer</h2></div></div><form onSubmit={assign} className="support-form"><label className="field">Support Member<select value={existingId} required onChange={(event) => setExistingId(event.target.value)}><option value="">Select a Support Member</option>{available.map((member) => <option key={member.id} value={member.id}>{member.name || member.email} ({member.email})</option>)}</select></label><button className="button secondary" disabled={busy || !existingId}><Plus size={16} /> Assign existing member</button></form></section>
    </div>
  </div>;
}
