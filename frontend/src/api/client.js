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
    const isAuthRoute = original?.url?.includes('/auth/');

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
export const createTicket = (payload) => api.post('/tickets', payload).then((res) => res.data);
export const updateTicketStatus = (id, status) => api.put(`/tickets/${id}/status`, { status }).then((res) => res.data);
export const createSalesforceCase = (id) => api.post(`/salesforce/tickets/${id}/create-case`).then((res) => res.data);

// Status + logs
export const getLogs = () => api.get('/logs').then((res) => res.data);
export const getAiStatus = () => api.get('/ai/status').then((res) => res.data);
export const getSalesforceStatus = () => api.get('/salesforce/status').then((res) => res.data);
export const syncContact = (id) => api.post(`/salesforce/customers/${id}/sync-contact`).then((res) => res.data);

// Salesforce OAuth
export const getSalesforceAuthorizeUrl = () => api.get('/salesforce/authorize-url').then((res) => res.data);
export const disconnectSalesforce = () => api.post('/salesforce/disconnect').then((res) => res.data);

// Settings
export const getIntegrations = () => api.get('/settings/integrations').then((res) => res.data);
export const saveOpenAiKey = (payload) => api.put('/settings/integrations/openai', payload).then((res) => res.data);
export const disconnectIntegration = (provider) => api.post(`/settings/integrations/${provider}/disconnect`).then((res) => res.data);
export const getUsers = () => api.get('/settings/users').then((res) => res.data);
export const createUser = (payload) => api.post('/settings/users', payload).then((res) => res.data);
export const updateUser = (id, payload) => api.put(`/settings/users/${id}`, payload).then((res) => res.data);
export const getAuditLog = () => api.get('/settings/audit').then((res) => res.data);
