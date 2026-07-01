import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

// Deconnexion auto si session invalide
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/login')) {
      window.dispatchEvent(new CustomEvent('mv:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export const authAPI = {
  session: () => api.get('/session'),
  login: (email, password) => api.post('/login', { email, password }),
  logout: () => api.post('/logout'),
  forgot: (email) => api.post('/login', { action: 'forgot', email }),
  reset: (token, password) => api.post('/login', { action: 'reset', token, password }),
};

// Stockage serveur des exercices synchronisés (durable + multi-appareils)
export const storeAPI = {
  list: (companyId) => api.get('/store', { params: { company_id: companyId } }),
  save: (companyId, fyId, entry) => api.post('/store', { company_id: companyId, fy_id: fyId, entry }),
  remove: (companyId, fyId) => api.delete('/store', { params: { company_id: companyId, fy_id: fyId } }),
};

export const dataAPI = {
  companies: () => api.get('/companies'),
  fiscalYears: (companyId) => api.get('/fiscal-years', { params: { company_id: companyId } }),
  report: (params) => api.get('/report', { params }),
  monthly: (params) => api.get('/monthly', { params }),
  entries: (params) => api.get('/entries', { params }),
  cashflowEntries: (params) => api.get('/cashflow-entries', { params }),
  dashboardRow: (companyId) => api.get('/dashboard-row', { params: { company_id: companyId } }),
};

export default api;
