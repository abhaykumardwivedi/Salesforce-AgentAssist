import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { ApiLogsPage } from './pages/ApiLogsPage.jsx';
import { CreateTicketPage } from './pages/CreateTicketPage.jsx';
import { Customer360Page } from './pages/Customer360Page.jsx';
import { CustomersPage } from './pages/CustomersPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { ResetPasswordPage } from './pages/ResetPasswordPage.jsx';
import { SalesforceStatusPage } from './pages/SalesforceStatusPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { SignupPage } from './pages/SignupPage.jsx';
import { TicketsPage } from './pages/TicketsPage.jsx';
import { VerifyEmailPage } from './pages/VerifyEmailPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<Customer360Page />} />
        <Route path="/tickets/new" element={<CreateTicketPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/logs" element={<ApiLogsPage />} />
        <Route path="/salesforce" element={<SalesforceStatusPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
