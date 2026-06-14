import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1',
  timeout: 10000,
});

export const getCustomers = () => api.get('/customers').then((res) => res.data);
export const createCustomer = (payload) => api.post('/customers', payload).then((res) => res.data);
export const updateCustomer = (id, payload) => api.put(`/customers/${id}`, payload).then((res) => res.data);
export const deleteCustomer = (id) => api.delete(`/customers/${id}`);
export const getCustomer360 = (id) => api.get(`/customers/${id}/360`).then((res) => res.data);

export const getTickets = () => api.get('/tickets').then((res) => res.data);
export const createTicket = (payload) => api.post('/tickets', payload).then((res) => res.data);
export const updateTicketStatus = (id, status) => api.put(`/tickets/${id}/status`, { status }).then((res) => res.data);
export const createSalesforceCase = (id) => api.post(`/salesforce/tickets/${id}/create-case`).then((res) => res.data);

export const getLogs = () => api.get('/logs').then((res) => res.data);
export const getSalesforceStatus = () => api.get('/salesforce/status').then((res) => res.data);
export const syncContact = (id) => api.post(`/salesforce/customers/${id}/sync-contact`).then((res) => res.data);
