/**
 * Keep item controls (delete/move) in item heading.
 * Generic for any schema by using indexed data-schemapath nodes.
 */
(function () {
  const ROW_CTRL_CLASS = 'je-array-item-row-controls';

  function isIndexedSchemapath(sp) {
    return /\[\d+\](?:\.|$)/.test(String(sp || ''));
  }

  function findIndexedHost(node) {
    let cur = node;
    while (cur && cur !== document.body) {
      if (cur.getAttribute) {
        const sp = cur.getAttribute('data-schemapath') || '';
        if (isIndexedSchemapath(sp)) return cur;
      }
      cur = cur.parentElement;
    }
    return null;
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

  function findPlacementScope(node) {
    if (!node || !node.closest) return null;
    const candidates = [
      node.closest('.je-object__container'),
      node.closest('.well'),
      node.closest('.card'),
      node.closest('[data-schemapath]')
    ].filter(Boolean);
    for (const scope of candidates) {
      const title = findItemTitle(scope);
      if (title) return scope;
    }
    return null;
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
    return btn.className.indexOf('moveup') >= 0;
  }

  function isMoveDownButton(btn) {
    if (!btn || btn.tagName !== 'BUTTON') return false;
    return btn.className.indexOf('movedown') >= 0;
  }

  function isItemButton(btn) {
    return isDeleteButton(btn) || isMoveUpButton(btn) || isMoveDownButton(btn);
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

  function isItemControlGroup(group) {
    if (!group || group.closest('.je-modal')) return false;
    const hasDelete = !!group.querySelector('button.json-editor-btntype-delete, button.json-editor-btn-delete');
    const hasMove = !!group.querySelector('button[class*="moveup"], button[class*="movedown"]');
    const hasArrayLevel = !!group.querySelector(
      'button.json-editor-btntype-add, button.json-editor-btntype-deletelast, button.json-editor-btntype-deleteall'
    );
    const hasStructural = !!group.querySelector(
      'button.json-editor-btntype-editjson, button.json-editor-btntype-properties, button.json-editor-btntype-toggle, button.json-editor-btn-collapse'
    );
    // Item group can be delete-only, move-only, or delete+move, but never array-level/structural.
    return (hasDelete || hasMove) && !hasArrayLevel && !hasStructural;
  }

  function placeItemControlGroups(root) {
    const groups = [...root.querySelectorAll('.btn-group')].filter(isItemControlGroup);
    groups.forEach(group => {
      const scope = findPlacementScope(group);
      if (!scope) return;
      const title = findItemTitle(scope);
      if (!title) return;
      const row = ensureRowGroupInTitle(title);

      const itemButtons = [...group.querySelectorAll(':scope > button')].filter(isItemButton);
      itemButtons.forEach(btn => {
        const type = getItemButtonType(btn);
        if (!type) return;
        if (btn.closest('.' + ROW_CTRL_CLASS) === row) return;
        const existing = row.querySelector(':scope > button');
        if (existing && getItemButtonType(existing) === type) {
          btn.remove();
          return;
        }
        const existingSameType = [...row.querySelectorAll(':scope > button')]
          .find(b => getItemButtonType(b) === type);
        if (existingSameType) {
          btn.remove();
          return;
        }
        decorateButton(btn);
        row.appendChild(btn);
      });

      dedupeRowButtons(row);
      if (!group.querySelector(':scope > button')) group.remove();
    });
  }

  // Runtime helper to debug placement in browser console.
  window.__dumpItemControlPlacement = function () {
    const root = document.getElementById('editor-container') || document.body;
    return [...root.querySelectorAll('button')]
      .filter(isItemButton)
      .map(btn => {
        const host = findIndexedHost(btn);
        const scope = findPlacementScope(btn.closest('.btn-group') || btn);
        const title = findItemTitle(scope || host);
        const row = title && title.querySelector(':scope > .' + ROW_CTRL_CLASS);
        return {
          label: (btn.textContent || '').replace(/\s+/g, ' ').trim(),
          classes: btn.className,
          hostSchemapath: host ? (host.getAttribute('data-schemapath') || null) : null,
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
