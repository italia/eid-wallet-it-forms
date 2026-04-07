/**
 * csv-utils.js – CSV import/export helpers (IT-Wallet Webforms)
 *
 * Strategy:
 *  - Export: flatten JSON to rows with colonne leggibili: percorso, tipo_dato, valore.
 *    tipo_dato: stringa | numero | booleano | nullo | array_vuoto | oggetto_vuoto
 *    Array indicizzati: e_service.response.dataset[0].nome_campo, …
 *  - Import: legge il formato a 3 colonne oppure il vecchio path/value (retrocompatibile).
 */

const DANGEROUS_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/** Valori ammessi in tipo_dato (export); import accetta anche alias inglesi. */
const CSV_TYPE_NULL = 'nullo';
const CSV_TYPE_BOOL = 'booleano';
const CSV_TYPE_NUMBER = 'numero';
const CSV_TYPE_STRING = 'stringa';
const CSV_TYPE_EMPTY_ARRAY = 'array_vuoto';
const CSV_TYPE_EMPTY_OBJECT = 'oggetto_vuoto';

/* ── Export ──────────────────────────────────────────────── */

/**
 * Convert a (possibly nested) JSON object to a flat CSV string.
 * Colonne: percorso, tipo_dato, valore.
 *
 * @param {object} data   – The form data object
 * @param {string} [sep]  – Column separator (default `;`, adatto a Excel con impostazioni regionali IT/EU)
 * @returns {string}      – CSV text
 */
function jsonToCsv(data, sep = ';') {
  const rows = [['percorso', 'tipo_dato', 'valore']];
  flattenObject(data, '', rows);
  return rows.map(r => r.map(cell => csvCell(String(cell ?? ''), sep)).join(sep)).join('\r\n');
}

function flattenObject(obj, prefix, rows) {
  if (obj === null || obj === undefined) {
    rows.push([prefix, CSV_TYPE_NULL, '']);
    return;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      rows.push([prefix, CSV_TYPE_EMPTY_ARRAY, '[]']);
    } else {
      obj.forEach((item, i) => flattenObject(item, `${prefix}[${i}]`, rows));
    }
    return;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      rows.push([prefix, CSV_TYPE_EMPTY_OBJECT, '{}']);
      return;
    }
    keys.forEach(key => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      flattenObject(obj[key], newKey, rows);
    });
    return;
  }
  if (typeof obj === 'boolean') {
    rows.push([prefix, CSV_TYPE_BOOL, String(obj)]);
    return;
  }
  if (typeof obj === 'number') {
    rows.push([prefix, CSV_TYPE_NUMBER, String(obj)]);
    return;
  }
  rows.push([prefix, CSV_TYPE_STRING, String(obj)]);
}

/**
 * Wrap a CSV cell value (RFC 4180-style): quote if it contains sep, dquote,
 * or line breaks — so ";" nel testo non viene confuso col delimitatore colonna.
 */
function csvCell(value, sep) {
  const needsQuote =
    value.includes(sep) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');
  if (needsQuote) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

/* ── Import ──────────────────────────────────────────────── */

/**
 * Delimitatore colonne: export attuale usa `;`; file vecchi con `,` restano leggibili.
 * @param {string} csvText
 * @returns {string}
 */
function sniffCsvFieldDelimiter(csvText) {
  const line = csvText.split(/\r?\n/).find(l => l.trim());
  if (!line) return ';';
  const t = line.trim().toLowerCase();
  if (t.startsWith('percorso;') || t.startsWith('path;')) return ';';
  if (t.startsWith('percorso,') || t.startsWith('path,')) return ',';
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}

/**
 * Risolve il nome colonna effettivo (Papa usa l’header del file).
 * @param {object} row
 * @param {string[]} candidates  – in ordine di priorità
 * @returns {string|null}
 */
function resolveCsvColumnKey(row, candidates) {
  if (!row || typeof row !== 'object') return null;
  const lowerToActual = Object.create(null);
  for (const k of Object.keys(row)) {
    lowerToActual[k.trim().toLowerCase()] = k;
  }
  for (const c of candidates) {
    const actual = lowerToActual[c.trim().toLowerCase()];
    if (actual !== undefined) return actual;
  }
  return null;
}

/**
 * @param {object} row
 * @returns {{ path: string, value: string, type: string }}
 */
function pickCsvRowFields(row) {
  const pathKey = resolveCsvColumnKey(row, ['percorso', 'path']);
  const valueKey = resolveCsvColumnKey(row, ['valore', 'value']);
  const typeKey = resolveCsvColumnKey(row, ['tipo_dato', 'tipo', 'type', 'data_type']);
  const path = pathKey != null ? row[pathKey] : '';
  const value = valueKey != null ? row[valueKey] : '';
  const type = typeKey != null ? String(row[typeKey] ?? '') : '';
  return {
    path: path == null ? '' : String(path),
    value: value == null ? '' : value,
    type
  };
}

/**
 * Converte la cella valore usando il tipo dichiarato (export); fallback al comportamento legacy.
 * @param {string|number|boolean} raw
 * @param {string} typeHint
 * @returns {any}
 */
function coerceValueWithType(raw, typeHint) {
  const t = String(typeHint || '').trim().toLowerCase();
  const s = raw == null ? '' : String(raw);

  if (!t || t === 'auto' || t === 'automatico') {
    return coerceValue(s);
  }

  switch (t) {
    case CSV_TYPE_BOOL:
    case 'bool':
    case 'boolean':
      if (s === 'true' || raw === true) return true;
      if (s === 'false' || raw === false) return false;
      throw new Error(`valore booleano non valido: "${s}"`);
    case CSV_TYPE_NUMBER:
    case 'number':
    case 'integer':
    case 'intero':
      if (s === '') return '';
      const num = Number(s);
      if (!isNaN(num) && String(s).trim() !== '') return num;
      throw new Error(`valore numerico non valido: "${s}"`);
    case CSV_TYPE_STRING:
    case 'string':
    case 'testo':
      return s;
    case CSV_TYPE_NULL:
    case 'null':
      return null;
    case CSV_TYPE_EMPTY_ARRAY:
    case CSV_TYPE_EMPTY_OBJECT:
      return '__skip__';
    default:
      return coerceValue(s);
  }
}

/**
 * Parse a flat CSV (percorso, tipo_dato, valore — oppure path, value) back to a nested object.
 * Requires PapaParse to be loaded.
 *
 * @param {string} csvText
 * @returns {{ data: object|null, errors: string[] }}
 */
function csvToJson(csvText) {
  if (typeof Papa === 'undefined') {
    return { data: null, errors: ['PapaParse non è disponibile.'] };
  }

  const text = typeof csvText === 'string' ? csvText.replace(/^\uFEFF/, '') : csvText;
  const delimiter = sniffCsvFieldDelimiter(text);
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    quoteChar: '"',
    escapeChar: '"',
    fastMode: false
  });
  if (result.errors.length) {
    return { data: null, errors: result.errors.map(e => e.message) };
  }

  const rows = result.data;
  if (!rows.length) {
    return { data: null, errors: ['Il CSV non contiene righe dati.'] };
  }

  const pathKey = resolveCsvColumnKey(rows[0], ['percorso', 'path']);
  const valueKey = resolveCsvColumnKey(rows[0], ['valore', 'value']);
  if (!pathKey || !valueKey) {
    return {
      data: null,
      errors: ['Il CSV deve avere colonne "percorso" e "valore" (o "path" e "value" per file vecchi).']
    };
  }

  const obj = {};
  const errors = [];

  for (const row of rows) {
    const { path, value: raw, type: tipo } = pickCsvRowFields(row);
    if (!path || path.trim() === '') continue;

    // Sentinel legacy (due colonne): contenitori vuoti segnati solo nel valore
    if (raw === '[]' || raw === '{}') continue;

    try {
      let coerced;
      if (tipo && String(tipo).trim() !== '') {
        coerced = coerceValueWithType(raw, tipo);
      } else {
        coerced = coerceValue(raw == null ? '' : String(raw));
      }
      if (coerced === '__skip__') continue;
      setNestedValue(obj, parsePath(path), coerced);
    } catch (e) {
      errors.push(`Percorso non valido: "${path}": ${e.message}`);
    }
  }

  return { data: obj, errors };
}

/**
 * Parse a dot-bracket path string into an array of keys/indices.
 * E.g. "e_service.response.dataset[0].nome_campo"
 *      → ['e_service', 'response', 'dataset', 0, 'nome_campo']
 */
function parsePath(path) {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new Error('percorso vuoto');
  }
  const parts = [];
  // Split on dots, then parse each segment with optional [index] suffixes.
  for (const dotSegment of path.split('.')) {
    if (!dotSegment) {
      throw new Error('segmento path non valido');
    }
    let segment = dotSegment;
    while (segment.length > 0) {
      const keyMatch = segment.match(/^[^[\]]+/);
      if (keyMatch) {
        const key = keyMatch[0];
        if (DANGEROUS_PATH_SEGMENTS.has(key)) {
          throw new Error(`chiave non consentita: ${key}`);
        }
        parts.push(key);
        segment = segment.slice(key.length);
        continue;
      }
      const indexMatch = segment.match(/^\[(\d+)\]/);
      if (indexMatch) {
        parts.push(parseInt(indexMatch[1], 10));
        segment = segment.slice(indexMatch[0].length);
        continue;
      }
      throw new Error('notazione [] non valida');
    }
  }
  if (!parts.length) {
    throw new Error('percorso non valido');
  }
  return parts;
}

/**
 * Set a nested value on an object using an array of path segments.
 */
function setNestedValue(obj, parts, value) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('percorso non valido');
  }
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key  = parts[i];
    const next = parts[i + 1];
    if (typeof key === 'string' && DANGEROUS_PATH_SEGMENTS.has(key)) {
      throw new Error(`chiave non consentita: ${key}`);
    }
    if (cur[key] === undefined || cur[key] === null) {
      cur[key] = typeof next === 'number' ? [] : Object.create(null);
    }
    cur = cur[key];
  }
  const last = parts[parts.length - 1];
  if (typeof last === 'string' && DANGEROUS_PATH_SEGMENTS.has(last)) {
    throw new Error(`chiave non consentita: ${last}`);
  }
  cur[last] = value;
}

/**
 * Attempt to coerce a string value to an appropriate JS type.
 * 'true'/'false' → boolean, numeric strings → number, else string.
 */
function coerceValue(raw) {
  if (raw === 'true')  return true;
  if (raw === 'false') return false;
  if (raw === '')      return '';
  const num = Number(raw);
  if (!isNaN(num) && raw.trim() !== '') return num;
  return raw;
}

/* ── Download helper ─────────────────────────────────────── */

/**
 * Trigger a browser download of text content.
 * @param {string} filename
 * @param {string} content
 * @param {string} mimeType
 */
function downloadText(filename, content, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
