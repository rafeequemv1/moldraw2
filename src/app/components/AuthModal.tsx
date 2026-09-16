import type { FormEvent } from 'react';
import { DESIGNATION_OPTIONS, type AuthForm, type AuthMode } from '../auth/useMolDrawAuth';
import { useChromeOverlay } from '../chromeDismiss';

export interface AuthModalProps {
  open: boolean;
  mode: AuthMode;
  form: AuthForm;
  error: string;
  notice: string;
  loading: boolean;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
  onChange: (field: keyof AuthForm, value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export function AuthModal({
  open,
  mode,
  form,
  error,
  notice,
  loading,
  onClose,
  onModeChange,
  onChange,
  onSubmit,
}: AuthModalProps) {
  useChromeOverlay(open, onClose, 'modal');
  if (!open) return null;

  const title =
    mode === 'signup'
      ? 'Create MolDraw account'
      : mode === 'reset'
        ? 'Reset password'
        : mode === 'update-password'
          ? 'Set new password'
          : 'Sign in to MolDraw';

  const subtitle =
    mode === 'reset'
      ? 'We will email a secure password reset link.'
      : mode === 'update-password'
        ? 'Choose a new password to finish recovery.'
        : 'The editor stays free and open. Accounts power My designs and community actions.';

  return (
    <div className="auth-modal-backdrop">
      <form className={`auth-modal auth-modal--${mode}`} onSubmit={onSubmit}>
        <div className="auth-modal-header">
          <div>
            <div className="auth-modal-title">{title}</div>
            <div className="auth-modal-subtitle">{subtitle}</div>
          </div>
          <button type="button" className="auth-modal-x" onClick={onClose} aria-label="Close sign in">
            ×
          </button>
        </div>

        {mode !== 'reset' && mode !== 'update-password' ? (
          <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => onModeChange('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => onModeChange('signup')}
            >
              Sign up
            </button>
          </div>
        ) : null}

        <label className="auth-field">
          <span>
            Email <span className="auth-required-star">*</span>
          </span>
          <input
            type="email"
            value={form.email}
            onChange={e => onChange('email', e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          {mode === 'signup' ? (
            <small className="auth-field-note">
              Prefer a personal email, such as Gmail or another long-term address.
            </small>
          ) : null}
        </label>

        {mode !== 'reset' ? (
          <label className="auth-field">
            <span>
              Password <span className="auth-required-star">*</span>
            </span>
            <input
              type="password"
              value={form.password}
              onChange={e => onChange('password', e.target.value)}
              placeholder={mode === 'update-password' ? 'New password' : 'At least 6 characters'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>
        ) : null}

        {mode === 'signup' ? (
          <>
            <label className="auth-field">
              <span>
                Designation <span className="auth-required-star">*</span>
              </span>
              <select
                value={form.designation}
                onChange={e => onChange('designation', e.target.value)}
                required
              >
                <option value="">Select designation</option>
                {DESIGNATION_OPTIONS.map(item => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="auth-field">
              <span>Institute name</span>
              <input
                type="text"
                value={form.instituteName}
                onChange={e => onChange('instituteName', e.target.value)}
                placeholder="University, lab, company, or independent"
                autoComplete="organization"
                maxLength={160}
              />
            </label>
          </>
        ) : null}

        {mode === 'signin' ? (
          <button type="button" className="auth-inline-link" onClick={() => onModeChange('reset')} disabled={loading}>
            Forgot password?
          </button>
        ) : null}
        {mode === 'reset' ? (
          <button type="button" className="auth-inline-link" onClick={() => onModeChange('signin')} disabled={loading}>
            Back to sign in
          </button>
        ) : null}

        {notice ? <div className="auth-notice">{notice}</div> : null}
        {error ? <div className="auth-error">{error}</div> : null}

        <div className="auth-actions">
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'reset'
                  ? 'Send reset link'
                  : mode === 'update-password'
                    ? 'Update password'
                    : 'Sign in'}
          </button>
          <button type="button" className="auth-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
