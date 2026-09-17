import { type FormEvent, useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function AccountSecurityPanel() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password changed successfully');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel security-panel">
      <div className="panel-heading"><div><p className="eyebrow">Sign-in security</p><h2>Change password</h2><p>Signed in as {user?.email}</p></div><ShieldCheck size={20} /></div>
      <form className="form-grid settings-form" onSubmit={submit}>
        <label>Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
        <label>New password<input required type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        <label>Confirm new password<input required type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
        {error && <p className="login-error full" role="alert">{error}</p>}
        {message && <p className="security-success full" role="status">{message}</p>}
        <div className="form-actions full"><button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />} Update password</button></div>
      </form>
    </section>
  );
}

export function AccountSecurityPage() {
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Your account</p><h1>Profile & security</h1><p>Manage the password for your Switchboard login.</p></div></header><AccountSecurityPanel /></div>;
}
