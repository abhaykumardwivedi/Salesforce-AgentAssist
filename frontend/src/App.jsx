import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { ApiLogsPage } from './pages/ApiLogsPage.jsx';
import { CreateTicketPage } from './pages/CreateTicketPage.jsx';
import { Customer360Page } from './pages/Customer360Page.jsx';
import { CustomersPage } from './pages/CustomersPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { SalesforceStatusPage } from './pages/SalesforceStatusPage.jsx';
import { TicketsPage } from './pages/TicketsPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<Customer360Page />} />
        <Route path="/tickets/new" element={<CreateTicketPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/logs" element={<ApiLogsPage />} />
        <Route path="/salesforce" element={<SalesforceStatusPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
