import axios from 'axios';

const ENV_API_BASE = import.meta.env.VITE_API_BASE_URL;
const DEFAULT_API_BASE = 'https://sindh-backend-api.onrender.com/api';
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 45000);
const API_RETRY_DELAY_MS = Number(import.meta.env.VITE_API_RETRY_DELAY_MS || 1500);
const API_MAX_TIMEOUT_RETRIES = Number(import.meta.env.VITE_API_MAX_TIMEOUT_RETRIES || 1);
const GET_CACHE_TTL_MS = 0; // Disabled cache to show real-time data
const GET_CACHE_STALE_MS = 0;
const GET_CACHE_MAX_ENTRIES = 0;
const ADMIN_SESSION_STARTED_AT_KEY = 'admin_session_started_at';
const ADMIN_SESSION_MAX_AGE_MS = Number(
  import.meta.env.VITE_ADMIN_SESSION_MAX_AGE_MS || 8 * 60 * 60 * 1000
);
const getCacheStore = new Map();

const normalizeApiBase = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return DEFAULT_API_BASE;
  return raw.replace(/\/+$/, '');
};

const resolveApiBase = () => {
  return normalizeApiBase(ENV_API_BASE || DEFAULT_API_BASE);
};

const clearStorageSession = (storage) => {
  storage.removeItem('token');
  storage.removeItem('admin');
  storage.removeItem(ADMIN_SESSION_STARTED_AT_KEY);
};

const hasValidStorageSession = (storage) => {
  const token = String(storage.getItem('token') || '').trim();
  if (!token) return false;
  const startedAtRaw = storage.getItem(ADMIN_SESSION_STARTED_AT_KEY);
  const startedAt = Number(startedAtRaw || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    clearStorageSession(storage);
    return false;
  }
  if (Date.now() - startedAt > ADMIN_SESSION_MAX_AGE_MS) {
    clearStorageSession(storage);
    return false;
  }
  return true;
};

const getStoredToken = () => {
  for (const storage of [localStorage, sessionStorage]) {
    if (!hasValidStorageSession(storage)) continue;
    const token = String(storage.getItem('token') || '').trim();
    if (token) return token;
  }
  return '';
};

const clearStoredSession = () => {
  clearStorageSession(localStorage);
  clearStorageSession(sessionStorage);
};

const getCurrentAppPath = () => {
  const hash = String(window.location.hash || '');
  if (hash.startsWith('#/')) {
    return hash.slice(1) || '/';
  }
  const path = window.location.pathname || '/';
  return `${path}${window.location.search || ''}${window.location.hash || ''}`;
};

const redirectToLogin = () => {
  const currentPath = getCurrentAppPath();
  if (currentPath.startsWith('/login')) return;

  const encodedNext = encodeURIComponent(currentPath);
  const usesHashRouting = String(window.location.hash || '').startsWith('#/');
  if (usesHashRouting) {
    window.location.replace(`/#/login?next=${encodedNext}`);
    return;
  }
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

const isTimeoutLikeError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout');
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
  baseURL: resolveApiBase(),
  timeout: Number.isFinite(API_TIMEOUT_MS) && API_TIMEOUT_MS > 0 ? API_TIMEOUT_MS : 15000,
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
    const method = String(config.method || 'get').toLowerCase();
    const timeoutRetries = Number(config.__timeoutRetryCount || 0);
    const canRetry =
      method === 'get' &&
      Number.isFinite(API_MAX_TIMEOUT_RETRIES) &&
      API_MAX_TIMEOUT_RETRIES > 0 &&
      timeoutRetries < API_MAX_TIMEOUT_RETRIES &&
      isTimeoutLikeError(error);

    if (canRetry) {
      config.__timeoutRetryCount = timeoutRetries + 1;
      const retryDelay = Number.isFinite(API_RETRY_DELAY_MS) && API_RETRY_DELAY_MS > 0
        ? API_RETRY_DELAY_MS
        : 0;

      return new Promise((resolve) => setTimeout(resolve, retryDelay)).then(() =>
        API.request(config)
      );
    }

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
    if (status === 401) {
      clearStoredSession();
      clearApiGetCache();
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export const getServerBaseUrl = () => {
  return normalizeApiBase(API.defaults.baseURL || DEFAULT_API_BASE);
};

export const resolveAssetUrl = (value) => {
  if (!value) return '';
  const raw = value.toString().trim();
  const embedded = extractEmbeddedUrl(raw);

  // 1. Handle remote URLs
  if (embedded) {
    return embedded;
  }

  // 2. Handle data URLs
  if (raw.startsWith('data:')) return raw;

  // 3. Handle local paths
  const server = getServerBaseUrl();
  let cleanPath = raw;
  if (cleanPath.includes('uploads/')) {
    cleanPath = cleanPath.split('uploads/').pop();
  }
  if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);

  return `${server}/uploads/${cleanPath}`;
};

const extractEmbeddedUrl = (value) => {
  if (!value) return '';
  const matched = value.match(/https?:\/\/[^\s"<>]+/i);
  if (!matched?.[0]) return '';
  return matched[0].replace(/[\]),.;.]+$/g, '');
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
