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
 * Deep clone for JSON-compatible structures.
 * @param {object} value
 * @returns {object}
 */
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Convert Draft 2020-12 references used by source schemas to conventions accepted by json-editor.
 * - "$defs" -> "definitions"
 * - "$ref": "#/$defs/X" -> "#/definitions/X"
 * @param {object} node
 */
function normalizeDefsAndRefs(node) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#/$defs/')) {
    node.$ref = '#/definitions/' + node.$ref.slice('#/$defs/'.length);
  }
  if (node.$defs && typeof node.$defs === 'object') {
    if (!node.definitions || typeof node.definitions !== 'object') {
      node.definitions = node.$defs;
    } else {
      for (const k of Object.keys(node.$defs)) {
        if (!(k in node.definitions)) {
          node.definitions[k] = node.$defs[k];
        }
      }
    }
    delete node.$defs;
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child && typeof child === 'object') {
      normalizeDefsAndRefs(child);
    }
  }
}

/**
 * Etichetta heading: nome proprietà / definizione così com’è (es. campo_risposta, mappatura_errori).
 * Se lo schema espone già `title` sul nodo, non sovrascrivere (solo dove manca).
 * @param {string} key
 * @returns {string}
 */
function headingLabelFromKey(key) {
  if (key == null || key === '') return '';
  return String(key);
}

/**
 * Valore proprietà che è solo `$ref`: aggiunge titolo visibile in json-editor.
 * @param {object} node
 * @param {string} propertyLabel
 */
function liftBareRefToAllOf(node, propertyLabel) {
  if (!node || typeof node !== 'object' || !propertyLabel) return;
  const keys = Object.keys(node);
  if (keys.length !== 1 || typeof node.$ref !== 'string') return;
  const ref = node.$ref;
  delete node.$ref;
  node.allOf = [{ $ref: ref }, { title: propertyLabel }];
}

/**
 * Per ogni elemento di array: titolo con prefisso = nome proprietà padre (json-editor: headerTemplate + indice).
 * Per `$ref` verso `#/definitions/…` si **inline-a** una copia della definition.
 * In json-editor 2.15, se la radice dell’item ha già `allOf` o `if`/`then`, `title`/`headerTemplate` sulla
 * stessa radice **non** producono la riga visibile (`mappatura_errori`, `assistenza.canali`): vanno messi come
 * ultimo congiunto `allOf` — stesso trucco del caso `{ $ref }` + `headingExtra`.
 * @param {object} arraySchema
 * @param {string} parentLabel
 * @param {object} schemaRoot - schema completo (con `definitions`) per risolvere i ref
 */
function patchArrayItemsForHeadings(arraySchema, parentLabel, schemaRoot) {
  if (
    !arraySchema ||
    typeof arraySchema !== 'object' ||
    arraySchema.type !== 'array' ||
    !arraySchema.items ||
    typeof arraySchema.items !== 'object' ||
    Array.isArray(arraySchema.items)
  ) {
    return;
  }

  const items = arraySchema.items;
  const suffix = ' · {{i1}}';
  const headingExtra = {
    title: parentLabel,
    headerTemplate: parentLabel + suffix
  };

  if (typeof items.$ref === 'string' && Object.keys(items).length === 1) {
    const ref = items.$ref;
    const m = typeof ref === 'string' ? ref.match(/^#\/definitions\/(.+)$/) : null;
    if (m && schemaRoot && schemaRoot.definitions && schemaRoot.definitions[m[1]]) {
      const inlined = cloneJson(schemaRoot.definitions[m[1]]);
      const hasAllOf = Array.isArray(inlined.allOf) && inlined.allOf.length > 0;
      const hasConditional = !!(inlined.if || inlined.then || inlined.else);

      if (hasAllOf) {
        inlined.allOf = inlined.allOf.concat([headingExtra]);
        arraySchema.items = inlined;
        recurseItemsSchemaForHeadings(inlined, schemaRoot);
        return;
      }
      if (hasConditional) {
        arraySchema.items = { allOf: [inlined, headingExtra] };
        recurseItemsSchemaForHeadings(arraySchema.items, schemaRoot);
        return;
      }
      inlined.title = parentLabel;
      inlined.headerTemplate = parentLabel + suffix;
      /*
       * Non impostare mai `format: tabs` sulla radice dell’item inline: in json-editor 2.15 quel layout
       * sulla radice dell’oggetto-item può sopprimere il titolo di riga.
       */
      arraySchema.items = inlined;
      recurseItemsSchemaForHeadings(inlined, schemaRoot);
      return;
    }
    items.allOf = [{ $ref: ref }, headingExtra];
    delete items.$ref;
    recurseItemsSchemaForHeadings(items, schemaRoot);
    return;
  }

  if (Array.isArray(items.allOf)) {
    items.allOf.push(headingExtra);
  } else if (items.type === 'object') {
    if (!items.title) items.title = parentLabel;
    if (!items.headerTemplate) items.headerTemplate = parentLabel + suffix;
  } else {
    if (!items.title) items.title = parentLabel;
    if (!items.headerTemplate) items.headerTemplate = parentLabel + suffix;
  }

  recurseItemsSchemaForHeadings(items, schemaRoot);
}

/**
 * @param {object} node
 * @param {string} propertyKey
 * @param {object} schemaRoot
 */
function ensureNodeHasHeading(node, propertyKey, schemaRoot) {
  if (!node || typeof node !== 'object' || propertyKey == null || propertyKey === '') return;
  const label = headingLabelFromKey(propertyKey);

  liftBareRefToAllOf(node, label);

  const missingTitle = !node.title || String(node.title).trim() === '';

  if (node.type === 'object' && missingTitle) {
    node.title = label;
  } else if (
    missingTitle &&
    (node.type === 'string' ||
      node.type === 'integer' ||
      node.type === 'number' ||
      node.type === 'boolean')
  ) {
    node.title = label;
  }

  if (node.type === 'array') {
    patchArrayItemsForHeadings(node, label, schemaRoot);
  }
}

/**
 * @param {object} properties
 * @param {object} schemaRoot
 */
function decoratePropertySchemasForHeadings(properties, schemaRoot) {
  if (!properties || typeof properties !== 'object') return;
  for (const key of Object.keys(properties)) {
    const sub = properties[key];
    if (!sub || typeof sub !== 'object') continue;
    ensureNodeHasHeading(sub, key, schemaRoot);
    recurseSchemaForHeadings(sub, schemaRoot);
  }
}

/**
 * @param {object} itemsSchema
 * @param {object} schemaRoot
 */
function recurseItemsSchemaForHeadings(itemsSchema, schemaRoot) {
  if (!itemsSchema || typeof itemsSchema !== 'object') return;
  if (itemsSchema.properties) decoratePropertySchemasForHeadings(itemsSchema.properties, schemaRoot);
  for (const k of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(itemsSchema[k])) {
      itemsSchema[k].forEach(br => recurseSchemaForHeadings(br, schemaRoot));
    }
  }
}

/**
 * @param {object} node
 * @param {object} schemaRoot
 */
function recurseSchemaForHeadings(node, schemaRoot) {
  if (!node || typeof node !== 'object') return;
  if (node.properties) decoratePropertySchemasForHeadings(node.properties, schemaRoot);
  if (node.type === 'array' && node.items && typeof node.items === 'object' && !Array.isArray(node.items)) {
    recurseItemsSchemaForHeadings(node.items, schemaRoot);
  }
  for (const k of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(node[k])) node[k].forEach(br => recurseSchemaForHeadings(br, schemaRoot));
  }
  if (node.if) recurseSchemaForHeadings(node.if, schemaRoot);
  if (node.then) recurseSchemaForHeadings(node.then, schemaRoot);
  if (node.else) recurseSchemaForHeadings(node.else, schemaRoot);
}

/**
 * Intestazioni in json-editor: decorate property keys, array headerTemplate, senza titolo sulla radice delle definitions.
 * @param {object} schema
 */
function decorateEditorHeadings(schema) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.definitions) {
    for (const name of Object.keys(schema.definitions)) {
      const def = schema.definitions[name];
      if (!def || typeof def !== 'object') continue;
      /* Non impostare title sulla radice della definition (es. campo_booleano): in UI si usa il nome della proprietà che fa $ref. */
      recurseSchemaForHeadings(def, schema);
    }
  }

  if (schema.properties) decoratePropertySchemasForHeadings(schema.properties, schema);
}

/**
 * Transform a raw schema to json-editor compatible schema.
 * @param {object} rawSchema
 * @returns {object}
 */
function transformSchemaForEditor(rawSchema) {
  const schema = cloneJson(rawSchema);

  // 1. Normalize $defs/$ref conventions
  normalizeDefsAndRefs(schema);

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

  // 3. Titoli / heading per ogni blocco e prefisso padre sugli item array (json-editor)
  decorateEditorHeadings(schema);

  // 4. Tabs layout for the root object
  schema.format = 'tabs';

  // 5. Input testo su una riga -> textarea (json-editor) + fit righe in form.html
  normalizeStringFieldsToTextarea(schema);
  return schema;
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
 *  3. Titoli json-editor: chiave proprietà se manca `title` (i nomi delle definition non diventano titoli di
 *     blocco; così i $ref verso campo_booleano / campo_risposta usano il nome della proprietà padre).
 *     Item array: `title` + `headerTemplate` con nome array e ` · {{i1}}`. Niente `format: tabs` sulla radice dell’item.
 *     Campi primitivi senza title ricevono etichetta dal nome proprietà.
 *  4. Aggiunge "format": "tabs" alla radice per le sezioni principali (json-editor).
 *  5. Stringhe testuali → `format: "textarea"` (con auto-altezza via je-longtext-fit), salvo formati riservati.
 *
 * @param {string} schemaUrl
 * @returns {Promise<{ rawSchema: object, editorSchema: object }>}
 */
async function loadSchemaBundle(schemaUrl) {
  const resp = await fetch(schemaUrl);
  if (!resp.ok) throw new Error(`Impossibile caricare lo schema: ${resp.status}`);
  const rawSchema = await resp.json();
  return {
    rawSchema,
    editorSchema: transformSchemaForEditor(rawSchema)
  };
}

/**
 * Compat helper for existing callers expecting only transformed schema.
 * @param {string} schemaUrl
 * @returns {Promise<object>} transformed schema
 */
async function loadAndTransformSchema(schemaUrl) {
  const bundle = await loadSchemaBundle(schemaUrl);
  return bundle.editorSchema;
}

/**
 * Fetch the example data JSON.
 * @param {string} exampleUrl
 * @returns {Promise<object>}
 */
async function loadExampleData(exampleUrl) {
  const resp = await fetch(exampleUrl);
  if (!resp.ok) throw new Error(`Impossibile caricare i dati di esempio: ${resp.status}`);
  const data = await resp.json();
  return sanitizeFormData(data);
}

/**
 * Some source examples include placeholder rows in arrays (objects with only empty strings/nulls).
 * Remove those rows so the editor doesn't render visually empty items.
 * @param {any} value
 * @returns {any}
 */
function sanitizeFormData(value) {
  if (Array.isArray(value)) {
    return value
      .map(sanitizeFormData)
      .filter(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
        return !isBlankObjectDeep(item);
      });
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  Object.keys(value).forEach(k => {
    out[k] = sanitizeFormData(value[k]);
  });
  return out;
}

/**
 * Copia profonda tramite JSON (adeguata ai dati del form: oggetti, array, primitivi).
 * @param {any} data
 * @returns {any}
 */
function cloneFormData(data) {
  return data === undefined ? undefined : JSON.parse(JSON.stringify(data));
}

/**
 * Unisce il valore corrente dell'editor con uno snapshot di riferimento così che
 * proprietà che json-editor non espone in getValue() (es. campi opzionali/read-only
 * come `suggerimento`) o normalizzazioni indesiderate non spariscano da export e salvataggio.
 *
 * @param {any} base     Snapshot coerente con l'ultimo caricamento / salvataggio
 * @param {any} current  Risultato di JSONEditor.getValue()
 * @returns {any}
 */
function mergeFormExportBaseline(base, current) {
  if (current === undefined || current === null) {
    return base === undefined || base === null ? current : cloneFormData(base);
  }
  if (base === undefined || base === null) {
    return cloneFormData(current);
  }
  if (Array.isArray(current)) {
    if (!Array.isArray(base)) return cloneFormData(current);
    return current.map((item, i) => mergeFormExportBaseline(base[i], item));
  }
  if (typeof current !== 'object') {
    return current;
  }
  if (typeof base !== 'object' || base === null) {
    return cloneFormData(current);
  }
  const out = Object.assign({}, base);
  for (const k of Object.keys(current)) {
    out[k] = mergeFormExportBaseline(base[k], current[k]);
  }
  return out;
}

/**
 * True when an object has no meaningful value in any nested property.
 * `false` and numeric values are considered meaningful.
 * @param {object} obj
 * @returns {boolean}
 */
function isBlankObjectDeep(obj) {
  const vals = Object.values(obj || {});
  if (!vals.length) return true;
  return vals.every(isBlankValueDeep);
}

/**
 * @param {any} v
 * @returns {boolean}
 */
function isBlankValueDeep(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.every(isBlankValueDeep);
  if (typeof v === 'object') return isBlankObjectDeep(v);
  return false;
}

/* ── Schema validation with AJV ──────────────────────────── */

/**
 * `format` in JSON Schema (es. email) non è validato da Ajv a meno di registrare il formato.
 * `addFormats` da `ajv-formats` è opzionale in form.html; qui si applicano i formati minimi usati negli schemi IT-Wallet.
 * Regex email allineata al criterio WHATWG per input type=email (sottoinsieme pratico RFC 5322).
 * @param {*} ajv – istanza Ajv (metodo addFormat)
 */
function applyDefaultAjvFormats(ajv) {
  if (!ajv || typeof ajv.addFormat !== 'function') return;
  const emailRe =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  try {
    ajv.addFormat('email', emailRe);
  } catch (e) {
    /* già registrato (es. addFormats) */
  }
}

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
    /* addFormats (pacchetto ajv-formats): opzionale se presente globalmente in form.html */
    if (typeof addFormats !== 'undefined') addFormats(ajv);
    else applyDefaultAjvFormats(ajv);
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
