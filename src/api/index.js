import axios from 'axios';

const API = axios.create({
  baseURL: 'https://sindh-backend-api.onrender.com/api',
});

// Add a request interceptor to include the auth token
API.interceptors.request.use((req) => {
  const token = localStorage.getItem('token');
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

// Add a response interceptor to handle token expiration or unauthorized access
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear session only if we are not on the login page (to avoid infinite loops)
      if (!window.location.pathname.includes('/login')) {
        localStorage.removeItem('token');
        localStorage.removeItem('admin');
        window.location.href = '/'; 
      }
    }
    return Promise.reject(error);
  }
);

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
