import { Activity, CloudLightning, LayoutDashboard, ListChecks, TicketPlus, Users } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/tickets/new', label: 'Create Ticket', icon: TicketPlus },
  { to: '/tickets', label: 'Tickets', icon: ListChecks },
  { to: '/logs', label: 'API Logs', icon: Activity },
  { to: '/salesforce', label: 'Salesforce', icon: CloudLightning },
];

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();

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
      </aside>
      <header className="mobile-header">
        <strong>AgentAssist</strong>
        <select value={location.pathname} onChange={(event) => navigate(event.target.value)} aria-label="Navigation">
          {nav.map((item) => (
            <option key={item.to} value={item.to}>{item.label}</option>
          ))}
        </select>
      </header>
      <main className="main-panel">
        <Outlet />
      </main>
    </div>
  );
}
