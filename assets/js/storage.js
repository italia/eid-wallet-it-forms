/**
 * storage.js – localStorage management for eid-wallet-it-forms
 *
 * Each saved form is stored as an entry in the localStorage key
 * "eid-wallet-forms" (a JSON array).
 */

const STORAGE_KEY = 'eid-wallet-forms';

/**
 * Return all saved forms (array, sorted newest-first).
 */
function getAllForms() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const forms = raw ? JSON.parse(raw) : [];
    return forms.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  } catch {
    return [];
  }
}

/**
 * Save (create or update) a form entry.
 * @param {string} id          – UUID (pass null to create a new one)
 * @param {string} name        – Human-readable name given by the user
 * @param {object} data        – Form data object
 * @param {string} [webformId] – id from webforms-manifest.json (tipo di webform)
 * @returns {string} The id of the saved form
 */
function saveForm(id, name, data, webformId) {
  const forms = getAllForms();
  const now = new Date().toISOString();

  const idx = id ? forms.findIndex(f => f.id === id) : -1;
  if (idx >= 0) {
    forms[idx].name = name;
    forms[idx].data = data;
    forms[idx].updated_at = now;
    if (webformId) {
      forms[idx].webform_id = webformId;
    }
  } else {
    const newId = generateId();
    forms.push({
      id: newId,
      name: name || 'Form senza nome',
      webform_id: webformId || null,
      created_at: now,
      updated_at: now,
      data: data
    });
    id = newId;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      throw new Error('Spazio di archiviazione locale esaurito.');
    }
    throw e;
  }
  return id;
}

/**
 * Load a single form by id.
 * @param {string} id
 * @returns {object|null}
 */
function loadForm(id) {
  const forms = getAllForms();
  return forms.find(f => f.id === id) || null;
}

/**
 * Delete a form by id.
 * @param {string} id
 */
function deleteForm(id) {
  const forms = getAllForms().filter(f => f.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(forms));
}

/**
 * Generate a simple UUID v4-like identifier.
 * @returns {string}
 */
function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Return a human-readable relative time string.
 * @param {string} isoString
 * @returns {string}
 */
function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)   return 'Adesso';
  if (mins  < 60)  return `${mins} min fa`;
  if (hours < 24)  return `${hours} or${hours === 1 ? 'a' : 'e'} fa`;
  if (days  < 7)   return `${days} giorn${days === 1 ? 'o' : 'i'} fa`;
  return new Date(isoString).toLocaleDateString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

/**
 * Format an ISO date string to a localized datetime string.
 * @param {string} isoString
 * @returns {string}
 */
function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
