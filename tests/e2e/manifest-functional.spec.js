const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const manifestPath = path.join(__dirname, '../../webforms-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const webforms = Array.isArray(manifest.webforms) ? manifest.webforms : [];

/*
 * Invarianti editor (ogni webform nel manifest, stessi criteri quando aggiungi form):
 * - Validazione + apertura di tutte le tab json-editor + initJeArrayControlCard
 * - Ogni riga .je-array-item-row-controls: delete + move up + down in heading
 * - Ogni item oggetto con schemapath …N (indice array): tripla controlli nel titolo se il riordino è attivo
 * - Sotto percorsi con indici (.0, .1, …): ogni proprietà diretta ha tab o label leggibile
 * - Ogni item oggetto …<nome_array>.<i> con UI item: titolo di riga contiene il nome array + indice (headerTemplate)
 * - Layout assistenza.canali (se presente): titolo riga item; per tipo/risposta/note nome campo + controllo con
 *   getBoundingClientRect nello stesso evaluate (affidabile); regole: sopra, sinistra in riga, o stesso blocco a colonna
 * - Nessun title/tab con testo esatto = nomi technical $defs campo_* (da schema) né "Campo Risposta"
 */

function webformUrl(id) {
  return `/form.html?webform=${encodeURIComponent(id)}`;
}

async function clearDrafts(page) {
  await page.goto('/index.html#catalog');
  await page.evaluate(() => localStorage.removeItem('eid-wallet-forms'));
}

async function waitForEditorReady(page) {
  await expect(page.locator('#editor-container')).toBeVisible({ timeout: 120000 });
  await expect(page.locator('#loading-spinner')).toHaveClass(/d-none/, { timeout: 120000 });
}

/**
 * Il DOM può contenere più nodi `[data-schemapath]` per lo stesso path; `.first()` spesso punta a un duplicato non visibile
 * e `scrollIntoViewIfNeeded` va in timeout. Si sceglie il primo `.je-object__container` visibile nell’editor.
 * @param {import('@playwright/test').Page} page
 * @param {string} base es. root.assistenza.canali.0
 */
async function firstVisibleJeObjectContainer(page, base) {
  const idx = await page.evaluate(bp => {
    const list = document.querySelectorAll(`.je-object__container[data-schemapath="${bp}"]`);
    for (let i = 0; i < list.length; i++) {
      const n = list[i];
      if (n.closest('.je-modal')) continue;
      if (!document.getElementById('editor-container')?.contains(n)) continue;
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = n.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      return i;
    }
    return -1;
  }, base);

  expect(idx, `nessun .je-object__container visibile per ${base}`).toBeGreaterThanOrEqual(0);
  const host = page.locator(`.je-object__container[data-schemapath="${base}"]`).nth(idx);
  await host.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await expect(host, `host ${base}`).toBeVisible();
  return host;
}

/**
 * Come per l’host: più nodi possono avere lo stesso data-schemapath; si usa il primo visibile dentro l’item array.
 * @param {import('@playwright/test').Page} page
 * @param {string} base es. root.assistenza.canali.0
 * @param {string} field es. tipo
 */
async function firstVisibleFieldCell(page, base, field) {
  const path = `${base}.${field}`;
  const idx = await page.evaluate(
    ({ bp, schemapath }) => {
      function visibleObjectContainerForPath(p) {
        const list = document.querySelectorAll(`.je-object__container[data-schemapath="${p}"]`);
        for (let i = 0; i < list.length; i++) {
          const n = list[i];
          if (n.closest('.je-modal')) continue;
          if (!document.getElementById('editor-container')?.contains(n)) continue;
          const cs = getComputedStyle(n);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const r = n.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          return n;
        }
        return null;
      }
      const h = visibleObjectContainerForPath(bp);
      if (!h) return -1;
      const list = document.querySelectorAll(`[data-schemapath="${schemapath}"]`);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!h.contains(c)) continue;
        const cs = getComputedStyle(c);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const r = c.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        return i;
      }
      return -1;
    },
    { bp: base, schemapath: path }
  );

  expect(idx, `nessun [data-schemapath] visibile per ${path} nell’item ${base}`).toBeGreaterThanOrEqual(0);
  const cell = page.locator(`[data-schemapath="${path}"]`).nth(idx);
  await cell.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await expect(cell, `cell ${path}`).toBeVisible();
  return cell;
}

async function clickToolbarButton(page, selector) {
  await page.locator(selector).evaluate(element => element.click());
}

/**
 * Apre ricorsivamente le tab json-editor (anche annidate: e_service → mappatura_errori, …)
 * e rilancia il riposizionamento controlli array.
 */
async function activateAllJsonEditorTabs(page) {
  for (let pass = 0; pass < 30; pass++) {
    const clicked = await page.evaluate(() => {
      const root = document.getElementById('editor-container');
      if (!root) return 0;
      let n = 0;
      root.querySelectorAll('[data-bs-toggle="tab"]').forEach(trigger => {
        try {
          if (trigger.closest('.je-modal')) return;
          const cs = window.getComputedStyle(trigger);
          if (cs.visibility === 'hidden' || cs.display === 'none') return;
          const r = trigger.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return;
          trigger.click();
          n++;
        } catch (e) {
          /* ignore */
        }
      });
      return n;
    });
    if (clicked === 0) break;
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => {
    if (typeof initJeArrayControlCard === 'function') {
      initJeArrayControlCard(document.getElementById('editor-container'));
    }
  });
}

async function defNamesWithCampoPrefix(request, schemaUrl) {
  const res = await request.get(schemaUrl);
  expect(res.ok(), `Schema HTTP ${schemaUrl}`).toBeTruthy();
  const schema = await res.json();
  const defs = schema.$defs || schema.definitions || {};
  return Object.keys(defs).filter(k => /^campo_/.test(k));
}

/**
 * Ogni host oggetto il cui schemapath termina con .N (item di array) deve avere nel titolo la tripla
 * delete / move up / move down quando il riordino è attivo nel form.
 */
async function assertEveryIndexedArrayItemObjectHasHeadingControls(page) {
  const issues = await page.evaluate(() => {
    const root = document.getElementById('editor-container');
    if (!root) return ['manca #editor-container'];

    const reorderActive = [...root.querySelectorAll('button')].some(
      b => !b.closest('.je-modal') && b.classList.contains('json-editor-btntype-move')
    );
    if (!reorderActive) return [];

    const endsWithIndex = /\.(\d+)$/;
    function isDel(b) {
      return (
        (b.classList.contains('json-editor-btntype-delete') || b.classList.contains('json-editor-btn-delete')) &&
        !b.classList.contains('json-editor-btntype-deleteall') &&
        !b.classList.contains('json-editor-btntype-deletelast')
      );
    }
    function isUp(b) {
      return b.classList.contains('json-editor-btntype-move') && b.className.indexOf('moveup') >= 0;
    }
    function isDown(b) {
      return b.classList.contains('json-editor-btntype-move') && b.className.indexOf('movedown') >= 0;
    }

    const out = [];
    const containers = [...root.querySelectorAll('.je-object__container[data-schemapath]')].filter(el => {
      const sp = el.getAttribute('data-schemapath') || '';
      if (!endsWithIndex.test(sp)) return false;
      return !!el.querySelector(
        'button.json-editor-btntype-delete, button.json-editor-btntype-move, button.json-editor-btn-delete'
      );
    });

    containers.forEach(c => {
      const sp = c.getAttribute('data-schemapath') || '';
      const row = [...c.querySelectorAll('.je-array-item-row-controls')].find(r => {
        if (!c.contains(r)) return false;
        const host = r.closest('.je-object__container[data-schemapath]');
        return host && host.getAttribute('data-schemapath') === sp;
      });
      if (!row) {
        out.push(`${sp}: nessuna .je-array-item-row-controls nel titolo di questo item`);
        return;
      }
      const btns = [...row.querySelectorAll(':scope > button')];
      const d = btns.filter(isDel).length;
      const u = btns.filter(isUp).length;
      const v = btns.filter(isDown).length;
      if (d !== 1 || u !== 1 || v !== 1) {
        out.push(`${sp}: attesi 1×delete 1×moveup 1×movedown, trovati ${d}/${u}/${v}`);
      }
    });
    return out;
  });

  expect(issues, `Controlli item array (tutti gli host .N):\n${issues.join('\n')}`).toEqual([]);
}

/**
 * Sotto ogni percorso indicizzato, ogni proprietà oggetto diretta deve avere tab o label leggibile
 * (stesso criterio usato prima solo per mappatura_errori); si applica a tutti i webform.
 */
async function assertFieldChromeForAllIndexedObjectHosts(page) {
  const issues = await page.evaluate(() => {
    const root = document.getElementById('editor-container');
    if (!root) return ['manca #editor-container'];

    function tabTriggerForFieldEl(fieldEl) {
      const pane = fieldEl.closest('.tab-pane');
      if (!pane || !pane.id) return '';
      const trig = root.querySelector(`a[href="#${CSS.escape(pane.id)}"]`);
      return trig ? (trig.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    function fieldOk(path, key, el) {
      if (!el) return `manca nodo ${path}`;
      if (el.classList.contains('je-object__container')) {
        const t =
          el.querySelector(':scope > .je-object__title') ||
          el.querySelector(':scope > .je-array-item-header-row .je-object__title') ||
          el.querySelector('.je-object__title');
        const txt = t ? t.textContent.replace(/\s+/g, ' ').trim().toLowerCase() : '';
        if (txt.includes(key.toLowerCase()) || txt.includes('·')) return '';
        return `oggetto ${path}: titolo assente o non riconosciuto ("${txt.slice(0, 96)}")`;
      }
      const tabTrigger = tabTriggerForFieldEl(el);
      const inTab =
        tabTrigger === key ||
        tabTrigger.toLowerCase().startsWith(key.toLowerCase() + ' ') ||
        tabTrigger.toLowerCase().startsWith(key.toLowerCase() + '\u00a0') ||
        tabTrigger.toLowerCase() === key.toLowerCase();
      let inLabel = false;
      const row = el.closest('.row');
      if (row) {
        const blobs = [...row.querySelectorAll('label, .form-label, .col-form-label')].map(n =>
          (n.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
        );
        inLabel = blobs.some(b => b === key.toLowerCase() || b.includes(key.toLowerCase()));
      }
      if (inTab || inLabel) return '';
      return `campo ${path}: niente tab/label utili (tab "${tabTrigger}")`;
    }

    const out = [];
    const hosts = [...root.querySelectorAll('.je-object__container[data-schemapath]')].filter(el => {
      const sp = el.getAttribute('data-schemapath') || '';
      return /\.\d+(?:\.|$)/.test(sp);
    });

    hosts.forEach(host => {
      const base = host.getAttribute('data-schemapath') || '';
      const pref = base + '.';
      const keys = new Set();
      root.querySelectorAll('[data-schemapath]').forEach(el => {
        const sp = el.getAttribute('data-schemapath') || '';
        if (!sp.startsWith(pref)) return;
        const rest = sp.slice(pref.length);
        const dot = rest.indexOf('.');
        const seg = dot === -1 ? rest : rest.slice(0, dot);
        if (!seg || /^\d+$/.test(seg) || seg.startsWith('$')) return;
        keys.add(seg);
      });

      keys.forEach(key => {
        const path = `${base}.${key}`;
        const el = root.querySelector(`[data-schemapath="${path}"]`);
        const msg = fieldOk(path, key, el);
        if (msg) out.push(`${base}: ${msg}`);
      });
    });
    return out;
  });

  expect(
    issues,
    `Intestazioni campi sotto percorsi indicizzati (oggetti/array annidati):\n${issues.slice(0, 200).join('\n')}${
      issues.length > 200 ? `\n… +${issues.length - 200} altre` : ''
    }`
  ).toEqual([]);
}

/**
 * Titolo **riga** di ogni item (`headerTemplate`: nome proprietà array + · + indice).
 * Intercetta regressioni tipo assistenza.canali dove le tab sulla radice dell’item rompono l’intestazione.
 */
async function assertEveryArrayObjectItemRowHeaderShowsParentAndIndex(page) {
  const issues = await page.evaluate(() => {
    const root = document.getElementById('editor-container');
    if (!root) return ['manca #editor-container'];

    /* …lista_nome_campo.12 → gruppo lista_nome_campo, indice 12 */
    const itemPathRe = /^(.+)\.([^.\d$][\w]*)\.(\d+)$/;
    const out = [];

    function itemRowTitleEl(host) {
      return (
        host.querySelector(':scope > .je-object__title') ||
        host.querySelector(':scope > .je-array-item-header-row .je-object__title') ||
        host.querySelector(':scope > .card > .card-header .je-object__title')
      );
    }

    [...root.querySelectorAll('.je-object__container[data-schemapath]')].forEach(host => {
      if (host.closest('.je-modal')) return;
      const sp = host.getAttribute('data-schemapath') || '';
      const m = sp.match(itemPathRe);
      if (!m) return;
      const parentKey = m[2];
      if (parentKey.startsWith('$')) return;

      const hasItemUi = host.querySelector(
        'button.json-editor-btntype-delete, button.json-editor-btntype-move, button.json-editor-btn-delete'
      );
      if (!hasItemUi) return;

      const titleEl = itemRowTitleEl(host);
      if (!titleEl) {
        out.push(`${sp}: nessun titolo di riga (.je-object__title) per questo item di array`);
        return;
      }
      const raw = (titleEl.textContent || '').replace(/\s+/g, ' ').trim();
      const lower = raw.toLowerCase();
      if (!lower.includes(parentKey.toLowerCase())) {
        out.push(`${sp}: titolo riga deve contenere "${parentKey}" — «${raw.slice(0, 160)}»`);
        return;
      }
      const hasIndexHint = /[·\u00b7]/.test(raw) || /\d/.test(raw);
      if (!hasIndexHint) {
        out.push(`${sp}: titolo riga senza separatore · né cifra — «${raw.slice(0, 160)}»`);
      }
    });
    return out;
  });

  expect(
    issues,
    `Titolo riga item (headerTemplate) per ogni array di oggetti:\n${issues.join('\n')}`
  ).toEqual([]);
}

/** Nomi tecnici tipo campo_booleano non devono comparire come testo esatto di titolo/tab (si usano le proprietà). */
async function assertForbiddenExactEditorChrome(page, forbiddenList) {
  const uniq = [...new Set(forbiddenList)].filter(Boolean);
  const bad = await page.evaluate(forbidden => {
    const root = document.getElementById('editor-container');
    if (!root) return ['manca #editor-container'];
    const set = new Set(forbidden);
    const hit = [];
    root.querySelectorAll('.je-object__title, .nav-link').forEach(el => {
      if (el.closest('.je-modal')) return;
      const t = (el.textContent || '').trim();
      if (set.has(t)) hit.push(t);
    });
    return [...new Set(hit)];
  }, uniq);
  expect(
    bad,
    `Titoli/tab non devono essere nomi definition tecnici: ${uniq.join(', ')}`
  ).toEqual([]);
}

/**
 * Verifica **posizione** reale in viewport (Playwright boundingBox): regressioni dove label esiste nel DOM
 * ma è fuori ordine, sovrapposta o il titolo riga item non precede i campi.
 * @param {import('@playwright/test').Page} page
 */
async function assertAssistenzaCanaliArrayItemLayout(page) {
  const bases = await page.evaluate(() => {
    const root = document.getElementById('editor-container');
    if (!root) return [];
    const set = new Set();
    root.querySelectorAll('[data-schemapath]').forEach(el => {
      const sp = el.getAttribute('data-schemapath') || '';
      if (/^root\.assistenza\.canali\.\d+$/.test(sp)) {
        set.add(sp);
      }
    });
    return [...set].sort((a, b) => {
      const ia = parseInt(a.split('.').pop(), 10);
      const ib = parseInt(b.split('.').pop(), 10);
      return ia - ib;
    });
  });

  if (bases.length === 0) {
    return;
  }

  const fields = ['tipo', 'risposta', 'note'];

  for (const base of bases) {
    const host = await firstVisibleJeObjectContainer(page, base);
    /* oneOf / switcher: aspettare i ruoli nel item reale evita rect instabili se il test parte dopo altri case. */
    const rowTitle = host.locator(':scope > .je-object__title').first();
    await expect(rowTitle, `titolo riga array ${base}`).toBeVisible();
    const titleText = (await rowTitle.textContent()) || '';
    expect(titleText.toLowerCase(), `testo titolo ${base}`).toContain('canali');
    expect(
      /[·\u00b7]/.test(titleText) || /\d/.test(titleText),
      `titolo ${base} deve avere · o cifra — «${titleText}»`
    ).toBeTruthy();

    for (const f of fields) {
      const path = `${base}.${f}`;
      const cell = await firstVisibleFieldCell(page, base, f);

      const control =
        f === 'tipo'
          ? cell.getByRole('combobox', { name: new RegExp(`^${f}$`, 'i') }).first()
          : cell.getByRole('textbox', { name: new RegExp(`^${f}$`, 'i') }).first();
      await expect(control, `controllo ${path}`).toBeVisible();

      /*
       * getBoundingClientRect() nome + controllo nello stesso evaluate: due chiamate Playwright boundingBox()
       * sullo stesso viewport possono disallinearsi tra un’azione e l’altra (falliva sempre come 2° test della suite).
       */
      const placement = await control.evaluate((controlEl, fieldName) => {
        const re = new RegExp(`^${fieldName}$`, 'i');
        let nameNode = null;
        const p = controlEl.previousElementSibling;
        if (p && re.test((p.textContent || '').trim())) {
          nameNode = p;
        }
        if (!nameNode) {
          const scope = controlEl.closest('[data-schemapath]');
          if (scope) {
            const matches = [];
            scope.querySelectorAll('*').forEach(n => {
              if (n === controlEl || controlEl.contains(n)) return;
              if (!re.test((n.textContent || '').trim())) return;
              matches.push(n);
            });
            if (matches.length) nameNode = matches[matches.length - 1];
          }
        }
        if (!nameNode) return { ok: false, reason: 'noNameNode' };
        const l = nameNode.getBoundingClientRect();
        const c = controlEl.getBoundingClientRect();
        if (l.width <= 0 || l.height <= 0 || c.width <= 0 || c.height <= 0)
          return { ok: false, reason: 'zeroRect' };
        const labelStackedAbove = l.bottom <= c.top + 22;
        const labelLeftInRow =
          l.right <= c.left + 20 && l.top < c.bottom - 1 && l.bottom > c.top + 1;
        const boundsOverlapX = Math.max(l.left, c.left) < Math.min(l.right, c.right) - 1;
        const verticalProximity = Math.abs(l.top - c.top) <= 420;
        const ok = labelStackedAbove || labelLeftInRow || (boundsOverlapX && verticalProximity);
        return {
          ok,
          labelStackedAbove,
          labelLeftInRow,
          boundsOverlapX,
          verticalProximity
        };
      }, f);
      expect(
        placement.ok,
        `nome campo «${f}» non associato al controllo (${path}) — ${JSON.stringify(placement)}`
      ).toBeTruthy();
    }

    const firstFieldPath = `${bases[0]}.tipo`;
    if (base === bases[0]) {
      const rowOrderOk = await page.evaluate(
        ({ bp, pathTipo }) => {
          function visibleObjectContainerForPath(path) {
            const list = document.querySelectorAll(`.je-object__container[data-schemapath="${path}"]`);
            for (let i = 0; i < list.length; i++) {
              const n = list[i];
              if (n.closest('.je-modal')) continue;
              if (!document.getElementById('editor-container')?.contains(n)) continue;
              const cs = getComputedStyle(n);
              if (cs.visibility === 'hidden' || cs.display === 'none') continue;
              const r = n.getBoundingClientRect();
              if (r.width <= 0 || r.height <= 0) continue;
              return n;
            }
            return null;
          }
          const h = visibleObjectContainerForPath(bp);
          const title = h?.querySelector(':scope > .je-object__title');
          const cells = [...document.querySelectorAll(`[data-schemapath="${pathTipo}"]`)];
          const tipoHost = cells.find(c => {
            if (!h?.contains(c)) return false;
            const cs = getComputedStyle(c);
            if (cs.visibility === 'hidden' || cs.display === 'none') return false;
            const r = c.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          if (!title || !tipoHost) return false;
          const pos = title.compareDocumentPosition(tipoHost);
          return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        },
        { bp: base, pathTipo: firstFieldPath }
      );
      expect(
        rowOrderOk,
        `titolo riga ${base} deve precedere il campo tipo nello stesso item (ordine DOM)`
      ).toBeTruthy();
    }
  }
}

async function assertArrayItemControlsPlacement(page) {
  const placementIssues = await page.evaluate(() => {
    const issues = [];
    function isItemControlButton(btn) {
      if (btn.classList.contains('json-editor-btntype-deleteall')) return false;
      if (btn.classList.contains('json-editor-btntype-deletelast')) return false;
      if (btn.classList.contains('json-editor-btntype-delete') || btn.classList.contains('json-editor-btn-delete'))
        return true;
      if (!btn.classList.contains('json-editor-btntype-move')) return false;
      const cn = btn.className || '';
      if (cn.indexOf('moveup') >= 0 || cn.indexOf('movedown') >= 0) return true;
      return /move\s*up/i.test(btn.getAttribute('title') || '') || /move\s*down/i.test(btn.getAttribute('title') || '');
    }
    const itemButtons = [...document.querySelectorAll('button')].filter(isItemControlButton);

    itemButtons.forEach((btn, index) => {
      const row = btn.closest('.je-array-item-row-controls');
      if (!row) {
        issues.push(`button ${index}: fuori da .je-array-item-row-controls`);
        return;
      }
      const title = row.closest('.je-object__title');
      if (!title) {
        issues.push(`button ${index}: controlli fuori da .je-object__title`);
        return;
      }

      const actionAnchor = title.querySelector(
        ':scope > .btn-group > .json-editor-btntype-editjson, :scope > .btn-group > .json-editor-btntype-properties'
      );
      if (actionAnchor) {
        const rowIsBeforeActions =
          (row.compareDocumentPosition(actionAnchor) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        if (!rowIsBeforeActions) {
          issues.push(`button ${index}: controlli item non prima di JSON/properties`);
        }
      }
    });

    return issues;
  });

  expect(
    placementIssues,
    `Controlli item non coerenti nel DOM:\n${placementIssues.join('\n')}`
  ).toEqual([]);
}

/**
 * Per ogni riga controlli item: esattamente delete + move up + move down (anche disabilitati).
 * Se nel form non esiste alcun pulsante riordino array, non applica (schema senza array o reorder off).
 */
async function assertArrayItemControlsComplete(page) {
  const issues = await page.evaluate(() => {
    const ROW_CLASS = 'je-array-item-row-controls';
    const root = document.getElementById('editor-container');
    if (!root) return ['manca #editor-container'];

    const reorderActive = [...root.querySelectorAll('button')].some(
      b => !b.closest('.je-modal') && b.classList.contains('json-editor-btntype-move')
    );
    if (!reorderActive) return [];

    function isDel(b) {
      return (
        (b.classList.contains('json-editor-btntype-delete') || b.classList.contains('json-editor-btn-delete')) &&
        !b.classList.contains('json-editor-btntype-deleteall') &&
        !b.classList.contains('json-editor-btntype-deletelast')
      );
    }
    function isUp(b) {
      return b.classList.contains('json-editor-btntype-move') && b.className.indexOf('moveup') >= 0;
    }
    function isDown(b) {
      return b.classList.contains('json-editor-btntype-move') && b.className.indexOf('movedown') >= 0;
    }

    const out = [];
    root.querySelectorAll('.' + ROW_CLASS).forEach((row, index) => {
      const btns = [...row.querySelectorAll(':scope > button')];
      const d = btns.filter(isDel).length;
      const u = btns.filter(isUp).length;
      const v = btns.filter(isDown).length;
      if (d !== 1 || u !== 1 || v !== 1) {
        out.push(
          `riga controlli ${index} [schemapath=${row.closest('[data-schemapath]')?.getAttribute('data-schemapath') || '?'}]: attesi 1×delete 1×moveup 1×movedown, trovati ${d}/${u}/${v}`
        );
      }
    });
    return out;
  });

  expect(issues, `Controlli item incompleti:\n${issues.join('\n')}`).toEqual([]);
}

test.describe('Functional webforms coverage from manifest', () => {
  test.beforeEach(async ({ page }) => {
    await clearDrafts(page);
  });

  test('catalog renders all webforms declared in manifest', async ({ page }) => {
    await page.goto('/index.html#catalog');
    await expect(page.locator('#webforms-catalog .webform-catalog-card')).toHaveCount(webforms.length, {
      timeout: 60000
    });

    for (const webform of webforms) {
      const compileSelector = `#webforms-catalog a[href*="form.html?webform=${encodeURIComponent(webform.id)}"]`;
      await expect(page.locator(compileSelector).first()).toBeVisible();
      await expect(page.locator('#webforms-catalog')).toContainText(webform.title);
    }
  });

  test('each manifest webform passes editor invariants (arrays, headings under indexed paths, schema chrome)', async ({
    page,
    request
  }) => {
    for (const webform of webforms) {
      await test.step(`open and validate ${webform.id}`, async () => {
        const campoTechnical = await defNamesWithCampoPrefix(request, webform.schemaUrl);

        await page.goto(webformUrl(webform.id));
        await waitForEditorReady(page);

        await clickToolbarButton(page, '#btn-validate');
        await expect(page.locator('#validation-panel-wrapper')).not.toHaveClass(/d-none/);
        await expect(page.locator('#validation-panel .callout')).toBeVisible();

        await activateAllJsonEditorTabs(page);

        await assertArrayItemControlsPlacement(page);
        await assertArrayItemControlsComplete(page);
        await assertEveryIndexedArrayItemObjectHasHeadingControls(page);
        await assertEveryArrayObjectItemRowHeaderShowsParentAndIndex(page);
        await assertFieldChromeForAllIndexedObjectHosts(page);
        await assertAssistenzaCanaliArrayItemLayout(page);
        await assertForbiddenExactEditorChrome(page, [...campoTechnical, 'Campo Risposta']);
      });
    }
  });

  test('save drafts for each manifest webform and verify catalog + bozze consistency', async ({ page }) => {
    const savedNames = [];

    for (const webform of webforms) {
      const draftName = `E2E ${webform.id} ${Date.now()}`;
      savedNames.push(draftName);

      await page.goto(webformUrl(webform.id));
      await waitForEditorReady(page);

      await page.fill('#form-name-input', draftName);
      await page.evaluate(() => {
        if (typeof saveCurrentForm === 'function') {
          saveCurrentForm();
        }
      });
      await expect
        .poll(async () =>
          page.evaluate(name => {
            const forms = JSON.parse(localStorage.getItem('eid-wallet-forms') || '[]');
            return forms.some(entry => entry.name === name);
          }, draftName)
        )
        .toBe(true);
      await expect(page.locator('#form-id-badge')).not.toHaveClass(/d-none/);
    }

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('eid-wallet-forms') || '[]'));
    expect(stored.length).toBe(webforms.length);
    for (const webform of webforms) {
      expect(stored.some(entry => entry.webform_id === webform.id)).toBeTruthy();
    }

    await page.goto('/index.html#bozze');
    await expect(page.locator('#view-bozze')).not.toHaveClass(/d-none/);
    await expect(page.locator('#form-list .bozza-card')).toHaveCount(webforms.length);
    for (const draftName of savedNames) {
      await expect(page.locator('#form-list')).toContainText(draftName);
    }

    await page.goto('/index.html#catalog');
    for (const webform of webforms) {
      const latestDraftLink = `#webforms-catalog a[href*="form.html?id="][href*="webform=${encodeURIComponent(webform.id)}"]`;
      await expect(page.locator(latestDraftLink).first()).toBeVisible();
    }
  });

  test('form page supports deterministic export/import JSON+CSV', async ({ page }, testInfo) => {
    const webformId = webforms[0]?.id;
    expect(webformId, 'Manifest without webforms').toBeTruthy();

    await page.goto(webformUrl(webformId));
    await waitForEditorReady(page);
    await page.fill('#form-name-input', `E2E import export ${Date.now()}`);

    await clickToolbarButton(page, '#form-export-dropdown');
    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      clickToolbarButton(page, '#btn-export-json')
    ]);
    const exportedJsonPath = testInfo.outputPath('exported-form.json');
    await jsonDownload.saveAs(exportedJsonPath);
    expect(fs.existsSync(exportedJsonPath)).toBeTruthy();

    await clickToolbarButton(page, '#form-export-dropdown');
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      clickToolbarButton(page, '#btn-export-csv')
    ]);
    const exportedCsvPath = testInfo.outputPath('exported-form.csv');
    await csvDownload.saveAs(exportedCsvPath);
    expect(fs.existsSync(exportedCsvPath)).toBeTruthy();

    await clickToolbarButton(page, '#form-import-dropdown');
    const [jsonChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickToolbarButton(page, '#btn-import-json')
    ]);
    await jsonChooser.setFiles(exportedJsonPath);
    await expect(page.locator('#form-name-input')).not.toHaveValue('');

    page.once('dialog', dialog => dialog.accept());
    await clickToolbarButton(page, '#form-import-dropdown');
    const [csvChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      clickToolbarButton(page, '#btn-import-csv')
    ]);
    await csvChooser.setFiles(exportedCsvPath);
    await expect(page.locator('#form-name-input')).not.toHaveValue('');
  });

  test('bozze page supports import actions and draft card actions', async ({ page }, testInfo) => {
    await page.goto('/index.html#bozze');
    await expect(page.locator('#view-bozze')).not.toHaveClass(/d-none/);

    const jsonFixturePath = testInfo.outputPath('import-fixture.json');
    const csvFixturePath = testInfo.outputPath('import-fixture.csv');

    fs.writeFileSync(
      jsonFixturePath,
      JSON.stringify({ metadata: { nome_eaa: 'E2E JSON Draft' } }, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      csvFixturePath,
      [
        'percorso;tipo_dato;valore',
        // stringa con ";": virgolette RFC 4180 sul valore
        'metadata.nome_eaa;stringa;"E2E CSV; punto e virgola nel nome"',
        ''
      ].join('\r\n'),
      'utf8'
    );

    const [jsonChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#btn-import-json')
    ]);
    await jsonChooser.setFiles(jsonFixturePath);
    await expect(page.locator('#form-list .bozza-card')).toHaveCount(1);
    await expect(page.locator('#form-list')).toContainText('E2E JSON Draft');

    const [csvChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#btn-import-csv')
    ]);
    await csvChooser.setFiles(csvFixturePath);
    await expect(page.locator('#form-list .bozza-card')).toHaveCount(2);
    await expect(page.locator('#form-list')).toContainText('E2E CSV; punto e virgola nel nome');

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#form-list [data-action="export-json"]').first().click()
    ]);
    await jsonDownload.saveAs(testInfo.outputPath('bozze-export.json'));

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#form-list [data-action="export-csv"]').first().click()
    ]);
    await csvDownload.saveAs(testInfo.outputPath('bozze-export.csv'));
  });
});
