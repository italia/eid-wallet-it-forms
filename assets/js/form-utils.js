/**
 * form-utils.js – helpers shared between index.html and form.html
 */

const DEFAULT_WEBFORMS_MANIFEST = 'webforms-manifest.json';

/* ── Webforms manifest (remote schema / data URLs per form) ── */

/**
 * @param {string} [manifestPath] – relative path or absolute URL
 * @returns {Promise<object>}
 */
async function loadWebformsManifest(manifestPath) {
  const path = manifestPath || DEFAULT_WEBFORMS_MANIFEST;
  const resolved = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : new URL(path, window.location.href).href;
  const resp = await fetch(resolved);
  if (!resp.ok) {
    throw new Error(`Manifest non disponibile (${resp.status}): ${resolved}`);
  }
  const manifest = await resp.json();
  if (!Array.isArray(manifest.webforms) || manifest.webforms.length === 0) {
    throw new Error('Manifest non valido: elenco webforms mancante o vuoto');
  }
  return manifest;
}

function getDefaultWebformId(manifest) {
  const { defaultWebform, webforms } = manifest;
  if (defaultWebform && webforms.some(w => w.id === defaultWebform)) {
    return defaultWebform;
  }
  return webforms[0].id;
}

/**
 * @param {object} manifest
 * @param {string} webformId
 * @returns {object} entry with schemaUrl, dataUrl, …
 */
function findWebformEntry(manifest, webformId) {
  const w = manifest.webforms.find(x => x.id === webformId);
  if (!w) {
    throw new Error('Webform non trovato nel manifest: ' + webformId);
  }
  if (!w.schemaUrl || !w.dataUrl) {
    throw new Error('Voce manifest incompleta (servono schemaUrl e dataUrl): ' + webformId);
  }
  return w;
}

/**
 * Informazioni di versione dichiarate **dentro** i file JSON Schema e JSON di istanza
 * (non nel manifest). Usa campi comuni: schema `$version`, `$id`; dato `metadata.versione`, `$schema` (solo se URL assoluto).
 * Con `urlHints.dataUrl` aggiunge la riga **Sorgente JSON** con l’URL reale di caricamento (HTTPS), così non si mostra
 * un `$schema` relativo nel file (es. `./json-schemas/...`).
 *
 * @param {object|null} rawSchema – schema così come restituito dal fetch (prima delle trasformazioni per l’editor)
 * @param {object|null} data – JSON di esempio o bozza aperta nell’editor
 * @param {{ dataUrl?: string, schemaUrl?: string }} [urlHints] – URL usati dall’app per fetch (manifest / assoluti)
 * @returns {{ items: Array<{ section: 'schema'|'data', label: string, value: string, isUrl?: boolean }>, hasAny: boolean, hasSchemaVersion: boolean, hasDataVersion: boolean, missingDeclaredVersion: boolean }}
 */
function extractDocumentVersioning(rawSchema, data, urlHints) {
  const hints = urlHints && typeof urlHints === 'object' ? urlHints : {};
  const dataSourceUrl = hints.dataUrl != null ? String(hints.dataUrl).trim() : '';
  const items = [];
  let hasSchemaVersion = false;
  let hasDataVersion = false;
  if (rawSchema && typeof rawSchema === 'object') {
    if (rawSchema.$version != null && String(rawSchema.$version).trim() !== '') {
      hasSchemaVersion = true;
      items.push({
        section: 'schema',
        label: '$version',
        value: String(rawSchema.$version).trim()
      });
    }
    if (rawSchema.$id != null && String(rawSchema.$id).trim() !== '') {
      const id = String(rawSchema.$id).trim();
      items.push({
        section: 'schema',
        label: '$id',
        value: id,
        isUrl: /^https?:\/\//i.test(id)
      });
    }
  }
  if (data && typeof data === 'object') {
    if (dataSourceUrl) {
      items.push({
        section: 'data',
        label: 'Sorgente JSON',
        value: dataSourceUrl,
        isUrl: /^https?:\/\//i.test(dataSourceUrl)
      });
    }
    const mv = data.metadata && data.metadata.versione != null
      ? String(data.metadata.versione).trim()
      : '';
    if (mv) {
      hasDataVersion = true;
      items.push({
        section: 'data',
        label: 'metadata.versione',
        value: mv
      });
    }
    if (data.$schema != null && String(data.$schema).trim() !== '') {
      const vs = String(data.$schema).trim();
      if (/^https?:\/\//i.test(vs)) {
        items.push({
          section: 'data',
          label: '$schema',
          value: vs,
          isUrl: true
        });
      }
    }
  }
  const missingDeclaredVersion = !hasSchemaVersion && !hasDataVersion;
  return {
    items,
    hasAny: items.length > 0,
    hasSchemaVersion,
    hasDataVersion,
    missingDeclaredVersion
  };
}

/* ── Schema loading & transformation ─────────────────────── */

const RESERVED_STRING_FORMATS = new Set([
  'textarea',
  'date',
  'time',
  'datetime',
  'datetime-local',
  'email',
  'uri',
  'url',
  'uuid',
  'color',
  'range',
  'radio',
  'checkbox',
  'select',
  'hidden'
]);

/**
 * Visita tutti i sotto-schemi (properties, items, combinators, definitions…).
 * @param {object} schema
 * @param {(node: object) => void} visitor
 */
function walkJsonSchema(schema, visitor) {
  if (!schema || typeof schema !== 'object') return;
  visitor(schema);
  if (schema.properties && typeof schema.properties === 'object') {
    Object.values(schema.properties).forEach(s => walkJsonSchema(s, visitor));
  }
  if (schema.patternProperties && typeof schema.patternProperties === 'object') {
    Object.values(schema.patternProperties).forEach(s => walkJsonSchema(s, visitor));
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    walkJsonSchema(schema.additionalProperties, visitor);
  }
  if (schema.items) {
    if (Array.isArray(schema.items)) schema.items.forEach(s => walkJsonSchema(s, visitor));
    else walkJsonSchema(schema.items, visitor);
  }
  if (schema.definitions && typeof schema.definitions === 'object') {
    Object.values(schema.definitions).forEach(s => walkJsonSchema(s, visitor));
  }
  for (const k of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(schema[k])) schema[k].forEach(s => walkJsonSchema(s, visitor));
  }
  if (schema.if) walkJsonSchema(schema.if, visitor);
  if (schema.then) walkJsonSchema(schema.then, visitor);
  if (schema.else) walkJsonSchema(schema.else, visitor);
  if (schema.not) walkJsonSchema(schema.not, visitor);
}

/**
 * Campi stringa che in json-editor sarebbero `<input type="text">` → `format: "textarea"`.
 * Mantiene formati riservati (email, date, url, select, …). `longtext` / `x-longtext` come prima.
 * L’altezza dinamica è gestita da `initJeLongtextFit` su `#editor-container`.
 * @param {object} schema
 */
function normalizeStringFieldsToTextarea(schema) {
  walkJsonSchema(schema, node => {
    const types = node.type;
    const isString = types === 'string' || (Array.isArray(types) && types.includes('string'));
    if (!isString || node.enum) return;

    const fmtRaw = node.format;
    const fmt =
      fmtRaw == null || (typeof fmtRaw === 'string' && fmtRaw.trim() === '')
        ? ''
        : String(fmtRaw).trim();

    if (node['x-longtext'] === true) {
      if (!fmt || !RESERVED_STRING_FORMATS.has(fmt)) {
        node.format = 'textarea';
      }
      delete node['x-longtext'];
      return;
    }

    if (fmt === 'longtext') {
      node.format = 'textarea';
      return;
    }

    if (!fmt || fmt === 'text') {
      node.format = 'textarea';
      return;
    }

    if (RESERVED_STRING_FORMATS.has(fmt)) return;

    node.format = 'textarea';
  });
}

/**
 * Fetch the JSON schema and transform it so that @json-editor/json-editor
 * can consume it (Draft-07 compatible conventions).
 * Usato per ogni webform: `schemaUrl` arriva dal manifest (schemi diversi per voce).
 *
 * Transformations applied:
 *  1. "$defs" → "definitions" (and "$ref": "#/$defs/X" → "#/definitions/X")
 *  2. Se esistono, imposta "readOnly" su proprietà `domanda` / `suggerimento` nelle
 *     definitions (tipico degli schemi onboarding EAA; su altri schemi non ha effetto).
 *  3. Aggiunge "format": "tabs" alla radice per le sezioni principali (json-editor).
 *  4. Stringhe testuali → `format: "textarea"` (con auto-altezza via je-longtext-fit), salvo formati riservati.
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

  // 4. Input testo su una riga → textarea (json-editor) + fit righe in form.html
  normalizeStringFieldsToTextarea(schema);

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
 * Supports `Ajv2020`, `ajv2020` (ajv-dist UMD), or `Ajv` globals.
 * @param {object} schema – The raw schema (before transformation)
 * @param {object} data
 * @returns {{ valid: boolean, errors: Array<{instancePath:string,message:string}> }}
 */
function validateWithAjv(schema, data) {
  // Prefer Draft 2020-12 class, fall back to generic Ajv
  const AjvClass =
    (typeof Ajv2020 !== 'undefined' && Ajv2020) ||
    (typeof ajv2020 !== 'undefined' && ajv2020) ||
    (typeof Ajv !== 'undefined' && Ajv) ||
    null;

  if (!AjvClass) return { valid: true, errors: [] };

  try {
    const ajv = new AjvClass({ allErrors: true, strict: false });
    /* addFormats (pacchetto ajv-formats) non è più caricato da CDN: opzionale se presente globalmente */
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

/** Escape text for safe insertion into HTML attribute or body context. */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
