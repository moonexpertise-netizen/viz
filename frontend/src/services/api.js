import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
});

// Add token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Si token invalide/expire -> deconnexion automatique
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (email, password) => api.post('/auth/register', { email, password }),
  login: (email, password) => api.post('/auth/login', { email, password }),
};

export const clientAPI = {
  getClients: () => api.get('/clients'),
  createClient: (name) => api.post('/clients', { name }),
  getClient: (clientId) => api.get(`/clients/${clientId}`),
  deleteClient: (clientId) => api.delete(`/clients/${clientId}`),
};

export const uploadAPI = {
  preview: (formData) => api.post('/upload/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadBalance: (formData) => api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  uploadMulti: (formData) => api.post('/upload/multi', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteBalance: (balanceId) => api.delete(`/upload/${balanceId}`),
};

export const reportAPI = {
  getReports: (balanceId) => api.get(`/reports/${balanceId}`),
  getAllReports: () => api.get('/reports'),
  getEntries: (balanceId, account, from, to) => {
    const params = new URLSearchParams({ account });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    return api.get(`/reports/${balanceId}/entries?${params}`);
  },
  getCashFlowEntries: (balanceId, category, from, to) => {
    const params = new URLSearchParams({ category });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    return api.get(`/reports/${balanceId}/cashflow-entries?${params}`);
  },
  getClientEntries: (clientId, account, from, to) => {
    const params = new URLSearchParams({ account });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    return api.get(`/reports/client/${clientId}/entries?${params}`);
  },
  getClientCashFlowEntries: (clientId, category, from, to) => {
    const params = new URLSearchParams({ category });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    return api.get(`/reports/client/${clientId}/cashflow-entries?${params}`);
  },
};

export const multiperiodAPI = {
  getClientBalances: (clientId) => api.get(`/multiperiod/${clientId}`),
  compareBalances: (balanceIds) => api.post('/multiperiod/compare', { balanceIds }),
  getClientMonthly: (clientId) => api.get(`/multiperiod/${clientId}/monthly`),
};

export const exportAPI = {
  exportPDF: (balanceId, type) =>
    api.post('/export', { balanceId, type, format: 'pdf' }, { responseType: 'blob' }),
  exportExcel: (balanceId, type) =>
    api.post('/export', { balanceId, type, format: 'excel' }, { responseType: 'blob' }),
  exportHTML: (balanceId, type) =>
    api.post('/export', { balanceId, type, format: 'html' }, { responseType: 'blob' }),
};

export const insightAPI = {
  generate: (balanceId, includeHistory = false) =>
    api.post('/insights/generate', { balanceId, includeHistory }),
};

export const forecastAPI = {
  generate: (balanceId, assumptions) =>
    api.post('/forecasts/generate', { balanceId, assumptions }),
  save: (clientId, name, balanceId, config, result) =>
    api.post('/forecasts/save', { clientId, name, balanceId, config, result }),
  getForecasts: (clientId) => api.get(`/forecasts/${clientId}`),
};

export const templateAPI = {
  getTemplates: () => api.get('/templates'),
  getTemplate: (id) => api.get(`/templates/${id}`),
  createTemplate: (name, config) => api.post('/templates', { name, config }),
  updateTemplate: (id, name, config) => api.put(`/templates/${id}`, { name, config }),
  deleteTemplate: (id) => api.delete(`/templates/${id}`),
  applyTemplate: (templateId, balanceId) => api.post('/templates/apply', { templateId, balanceId }),
  applyMonthly: (templateId, clientId) => api.post('/templates/apply-monthly', { templateId, clientId }),
};

export default api;
