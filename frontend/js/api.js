const API_BASE = 'http://127.0.0.1:8899';

const api = {
  async _fetch(path, options = {}) {
    const resp = await fetch(API_BASE + path, options);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.message || err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  },

  healthCheck:   () => api._fetch('/health'),
  capabilities:  () => api._fetch('/capabilities'),
  modelStatus:   () => api._fetch('/model-status'),
  downloadModel: () => api._fetch('/download-model', { method: 'POST' }),
  modelProgress: () => api._fetch('/model-download-progress'),

  config:    () => api._fetch('/config'),
  setConfig: (data) => api._fetch('/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  license:    () => api._fetch('/license'),
  activate:   (key) => api._fetch('/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ license_key: key }),
  }),
  deactivate: () => api._fetch('/deactivate', { method: 'POST' }),

  previewFolder: (folder) => api._fetch('/preview?folder=' + encodeURIComponent(folder)),

  startScan: (folder, threshold, opts = {}) => api._fetch('/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder, threshold, ...opts }),
  }),
  stopScan:    () => api._fetch('/stop', { method: 'POST' }),
  pauseScan:   () => api._fetch('/pause', { method: 'POST' }),
  resumeScan:  () => api._fetch('/resume', { method: 'POST' }),
  getProgress: () => api._fetch('/progress'),
  folderDiff:  (folder) => api._fetch('/folder-diff?folder=' + encodeURIComponent(folder)),

  getResults: (page = 1, perPage = 50, sortBy = 'score', sortOrder = 'desc', type = 'all', skipDuplicates = false) =>
    api._fetch(`/results?page=${page}&per_page=${perPage}&sort_by=${sortBy}&sort_order=${sortOrder}&type=${type}&skip_duplicates=${skipDuplicates}`),

  getAllResults: (skipDuplicates = false) =>
    api._fetch(`/results?page=1&per_page=9999&sort_by=score&sort_order=desc&skip_duplicates=${skipDuplicates}`),

  getThumb:   (idx) => api._fetch(`/thumb/${idx}`),
  filmstrip:  (idx) => api._fetch(`/filmstrip/${idx}`),
  docDetails: (idx) => api._fetch(`/doc-details/${idx}`),

  deleteFiles: (paths) => api._fetch('/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  }),

  quarantineFiles: (paths, destination = '') => api._fetch('/quarantine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths, destination }),
  }),

  stageDelete:  (paths) => api._fetch('/stage-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths }),
  }),
  confirmDelete: (stagingId) => api._fetch('/confirm-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staging_id: stagingId }),
  }),
  undoDelete: (stagingId) => api._fetch('/undo-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staging_id: stagingId }),
  }),

  history:       () => api._fetch('/history'),
  deleteHistory: (id) => api._fetch(`/history/${id}`, { method: 'DELETE' }),

  exportCsvUrl: () => API_BASE + '/export?format=csv',
};
