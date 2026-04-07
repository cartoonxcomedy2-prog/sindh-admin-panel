import axios from 'axios';

const ENV_API_BASE = import.meta.env.VITE_API_BASE_URL;
const DEFAULT_API_BASE = 'https://sindh-backend-api.onrender.com/api';

const normalizeApiBase = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_API_BASE;
  return raw.replace(/\/+$/, '');
};

const getStoredToken = () =>
  localStorage.getItem('token') || sessionStorage.getItem('token') || '';

const clearStoredSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('admin');
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('admin');
};

const redirectToLogin = () => {
  const path = window.location.pathname || '/';
  if (path.startsWith('/login')) return;

  const nextPath = `${path}${window.location.search || ''}${window.location.hash || ''}`;
  const encodedNext = encodeURIComponent(nextPath);
  window.location.replace(`/login?next=${encodedNext}`);
};

const API = axios.create({
  baseURL: normalizeApiBase(ENV_API_BASE || DEFAULT_API_BASE),
});

// Add a request interceptor to include the auth token
API.interceptors.request.use((req) => {
  const token = getStoredToken();
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

// Add a response interceptor to handle token expiration or unauthorized access
API.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      clearStoredSession();
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export const getServerBaseUrl = () => {
  const base = normalizeApiBase(API.defaults.baseURL || DEFAULT_API_BASE);
  return base.endsWith('/api') ? base.slice(0, -4) : base;
};

export const resolveAssetUrl = (value) => {
  if (!value) return '';
  const raw = value.toString();
  const httpIdx = raw.indexOf('http://');
  const httpsIdx = raw.indexOf('https://');
  const realUrlIdx =
    httpIdx !== -1 && (httpsIdx === -1 || httpIdx < httpsIdx)
      ? httpIdx
      : httpsIdx;

  if (realUrlIdx !== -1) return raw.substring(realUrlIdx);
  if (raw.startsWith('data:')) return raw;

  const server = getServerBaseUrl();
  if (raw.startsWith('/uploads/')) return `${server}${raw}`;
  if (raw.startsWith('uploads/')) return `${server}/${raw}`;
  return `${server}/uploads/${raw}`;
};

// Auth
export const login = (formData) => API.post('/users/login', formData);
export const fetchProfile = () => API.get('/users/profile');

// Users
export const fetchUsers = () => API.get('/users');

// Banners
export const fetchBanners = () => API.get('/banners');
export const createBanner = (data) => API.post('/banners', data);

// Universities
export const fetchUniversities = () => API.get('/universities');
export const createUniversity = (data) => API.post('/universities', data);

// Scholarships
export const fetchScholarships = () => API.get('/scholarships');
export const createScholarship = (data) => API.post('/scholarships', data);

export default API;
