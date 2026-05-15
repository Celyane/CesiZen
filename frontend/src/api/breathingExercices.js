import api from './axios';

export const getBreathingExercices = () => api.get('/api/breathing-exercices');

export const getBreathingExercice = (id) => api.get(`/api/breathing-exercices/${id}`);

export const createBreathingExercice = (data) => api.post('/api/breathing-exercices', data);

export const updateBreathingExercice = (id, data) => api.put(`/api/breathing-exercices/${id}`, data);

export const deleteBreathingExercice = (id) => api.delete(`/api/breathing-exercices/${id}`);

export const completeBreathingExercice = (id) => api.post(`/api/breathing-exercices/${id}/complete`);
