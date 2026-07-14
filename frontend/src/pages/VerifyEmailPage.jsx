import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiVerifyEmail } from '../api/client.js';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState('verifying');
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (!token) {
      setStatus('error');
      return;
    }
    apiVerifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          <strong>AgentAssist</strong>
          <span>Customer 360 Ops</span>
        </div>
        <h1>Email verification</h1>
        {status === 'verifying' && <p className="muted small">Verifying your email address...</p>}
        {status === 'success' && <p className="muted small">Your email is verified. You can now sign in and use every feature.</p>}
        {status === 'error' && <p className="form-error">This verification link is invalid or has expired. Sign in and request a new one from your account.</p>}
        <p className="small muted"><Link className="link" to="/login">Continue to sign in</Link></p>
      </div>
    </div>
  );
}
