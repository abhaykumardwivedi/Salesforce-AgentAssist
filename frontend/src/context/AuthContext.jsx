import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiLogin, apiLogout, apiMe, apiSignup, tokenStore } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!tokenStore.access) {
      setLoading(false);
      return undefined;
    }
    apiMe()
      .then((data) => { if (active) setUser(data); })
      .catch(() => { tokenStore.clear(); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleLogout = () => setUser(null);
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const login = async (credentials) => {
    const data = await apiLogin(credentials);
    tokenStore.set(data);
    setUser(data.user);
    return data.user;
  };

  const signup = async (payload) => {
    const data = await apiSignup(payload);
    tokenStore.set(data);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      if (tokenStore.refresh) await apiLogout(tokenStore.refresh);
    } catch {
      // Ignore network errors during logout.
    }
    tokenStore.clear();
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, login, signup, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}
