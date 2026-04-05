/**
 * Keep item controls (delete/move) in item heading.
 * Generic for any schema by using indexed data-schemapath nodes.
 */
(function () {
  const ROW_CTRL_CLASS = 'je-array-item-row-controls';

  function isItemSchemapath(sp) {
    const s = String(sp || '');
    // Supports both styles used by json-editor: root.arr[0] and root.arr.0
    return /\[\d+\](?:\.|$)|(?:^|\.)\d+(?:\.|$)/.test(s);
  }

  function cssEscapeValue(v) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(v);
    return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function findItemTitle(host) {
    if (!host) return null;
    return (
      host.querySelector(':scope > .je-object__title') ||
      host.querySelector('.je-object__title') ||
      host.querySelector(':scope > .card > .card-header .card-title') ||
      host.querySelector('.card-header .card-title') ||
      host.querySelector(':scope .card-title')
    );
  }

  function findTitleActionsAnchor(title) {
    if (!title) return null;
    const actionBtn = title.querySelector(
      'button.json-editor-btntype-editjson, button.json-editor-btntype-properties'
    );
    if (!actionBtn) return null;
    return actionBtn.closest('.btn-group') || actionBtn;
  }

  function ensureRowGroupInTitle(title) {
    let row = title.querySelector(':scope > .' + ROW_CTRL_CLASS);
    if (row) return row;
    row = document.createElement('div');
    row.className = 'btn-group ' + ROW_CTRL_CLASS + ' d-inline-flex align-items-center';
    const anchor = findTitleActionsAnchor(title);
    if (anchor) title.insertBefore(row, anchor);
    else title.appendChild(row);
    return row;
  }

  function decorateButton(btn) {
    if (!btn) return;
    btn.classList.add('btn', 'btn-sm');
    btn.classList.remove('btn-xs', 'btn-xxs');
    const isDanger = btn.matches('.json-editor-btntype-delete, .json-editor-btn-delete');
    if (isDanger) {
      btn.classList.add('btn-outline-danger');
      btn.classList.remove('btn-outline-secondary', 'btn-secondary', 'btn-primary');
    } else {
      btn.classList.add('btn-outline-secondary');
      btn.classList.remove('btn-outline-danger', 'btn-secondary', 'btn-primary');
    }
  }

  function isDeleteButton(btn) {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    if (
      btn.classList.contains('json-editor-btntype-deleteall') ||
      btn.classList.contains('json-editor-btntype-deletelast')
    ) {
      return false;
    }
    return (
      btn.classList.contains('json-editor-btntype-delete') ||
      btn.classList.contains('json-editor-btn-delete')
    );
  }

  function isMoveUpButton(btn) {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    return btn.className.indexOf('moveup') >= 0 || /move\s*up/i.test(btn.getAttribute('title') || '');
  }

  function isMoveDownButton(btn) {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    return btn.className.indexOf('movedown') >= 0 || /move\s*down/i.test(btn.getAttribute('title') || '');
  }

  function isItemButton(btn) {
    return isDeleteButton(btn) || isMoveUpButton(btn) || isMoveDownButton(btn);
  }

  function parseButtonIndex(btn) {
    const raw = btn && btn.getAttribute ? btn.getAttribute('data-i') : null;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function nearestSchemapathAncestors(node) {
    const out = [];
    let cur = node;
    while (cur && cur !== document.body) {
      if (cur.getAttribute) {
        const sp = cur.getAttribute('data-schemapath');
        if (sp) out.push({ el: cur, sp });
      }
      cur = cur.parentElement;
    }
    return out;
  }

  function resolveItemScope(btn, root) {
    const direct = btn.closest('.je-object__container[data-schemapath]');
    if (direct) {
      const sp = direct.getAttribute('data-schemapath') || '';
      if (isItemSchemapath(sp)) return direct;
    }

    const idx = parseButtonIndex(btn);
    if (idx == null) return direct || null;

    const ancestors = nearestSchemapathAncestors(btn);
    for (const a of ancestors) {
      const c1 = `${a.sp}.${idx}`;
      const c2 = `${a.sp}[${idx}]`;
      const local1 = a.el.querySelector(`.je-object__container[data-schemapath="${cssEscapeValue(c1)}"]`);
      if (local1) return local1;
      const local2 = a.el.querySelector(`.je-object__container[data-schemapath="${cssEscapeValue(c2)}"]`);
      if (local2) return local2;
      const global1 = root.querySelector(`.je-object__container[data-schemapath="${cssEscapeValue(c1)}"]`);
      if (global1) return global1;
      const global2 = root.querySelector(`.je-object__container[data-schemapath="${cssEscapeValue(c2)}"]`);
      if (global2) return global2;
    }
    return direct || null;
  }

  function getItemButtonType(btn) {
    if (isDeleteButton(btn)) return 'delete';
    if (isMoveUpButton(btn)) return 'moveup';
    if (isMoveDownButton(btn)) return 'movedown';
    return null;
  }

  function dedupeRowButtons(row) {
    if (!row) return;
    const seen = new Set();
    [...row.querySelectorAll(':scope > button')].forEach(btn => {
      const type = getItemButtonType(btn);
      if (!type) return;
      if (seen.has(type)) {
        btn.remove();
        return;
      }
      seen.add(type);
    });
  }

  function placeItemControlGroups(root) {
    const itemButtons = [...root.querySelectorAll('button')]
      .filter(btn => !btn.closest('.je-modal'))
      .filter(isItemButton);
    itemButtons.forEach(btn => {
      const scope = resolveItemScope(btn, root);
      if (!scope) return;
      const sp = scope.getAttribute('data-schemapath') || '';
      if (!isItemSchemapath(sp)) return;
      const title = findItemTitle(scope);
      if (!title) return;
      const row = ensureRowGroupInTitle(title);
      const type = getItemButtonType(btn);
      if (!type) return;
      if (btn.closest('.' + ROW_CTRL_CLASS) !== row) {
        const existingSameType = [...row.querySelectorAll(':scope > button')]
          .find(b => getItemButtonType(b) === type);
        if (existingSameType) {
          btn.remove();
        } else {
          decorateButton(btn);
          const oldParent = btn.parentElement;
          row.appendChild(btn);
          if (
            oldParent &&
            oldParent !== row &&
            oldParent.classList &&
            oldParent.classList.contains('btn-group') &&
            !oldParent.querySelector('button')
          ) {
            oldParent.remove();
          }
        }
      }
      dedupeRowButtons(row);
    });

    // Hard safety: no item-control row is allowed on non-item headings.
    [...root.querySelectorAll('.je-object__container[data-schemapath]')].forEach(scope => {
      const sp = scope.getAttribute('data-schemapath') || '';
      if (isItemSchemapath(sp)) return;
      const title = findItemTitle(scope);
      if (!title) return;
      title.querySelectorAll(':scope > .' + ROW_CTRL_CLASS).forEach(row => row.remove());
    });
  }

  // Runtime helper to debug placement in browser console.
  window.__dumpItemControlPlacement = function () {
    const root = document.getElementById('editor-container') || document.body;
    return [...root.querySelectorAll('button')]
      .filter(isItemButton)
      .map(btn => {
        const scope = resolveItemScope(btn, root);
        const title = findItemTitle(scope);
        const row = title && title.querySelector(':scope > .' + ROW_CTRL_CLASS);
        return {
          label: (btn.textContent || '').replace(/\s+/g, ' ').trim(),
          classes: btn.className,
          hostSchemapath: scope ? (scope.getAttribute('data-schemapath') || null) : null,
          scopeClass: scope ? scope.className : null,
          inTitleRow: !!(row && btn.closest('.' + ROW_CTRL_CLASS) === row),
          parentTag: btn.parentElement ? btn.parentElement.tagName : null,
          parentClass: btn.parentElement ? btn.parentElement.className : null
        };
      });
  };

  let _mo = null;
  let _moTimer = null;

  function initJeArrayControlCard(root) {
    const el = root || document.getElementById('editor-container');
    if (!el) return;
    if (_mo) _mo.disconnect();
    try {
      placeItemControlGroups(el);
    } finally {
      if (_mo) _mo.observe(el, { childList: true, subtree: true });
    }
  }

  function setupJeArrayControlObserver() {
    const el = document.getElementById('editor-container');
    if (!el || _mo) return;
    _mo = new MutationObserver(() => {
      if (_moTimer) clearTimeout(_moTimer);
      _moTimer = setTimeout(() => {
        _moTimer = null;
        initJeArrayControlCard(el);
      }, 60);
    });
    _mo.observe(el, { childList: true, subtree: true });
  }

  window.initJeArrayControlCard = initJeArrayControlCard;
  window.setupJeArrayControlObserver = setupJeArrayControlObserver;
})();
