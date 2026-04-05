/**
 * csv-utils.js – CSV import/export helpers (IT-Wallet Webforms)
 *
 * Strategy:
 *  - Export: Recursively flatten the JSON to (path, value) rows.
 *    Arrays are indexed: e_service.response.dataset[0].nome_campo, …
 *  - Import: Parse the two-column CSV and re-inflate to a nested object.
 */

const DANGEROUS_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

/* ── Export ──────────────────────────────────────────────── */

/**
 * Convert a (possibly nested) JSON object to a flat CSV string.
 * Each row has two columns: "path" and "value".
 *
 * @param {object} data   – The form data object
 * @param {string} [sep]  – Column separator (default `;`, adatto a Excel con impostazioni regionali IT/EU)
 * @returns {string}      – CSV text
 */
function jsonToCsv(data, sep = ';') {
  const rows = [['path', 'value']];
  flattenObject(data, '', rows);
  return rows.map(r => r.map(cell => csvCell(String(cell ?? ''), sep)).join(sep)).join('\r\n');
}

function flattenObject(obj, prefix, rows) {
  if (obj === null || obj === undefined) {
    rows.push([prefix, '']);
    return;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      rows.push([prefix, '[]']);
    } else {
      obj.forEach((item, i) => flattenObject(item, `${prefix}[${i}]`, rows));
    }
    return;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      rows.push([prefix, '{}']);
      return;
    }
    keys.forEach(key => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      flattenObject(obj[key], newKey, rows);
    });
    return;
  }
  rows.push([prefix, obj]);
}

/**
 * Wrap a CSV cell value; quote if it contains sep, quote, or newline.
 */
function csvCell(value, sep) {
  const needsQuote = value.includes(sep) || value.includes('"') || value.includes('\n');
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
  if (t.startsWith('path;')) return ';';
  if (t.startsWith('path,')) return ',';
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}

/**
 * Parse a flat (path, value) CSV string back to a nested object.
 * Requires PapaParse to be loaded.
 *
 * @param {string} csvText
 * @returns {{ data: object|null, errors: string[] }}
 */
function csvToJson(csvText) {
  if (typeof Papa === 'undefined') {
    return { data: null, errors: ['PapaParse non è disponibile.'] };
  }

  const delimiter = sniffCsvFieldDelimiter(csvText);
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true, delimiter });
  if (result.errors.length) {
    return { data: null, errors: result.errors.map(e => e.message) };
  }

  const rows = result.data;
  if (!rows.length || !('path' in rows[0]) || !('value' in rows[0])) {
    return { data: null, errors: ['Il CSV deve avere colonne "path" e "value".'] };
  }

  const obj = {};
  const errors = [];

  for (const row of rows) {
    const path = row.path;
    const raw  = row.value;

    // Special sentinel values for empty containers
    if (raw === '[]' || raw === '{}') continue;

    try {
      setNestedValue(obj, parsePath(path), coerceValue(raw));
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
