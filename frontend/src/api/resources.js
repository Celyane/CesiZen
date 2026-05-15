import api from './axios';

export const getResources = () => api.get('/api/resources');

export const getResource = (id) => api.get(`/api/resources/${id}`);

export const createResource = (data) => api.post('/api/resources', data);

export const updateResource = (id, data) => api.put(`/api/resources/${id}`, data);

export const deleteResource = (id) => api.delete(`/api/resources/${id}`);

export const markResourceRead = (id) => api.post(`/api/resources/${id}/read`);

export const toggleFavorite = (id) => api.post(`/api/resources/${id}/favorite`);
