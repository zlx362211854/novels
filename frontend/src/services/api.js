import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export const novelApi = {
  getAll: () => api.get('/novels'),
  getById: (id) => api.get(`/novels/${id}`),
  create: (data) => api.post('/novels', data),
  bootstrap: (data) => api.post('/novels/bootstrap', data),
  importJson: (bundle) => api.post('/novels/import-json', { bundle }),
  update: (id, data) => api.put(`/novels/${id}`, data),
  delete: (id) => api.delete(`/novels/${id}`),
};

export const architectureApi = {
  getByNovelId: (novelId) => api.get(`/novels/${novelId}/architectures`),
  getById: (id) => api.get(`/architectures/${id}`),
  create: (novelId, data) => api.post(`/novels/${novelId}/architectures`, data),
  update: (id, data) => api.put(`/architectures/${id}`, data),
  delete: (id) => api.delete(`/architectures/${id}`),
  renumberChapters: (novelId) => api.post(`/novels/${novelId}/chapters/renumber`),
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
  reviewChapterArchitectures: (novelId) =>
    api.post(`/novels/${novelId}/review-chapter-architectures`),
  rewriteArchitectures: (novelId, reviewResult, userPrompt) =>
    api.post(`/novels/${novelId}/rewrite-architectures`, { reviewResult, userPrompt }),
  repairChapterArchitectures: (novelId, reviewResult, userPrompt = '') =>
    api.post(`/novels/${novelId}/repair-chapter-architectures`, { reviewResult, userPrompt }),
  applyRewrite: (novelId, rewriteResult) =>
    api.post(`/novels/${novelId}/apply-rewrite`, rewriteResult),
  applyChapterArchitectureRepair: (novelId, repairResult) =>
    api.post(`/novels/${novelId}/apply-chapter-architecture-repair`, repairResult),
};

export const chapterApi = {
  getByNovelId: (novelId) => api.get(`/novels/${novelId}/chapters`),
  getById: (id) => api.get(`/chapters/${id}`),
  create: (novelId, data) => api.post(`/novels/${novelId}/chapters`, data),
  update: (id, data) => api.put(`/chapters/${id}`, data),
  delete: (id) => api.delete(`/chapters/${id}`),
  generate: (id, userPrompt = '') => api.post(`/chapters/${id}/generate`, { userPrompt }),
  regenerate: (id) => api.post(`/chapters/${id}/regenerate`),
  review: (id) => api.post(`/chapters/${id}/review`),
  revise: (id, reviewResult, userPrompt = '') => api.post(`/chapters/${id}/revise`, { reviewResult, userPrompt }),
  tune: (id, userPrompt = '') => api.post(`/chapters/${id}/tune`, { userPrompt }),
  getVersions: (id) => api.get(`/chapters/${id}/versions`),
  restoreVersion: (id, version) => api.post(`/chapters/${id}/versions/${version}/restore`),
  getMemory: (id) => api.get(`/chapters/${id}/memory`),
  updateMemory: (id, data) => api.put(`/chapters/${id}/memory`, data),
  regenerateMemory: (id) => api.post(`/chapters/${id}/memory/regenerate`),
};

export const storyBibleApi = {
  listByNovelId: (novelId) => api.get(`/novels/${novelId}/story-bible`),
  getById: (novelId, entryId) => api.get(`/novels/${novelId}/story-bible/${entryId}`),
  create: (novelId, data) => api.post(`/novels/${novelId}/story-bible`, data),
  update: (novelId, entryId, data) => api.put(`/novels/${novelId}/story-bible/${entryId}`, data),
  delete: (novelId, entryId) => api.delete(`/novels/${novelId}/story-bible/${entryId}`),
};

export const multiChapterReviewApi = {
  start: (novelId, chapterIds) =>
    api.post('/multi-chapter-reviews', { novelId, chapterIds }),
  getReview: (reviewId) =>
    api.get(`/multi-chapter-reviews/${reviewId}`),
  listByNovel: (novelId) =>
    api.get(`/multi-chapter-reviews/novel/${novelId}`),
  startFix: (reviewId, selectedIssueIds, issueSuggestions = {}) =>
    api.post(`/multi-chapter-reviews/${reviewId}/fix`, { selectedIssueIds, issueSuggestions }),
  getDrafts: (reviewId) =>
    api.get(`/multi-chapter-reviews/${reviewId}/drafts`),
  apply: (reviewId, chapterId, accept) =>
    api.post(`/multi-chapter-reviews/${reviewId}/apply`, { chapterId, accept }),
};

export const scheduleApi = {
  getAll: () => api.get('/schedules'),
  create: (data) => api.post('/schedules', data),
  delete: (id) => api.delete(`/schedules/${id}`),
};

export const recurringTaskApi = {
  get: (novelId) => api.get(`/novels/${novelId}/recurring-task`),
  upsert: (novelId, payload) => api.put(`/novels/${novelId}/recurring-task`, payload),
  remove: (novelId) => api.delete(`/novels/${novelId}/recurring-task`),
  runNow: (novelId) => api.post(`/novels/${novelId}/recurring-task/run-now`),
};

export const configApi = {
  getAll: () => api.get('/configs'),
  update: (key, value, description) => api.put(`/configs/${key}`, { value, description }),
};

export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

export const publishApi = {
  publish: (chapterId, platforms, mode = 'publish') => api.post(`/publish/${chapterId}`, { platforms, mode }),
  login: (platform) => api.post(`/publish/login/${platform}`),
  status: (platform) => api.get(`/publish/status/${platform}`),
  platforms: () => api.get('/publish/platforms'),
};

export const exportApi = {
  exportNovel: (id, scope = 'full', volumeId = null) => {
    const params = new URLSearchParams({ scope });
    if (volumeId) params.append('volumeId', volumeId);
    return api.get(`/novels/${id}/export?${params.toString()}`, {
      responseType: 'text',
    });
  },
  exportNovelJson: (id) =>
    api.get(`/novels/${id}/export-json`, {
      responseType: 'json',
    }),
};

export default api;
