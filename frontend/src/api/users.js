import api from './axios';

export const getUsers = () => api.get('/api/users');

export const updateUserRole = (id, role) => api.put(`/api/users/${id}/role`, { role });

export const deleteUser = (id) => api.delete(`/api/users/${id}`);
