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
  login: (password) => api.post('/login', { password }),
  logout: () => api.post('/logout'),
};

export const dataAPI = {
  companies: () => api.get('/companies'),
  fiscalYears: (companyId) => api.get('/fiscal-years', { params: { company_id: companyId } }),
  report: (params) => api.get('/report', { params }),
};

export default api;
