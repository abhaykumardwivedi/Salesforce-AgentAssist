import { Activity, BarChart3, Bot, CloudLightning, LayoutDashboard, ListChecks, LogOut, Settings, TicketPlus, Users } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/copilot', label: 'Copilot', icon: Bot },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/tickets/new', label: 'Create Ticket', icon: TicketPlus },
  { to: '/tickets', label: 'Tickets', icon: ListChecks },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/logs', label: 'API Logs', icon: Activity },
  { to: '/salesforce', label: 'Salesforce', icon: CloudLightning },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>AgentAssist</strong>
          <span>Customer 360 Ops</span>
        </div>
        <nav className="nav-list">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-item">
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{user?.fullName}</strong>
            <span className="muted small">{user?.tenantName} · {user?.role}</span>
          </div>
          <button className="btn small" type="button" onClick={onLogout}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <header className="mobile-header">
        <strong>AgentAssist</strong>
        <select value={location.pathname} onChange={(event) => navigate(event.target.value)} aria-label="Navigation">
          {nav.map((item) => (
            <option key={item.to} value={item.to}>{item.label}</option>
          ))}
        </select>
        <button className="btn small" type="button" onClick={onLogout} aria-label="Sign out"><LogOut size={15} /></button>
      </header>
      <main className="main-panel">
        <Outlet />
      </main>
    </div>
  );
}
