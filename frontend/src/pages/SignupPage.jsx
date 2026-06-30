import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function SignupPage() {
  const { user, signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ companyName: '', fullName: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(form);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create workspace.');
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
        <h1>Create your workspace</h1>
        <p className="muted small">Start a new workspace. You become the owner.</p>
        <form className="form" onSubmit={onSubmit}>
          <label>
            <span>Company name</span>
            <input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          </label>
          <label>
            <span>Your name</span>
            <input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} autoComplete="name" />
          </label>
          <label>
            <span>Work email</span>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary" type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create workspace'}</button>
        </form>
        <p className="small muted">Already have an account? <Link className="link" to="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
