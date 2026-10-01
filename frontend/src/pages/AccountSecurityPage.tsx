import { type FormEvent, useState, useMemo } from 'react';
import { Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck, Check, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function AccountSecurityPanel() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const passwordRequirements = useMemo(() => [
    { label: 'At least 8 characters long', valid: newPassword.length >= 8 },
    { label: 'Contains letters & numbers or symbols', valid: /[A-Za-z]/.test(newPassword) && (/\d/.test(newPassword) || /[^A-Za-z0-9]/.test(newPassword)) },
    { label: 'Passwords match', valid: Boolean(newPassword && confirmPassword && newPassword === confirmPassword) },
  ], [newPassword, confirmPassword]);

  const passwordStrength = useMemo(() => {
    if (!newPassword) return { score: 0, text: '', colorClass: '' };
    let score = 0;
    if (newPassword.length >= 8) score++;
    if (newPassword.length >= 12) score++;
    if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score++;
    if (/\d/.test(newPassword)) score++;
    if (/[^A-Za-z0-9]/.test(newPassword)) score++;

    if (score <= 2) return { score: 1, text: 'Weak', colorClass: 'strength-weak' };
    if (score <= 4) return { score: 2, text: 'Medium', colorClass: 'strength-medium' };
    return { score: 3, text: 'Strong', colorClass: 'strength-strong' };
  }, [newPassword]);

  const isValid = useMemo(() => {
    return currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;
  }, [currentPassword, newPassword, confirmPassword]);

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
    <section className="panel security-panel-card">
      <div className="security-panel-header">
        <div className="security-panel-header-icon">
          <ShieldCheck size={24} />
        </div>
        <div>
          <span className="eyebrow">Sign-in & Security</span>
          <h2>Change password</h2>
          <p>
            Update password for <span className="security-user-badge">{user?.email || 'your account'}</span>
          </p>
        </div>
      </div>

      <form className="security-form" onSubmit={submit}>
        {error && (
          <div className="security-banner error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="security-banner success" role="status">
            <CheckCircle2 size={16} />
            <span>{message}</span>
          </div>
        )}

        <div className="security-field-group">
          <div className="security-field">
            <label htmlFor="currentPassword">
              <span>Current password</span>
            </label>
            <div className="security-input-wrap">
              <Lock size={16} className="security-input-icon" />
              <input
                id="currentPassword"
                required
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <button
                type="button"
                className="security-eye-btn"
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="security-field">
            <label htmlFor="newPassword">
              <span>New password</span>
            </label>
            <div className="security-input-wrap">
              <Lock size={16} className="security-input-icon" />
              <input
                id="newPassword"
                required
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className="security-eye-btn"
                aria-label={showNew ? 'Hide password' : 'Show password'}
                onClick={() => setShowNew(!showNew)}
                tabIndex={-1}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {newPassword && (
              <div className="password-strength-container">
                <div className="password-strength-bars">
                  <span className={`strength-bar ${passwordStrength.score >= 1 ? passwordStrength.colorClass : ''}`} />
                  <span className={`strength-bar ${passwordStrength.score >= 2 ? passwordStrength.colorClass : ''}`} />
                  <span className={`strength-bar ${passwordStrength.score >= 3 ? passwordStrength.colorClass : ''}`} />
                </div>
                <span className={`strength-label ${passwordStrength.colorClass}`}>
                  Strength: {passwordStrength.text}
                </span>
              </div>
            )}
          </div>

          <div className="security-field">
            <label htmlFor="confirmPassword">
              <span>Confirm new password</span>
            </label>
            <div className="security-input-wrap">
              <Lock size={16} className="security-input-icon" />
              <input
                id="confirmPassword"
                required
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                minLength={8}
                placeholder="Re-type new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                className="security-eye-btn"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        {newPassword.length > 0 && (
          <div className="security-requirements">
            <p className="security-requirements-title">Requirements:</p>
            <ul>
              {passwordRequirements.map((req, idx) => (
                <li key={idx} className={req.valid ? 'met' : 'unmet'}>
                  <Check size={13} className="requirement-check" />
                  <span>{req.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="security-actions">
          <button type="submit" className="button primary" disabled={saving || !isValid}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}
            <span>Update password</span>
          </button>
        </div>
      </form>
    </section>
  );
}

export function AccountSecurityPage() {
  return <div className="page"><header className="page-header"><div><p className="eyebrow">Your account</p><h1>Profile & security</h1><p>Manage the password for your Switchboard login.</p></div></header><AccountSecurityPanel /></div>;
}
