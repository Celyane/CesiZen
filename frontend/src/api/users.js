import api from './axios';

export const getUsers = () => api.get('/api/users');

export const createUser = (data) => api.post('/api/users', data);

export const updateUserRole = (id, role) => api.put(`/api/users/${id}/role`, { role });

export const toggleUserActive = (id) => api.put(`/api/users/${id}/toggle-active`);

export const deleteUser = (id) => api.delete(`/api/users/${id}`);
