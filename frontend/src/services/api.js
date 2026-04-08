import axios from 'axios';

const API_BASE = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const novelApi = {
  getAll: () => api.get('/novels'),
  getById: (id) => api.get(`/novels/${id}`),
  create: (data) => api.post('/novels', data),
  update: (id, data) => api.put(`/novels/${id}`, data),
  delete: (id) => api.delete(`/novels/${id}`),
};

export const architectureApi = {
  getByNovelId: (novelId) => api.get(`/novels/${novelId}/architectures`),
  getById: (id) => api.get(`/architectures/${id}`),
  create: (novelId, data) => api.post(`/novels/${novelId}/architectures`, data),
  update: (id, data) => api.put(`/architectures/${id}`, data),
  delete: (id) => api.delete(`/architectures/${id}`),
  generateByAi: (novelId, data) => api.post(`/novels/${novelId}/generate-architecture`, data),
  generateChapterArchitectures: (novelId, volumeId) =>
    api.post(`/novels/${novelId}/generate-chapter-architectures`, { volumeId }),
  batchCreateChapterArchitectures: (novelId, volumeId, chapters) =>
    api.post(`/novels/${novelId}/batch-create-chapter-architectures`, { volumeId, chapters }),
  generateChapterContent: (novelId, chapterArchId) =>
    api.post(`/novels/${novelId}/generate-chapter-content`, { chapterArchId }),
  batchGenerateChapters: (novelId, volumeId) =>
    api.post(`/novels/${novelId}/batch-generate-chapters`, { volumeId }),
  reviewArchitectures: (novelId) =>
    api.post(`/novels/${novelId}/review-architectures`),
  rewriteArchitectures: (novelId, reviewResult, userPrompt) =>
    api.post(`/novels/${novelId}/rewrite-architectures`, { reviewResult, userPrompt }),
  applyRewrite: (novelId, rewriteResult) =>
    api.post(`/novels/${novelId}/apply-rewrite`, rewriteResult),
};

export const chapterApi = {
  getByNovelId: (novelId) => api.get(`/novels/${novelId}/chapters`),
  getById: (id) => api.get(`/chapters/${id}`),
  create: (novelId, data) => api.post(`/novels/${novelId}/chapters`, data),
  update: (id, data) => api.put(`/chapters/${id}`, data),
  delete: (id) => api.delete(`/chapters/${id}`),
  generate: (id, templateId) => api.post(`/chapters/${id}/generate`, { templateId }),
  regenerate: (id) => api.post(`/chapters/${id}/regenerate`),
  getVersions: (id) => api.get(`/chapters/${id}/versions`),
  restoreVersion: (id, version) => api.post(`/chapters/${id}/restore/${version}`),
};

export const scheduleApi = {
  getAll: () => api.get('/schedules'),
  create: (data) => api.post('/schedules', data),
  delete: (id) => api.delete(`/schedules/${id}`),
};

export const configApi = {
  getAll: () => api.get('/configs'),
  update: (key, value, description) => api.put(`/configs/${key}`, { value, description }),
};

export const templateApi = {
  getAll: () => api.get('/templates'),
  create: (data) => api.post('/templates', data),
  update: (id, data) => api.put(`/templates/${id}`, data),
  delete: (id) => api.delete(`/templates/${id}`),
  setDefault: (id) => api.post(`/templates/${id}/set-default`),
};

export const exportApi = {
  exportNovel: (id, scope = 'full', volumeId = null) => {
    const params = new URLSearchParams({ scope });
    if (volumeId) params.append('volumeId', volumeId);
    return api.get(`/novels/${id}/export?${params.toString()}`, {
      responseType: 'text',
    });
  },
};

export default api;
