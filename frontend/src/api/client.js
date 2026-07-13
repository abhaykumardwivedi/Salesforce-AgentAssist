import axios from 'axios';

const ACCESS_KEY = 'aa_access_token';
const REFRESH_KEY = 'aa_refresh_token';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1',
  timeout: 15000,
});

// Bare client for the public widget — no auth header, no refresh interceptor.
const publicApi = axios.create({ baseURL: api.defaults.baseURL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    // Login/signup/refresh/logout must not trigger a token refresh on 401, but
    // /auth/me should: on page load an expired access token can then be renewed
    // transparently from a still-valid refresh token instead of forcing re-login.
    const isAuthRoute = original?.url?.includes('/auth/') && !original?.url?.includes('/auth/me');

    if (status === 401 && !original._retry && !isAuthRoute && tokenStore.refresh) {
      original._retry = true;
      try {
        refreshing = refreshing || axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken: tokenStore.refresh });
        const { data } = await refreshing;
        refreshing = null;
        tokenStore.set(data);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        refreshing = null;
        tokenStore.clear();
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

// Auth
export const apiSignup = (payload) => api.post('/auth/signup', payload).then((res) => res.data);
export const apiLogin = (payload) => api.post('/auth/login', payload).then((res) => res.data);
export const apiLogout = (refreshToken) => api.post('/auth/logout', { refreshToken });
export const apiMe = () => api.get('/auth/me').then((res) => res.data);
export const apiRequestPasswordReset = (email) => api.post('/auth/request-password-reset', { email }).then((res) => res.data);
export const apiResetPassword = (token, password) => api.post('/auth/reset-password', { token, password }).then((res) => res.data);
export const apiVerifyEmail = (token) => api.post('/auth/verify-email', { token }).then((res) => res.data);
export const apiResendVerification = () => api.post('/auth/resend-verification').then((res) => res.data);

// Customers
export const getCustomers = () => api.get('/customers').then((res) => res.data);
export const createCustomer = (payload) => api.post('/customers', payload).then((res) => res.data);
export const updateCustomer = (id, payload) => api.put(`/customers/${id}`, payload).then((res) => res.data);
export const deleteCustomer = (id) => api.delete(`/customers/${id}`);
export const getCustomer360 = (id) => api.get(`/customers/${id}/360`).then((res) => res.data);

// Tickets
export const getTickets = () => api.get('/tickets').then((res) => res.data);
export const getTicket = (id) => api.get(`/tickets/${id}`).then((res) => res.data);
export const createTicket = (payload) => api.post('/tickets', payload).then((res) => res.data);
export const updateTicketStatus = (id, status) => api.put(`/tickets/${id}/status`, { status }).then((res) => res.data);
export const createSalesforceCase = (id) => api.post(`/salesforce/tickets/${id}/create-case`).then((res) => res.data);
export const getSimilarTickets = (id) => api.get(`/tickets/${id}/similar`).then((res) => res.data);
export const draftTicketReply = (id, payload) => api.post(`/tickets/${id}/draft-reply`, payload).then((res) => res.data);
export const translateTicket = (id, targetLanguage) => api.post(`/tickets/${id}/translate`, { targetLanguage }).then((res) => res.data);
export const getTicketMessages = (id) => api.get(`/tickets/${id}/messages`).then((res) => res.data);
export const postTicketMessage = (id, payload) => api.post(`/tickets/${id}/messages`, payload).then((res) => res.data);
export const assignTicket = (id, userId) => api.put(`/tickets/${id}/assign`, { userId }).then((res) => res.data);
export const getAssignees = () => api.get('/tickets/assignees').then((res) => res.data);

// AI assistant + retrieval
export const askKnowledge = (question) => api.post('/ai/answer', { question }).then((res) => res.data);
export const askCopilot = (messages) => api.post('/ai/copilot', { messages }).then((res) => res.data);
export const executeCopilotAction = (action) => api.post('/ai/actions', action).then((res) => res.data);

// Analytics + benchmarking + bulk import
export const getAnalyticsOverview = () => api.get('/analytics/overview').then((res) => res.data);
export const getBenchmark = () => api.get('/analytics/benchmark').then((res) => res.data);
export const bulkImportCustomers = (rows) => api.post('/customers/bulk', { rows }).then((res) => res.data);
export const bulkImportTickets = (rows) => api.post('/tickets/bulk', { rows }).then((res) => res.data);

// Knowledge base
export const getKbArticles = () => api.get('/kb').then((res) => res.data);
export const searchKb = (q) => api.get('/kb/search', { params: { q } }).then((res) => res.data);
export const createKbArticle = (payload) => api.post('/kb', payload).then((res) => res.data);
export const updateKbArticle = (id, payload) => api.put(`/kb/${id}`, payload).then((res) => res.data);
export const deleteKbArticle = (id) => api.delete(`/kb/${id}`);

// Status + logs
export const getLogs = () => api.get('/logs').then((res) => res.data);
export const getAiStatus = () => api.get('/ai/status').then((res) => res.data);
export const getSalesforceStatus = () => api.get('/salesforce/status').then((res) => res.data);
export const syncContact = (id) => api.post(`/salesforce/customers/${id}/sync-contact`).then((res) => res.data);

export const syncAccount = (id) => api.post(`/salesforce/customers/${id}/sync-account`).then((res) => res.data);

// Salesforce OAuth + bi-directional webhook
export const getSalesforceAuthorizeUrl = () => api.get('/salesforce/authorize-url').then((res) => res.data);
export const disconnectSalesforce = () => api.post('/salesforce/disconnect').then((res) => res.data);
export const getSalesforceWebhook = () => api.get('/salesforce/webhook').then((res) => res.data);
export const rotateSalesforceWebhook = () => api.post('/salesforce/webhook/rotate').then((res) => res.data);

// Settings
export const getIntegrations = () => api.get('/settings/integrations').then((res) => res.data);
export const saveOpenAiKey = (payload) => api.put('/settings/integrations/openai', payload).then((res) => res.data);
export const disconnectIntegration = (provider) => api.post(`/settings/integrations/${provider}/disconnect`).then((res) => res.data);
export const getUsers = () => api.get('/settings/users').then((res) => res.data);
export const createUser = (payload) => api.post('/settings/users', payload).then((res) => res.data);
export const updateUser = (id, payload) => api.put(`/settings/users/${id}`, payload).then((res) => res.data);
export const getAuditLog = () => api.get('/settings/audit').then((res) => res.data);
export const getAiUsage = () => api.get('/settings/usage').then((res) => res.data);
export const setAiMonthlyLimit = (limit) => api.put('/settings/usage/limit', { limit }).then((res) => res.data);

// Self-service widget
export const getWidgetSettings = () => api.get('/settings/widget').then((res) => res.data);
export const getWidgetPublicInfo = (key) => publicApi.get(`/public/widget/${key}`).then((res) => res.data);
export const widgetAsk = (key, question) => publicApi.post(`/public/widget/${key}/ask`, { question }).then((res) => res.data);
export const widgetEscalate = (key, payload) => publicApi.post(`/public/widget/${key}/escalate`, payload).then((res) => res.data);

// Automation
export const getAutomationRules = () => api.get('/automation/rules').then((res) => res.data);
export const createAutomationRule = (payload) => api.post('/automation/rules', payload).then((res) => res.data);
export const updateAutomationRule = (id, payload) => api.put(`/automation/rules/${id}`, payload).then((res) => res.data);
export const deleteAutomationRule = (id) => api.delete(`/automation/rules/${id}`);
export const runSlaEscalation = () => api.post('/automation/sla-run').then((res) => res.data);
