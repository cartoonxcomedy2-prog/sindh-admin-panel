import axios from 'axios';

const ENV_API_BASE = import.meta.env.VITE_API_BASE_URL;
const DEFAULT_API_BASE = 'https://sindh-backend-api.onrender.com/api';
const GET_CACHE_TTL_MS = Number(import.meta.env.VITE_API_GET_CACHE_TTL_MS || 15000);
const GET_CACHE_STALE_MS = Number(import.meta.env.VITE_API_GET_CACHE_STALE_MS || 60000);
const GET_CACHE_MAX_ENTRIES = Number(import.meta.env.VITE_API_GET_CACHE_MAX_ENTRIES || 250);
const getCacheStore = new Map();

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

const stableSerialize = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return String(value ?? '');
};

const cloneSerializable = (value) => {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const shouldCacheGet = (config = {}) => {
  const method = String(config.method || 'get').toLowerCase();
  const responseType = String(config.responseType || '').toLowerCase();
  const url = String(config.url || '').toLowerCase();
  const skipCache =
    config.skipCache === true || config.headers?.['x-skip-cache'] === 'true';
  const isSensitiveAuthPath =
    url.includes('/users/profile') ||
    url.includes('/users/login') ||
    url.includes('/users/register');
  return (
    method === 'get' &&
    !skipCache &&
    !isSensitiveAuthPath &&
    responseType !== 'blob' &&
    responseType !== 'arraybuffer' &&
    GET_CACHE_TTL_MS > 0
  );
};

const buildGetCacheKey = (config = {}) => {
  const method = String(config.method || 'get').toLowerCase();
  const baseURL = normalizeApiBase(config.baseURL || '');
  const url = String(config.url || '');
  const params = stableSerialize(config.params || {});
  const token = getStoredToken();
  return `${method}|${baseURL}|${url}|${params}|${token}`;
};

const pruneGetCache = () => {
  const now = Date.now();
  for (const [key, entry] of getCacheStore.entries()) {
    if (entry.expiresAt + GET_CACHE_STALE_MS < now) {
      getCacheStore.delete(key);
    }
  }

  while (getCacheStore.size > GET_CACHE_MAX_ENTRIES) {
    const oldest = getCacheStore.keys().next().value;
    if (!oldest) break;
    getCacheStore.delete(oldest);
  }
};

export const clearApiGetCache = () => {
  getCacheStore.clear();
};

const API = axios.create({
  baseURL: normalizeApiBase(ENV_API_BASE || DEFAULT_API_BASE),
});

// Add a request interceptor to include the auth token
API.interceptors.request.use((req) => {
  const method = String(req.method || 'get').toLowerCase();
  const token = getStoredToken();
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }

  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    clearApiGetCache();
    return req;
  }

  if (!shouldCacheGet(req)) {
    return req;
  }

  pruneGetCache();
  const cacheKey = buildGetCacheKey(req);
  const cached = getCacheStore.get(cacheKey);
  if (!cached) {
    req.__clientCacheKey = cacheKey;
    return req;
  }

  if (cached.expiresAt > Date.now()) {
    req.adapter = async () => ({
      data: cloneSerializable(cached.data),
      status: cached.status,
      statusText: cached.statusText || 'OK',
      headers: { ...cached.headers, 'x-client-cache': 'HIT' },
      config: req,
      request: { fromCache: true },
    });
    req.__servedFromClientCache = true;
  } else {
    req.__clientCacheKey = cacheKey;
  }

  return req;
});

// Add a response interceptor to handle token expiration or unauthorized access
API.interceptors.response.use(
  (response) => {
    const config = response?.config || {};
    if (shouldCacheGet(config) && !config.__servedFromClientCache) {
      const cacheKey = config.__clientCacheKey || buildGetCacheKey(config);
      getCacheStore.set(cacheKey, {
        data: cloneSerializable(response.data),
        status: response.status,
        statusText: response.statusText,
        headers: { 'content-type': response.headers?.['content-type'] || '' },
        expiresAt: Date.now() + GET_CACHE_TTL_MS,
      });
      pruneGetCache();
    }
    return response;
  },
  (error) => {
    const config = error?.config || {};
    if (shouldCacheGet(config) && !error?.response) {
      const cacheKey = config.__clientCacheKey || buildGetCacheKey(config);
      const cached = getCacheStore.get(cacheKey);
      if (cached && cached.expiresAt + GET_CACHE_STALE_MS > Date.now()) {
        return Promise.resolve({
          data: cloneSerializable(cached.data),
          status: cached.status,
          statusText: cached.statusText || 'OK',
          headers: { ...cached.headers, 'x-client-cache': 'STALE' },
          config,
          request: { fromCache: true, stale: true },
        });
      }
    }

    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      clearStoredSession();
      clearApiGetCache();
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
