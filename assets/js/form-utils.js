/**
 * form-utils.js – helpers shared between index.html and form.html
 */

/* ── Schema loading & transformation ─────────────────────── */

/**
 * Fetch the JSON schema and transform it so that @json-editor/json-editor
 * can consume it (Draft-07 compatible conventions).
 *
 * Transformations applied:
 *  1. "$defs" → "definitions" (and "$ref": "#/$defs/X" → "#/definitions/X")
 *  2. Add "readOnly": true to 'domanda' and 'suggerimento' sub-fields of the
 *     campo_risposta and campo_booleano definitions so the form shows them
 *     as informational labels, not editable inputs.
 *  3. Add "format": "tabs" to the root object so top-level sections are tabs.
 *
 * @param {string} schemaUrl
 * @returns {Promise<object>} transformed schema
 */
async function loadAndTransformSchema(schemaUrl) {
  const resp = await fetch(schemaUrl);
  if (!resp.ok) throw new Error(`Impossibile caricare lo schema: ${resp.status}`);
  let schema = await resp.json();

  // 1. Normalise $defs → definitions
  let str = JSON.stringify(schema)
    .replace(/"#\/\$defs\//g, '"#/definitions/')
    .replace(/"\$defs"/g, '"definitions"');
  schema = JSON.parse(str);

  // 2. Make domanda/suggerimento read-only in all definitions
  if (schema.definitions) {
    for (const defName of Object.keys(schema.definitions)) {
      const def = schema.definitions[defName];
      if (def.properties) {
        ['domanda', 'suggerimento'].forEach(field => {
          if (def.properties[field]) {
            def.properties[field].readOnly = true;
          }
        });
      }
    }
  }

  // 3. Tabs layout for the root object
  schema.format = 'tabs';

  return schema;
}

/**
 * Fetch the example data JSON.
 * @param {string} exampleUrl
 * @returns {Promise<object>}
 */
async function loadExampleData(exampleUrl) {
  const resp = await fetch(exampleUrl);
  if (!resp.ok) throw new Error(`Impossibile caricare i dati di esempio: ${resp.status}`);
  return resp.json();
}

/* ── Schema validation with AJV ──────────────────────────── */

/**
 * Validate data against the original schema using AJV 8 (Draft 2020-12).
 * Supports both the `Ajv2020` global (from ajv2020.bundle) and `Ajv` (from other builds).
 * @param {object} schema – The raw schema (before transformation)
 * @param {object} data
 * @returns {{ valid: boolean, errors: Array<{instancePath:string,message:string}> }}
 */
function validateWithAjv(schema, data) {
  // Prefer Draft 2020-12 class, fall back to generic Ajv
  const AjvClass =
    (typeof Ajv2020 !== 'undefined' && Ajv2020) ||
    (typeof Ajv    !== 'undefined' && Ajv)      ||
    null;

  if (!AjvClass) return { valid: true, errors: [] };

  try {
    const ajv = new AjvClass({ allErrors: true, strict: false });
    // Apply formats plugin if available
    if (typeof addFormats !== 'undefined') addFormats(ajv);
    const validate = ajv.compile(schema);
    const valid = validate(data);
    return { valid, errors: validate.errors || [] };
  } catch (e) {
    console.warn('AJV validation error:', e);
    return { valid: false, errors: [{ instancePath: '', message: e.message }] };
  }
}

/* ── Toast notifications ─────────────────────────────────── */

/**
 * Show a Bootstrap toast notification.
 * @param {string} message
 * @param {'success'|'danger'|'warning'|'info'} type
 * @param {number} delay  – ms before auto-hide (0 = no auto-hide)
 */
function showToast(message, type = 'info', delay = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const id   = 'toast-' + Date.now();
  const icon = { success: 'check-circle-fill', danger: 'x-circle-fill',
                 warning: 'exclamation-triangle-fill', info: 'info-circle-fill' }[type] || 'info-circle-fill';

  const el = document.createElement('div');
  el.id = id;
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'assertive');
  el.setAttribute('aria-atomic', 'true');

  const wrapper = document.createElement('div');
  wrapper.className = 'd-flex';

  const body = document.createElement('div');
  body.className = 'toast-body';

  const icon_el = document.createElement('i');
  icon_el.className = `bi bi-${icon} me-2`;
  body.appendChild(icon_el);
  body.appendChild(document.createTextNode(message));

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn-close btn-close-white me-2 m-auto';
  closeBtn.setAttribute('data-bs-dismiss', 'toast');
  closeBtn.setAttribute('aria-label', 'Chiudi');

  wrapper.appendChild(body);
  wrapper.appendChild(closeBtn);
  el.appendChild(wrapper);
  container.appendChild(el);

  const toast = new bootstrap.Toast(el, { autohide: delay > 0, delay });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

/* ── File reading helper ─────────────────────────────────── */

/**
 * Open a file-picker, read the selected file, and resolve with its text.
 * @param {string} accept – MIME type / extension filter
 * @returns {Promise<{ text: string, name: string }>}
 */
function pickFile(accept = '*') {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file', accept, style: 'display:none'
    });
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) { document.body.removeChild(input); reject(new Error('Nessun file selezionato')); return; }
      const reader = new FileReader();
      reader.onload = e => { document.body.removeChild(input); resolve({ text: e.target.result, name: file.name }); };
      reader.onerror = () => { document.body.removeChild(input); reject(new Error('Errore lettura file')); };
      reader.readAsText(file, 'UTF-8');
    });
    input.addEventListener('cancel', () => { document.body.removeChild(input); reject(new Error('Annullato')); });
    input.click();
  });
}

/* ── Sanitize a string for use as a filename ─────────────── */
function sanitizeFilename(name) {
  return (name || 'form').replace(/[^a-z0-9_\-\s]/gi, '_').replace(/\s+/g, '_').substring(0, 64);
}
