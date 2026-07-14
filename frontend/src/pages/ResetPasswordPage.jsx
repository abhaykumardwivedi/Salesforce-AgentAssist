import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiResetPassword } from '../api/client.js';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await apiResetPassword(token, form.password);
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          <strong>AgentAssist</strong>
          <span>Customer 360 Ops</span>
        </div>
        <h1>Choose a new password</h1>
        {!token ? (
          <p className="form-error">This link is missing its reset token. Request a new link.</p>
        ) : done ? (
          <p className="muted small">Your password has been reset. Redirecting you to sign in...</p>
        ) : (
          <form className="form" onSubmit={onSubmit}>
            <label>
              <span>New password</span>
              <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
            </label>
            <label>
              <span>Confirm password</span>
              <input type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn primary" type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Reset password'}</button>
          </form>
        )}
        <p className="small muted"><Link className="link" to="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}
