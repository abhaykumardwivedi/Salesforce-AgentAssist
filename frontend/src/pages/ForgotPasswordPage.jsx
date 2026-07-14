import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequestPasswordReset } from '../api/client.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
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
        <h1>Reset password</h1>
        {sent ? (
          <p className="muted small">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox and follow the link to choose a new password.
          </p>
        ) : (
          <>
            <p className="muted small">Enter your email and we will send you a reset link.</p>
            <form className="form" onSubmit={onSubmit}>
              <label>
                <span>Email</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button className="btn primary" type="submit" disabled={submitting}>{submitting ? 'Sending...' : 'Send reset link'}</button>
            </form>
          </>
        )}
        <p className="small muted"><Link className="link" to="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}
