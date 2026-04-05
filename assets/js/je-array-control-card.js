/**
 * Posiziona i controlli item array (delete / move up / move down)
 * dentro il titolo dell'item, tra testo heading e azioni JSON/proprietà.
 * Logica generica basata su data-schemapath: funziona per qualunque schema.
 */
(function () {
  const ROW_CTRL_CLASS = 'je-array-item-row-controls';
  const LEGACY_WRAPPER_CLASS = 'je-array-control-card';
  const LEGACY_HEADER_ROW_CLASS = 'je-array-item-header-row';

  function setButtonA11y(button, label) {
    if (!button || !label) return;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }

  function setButtonIcon(button, biClass) {
    if (!button || !biClass) return;
    if (button.querySelector('i.bi')) return;
    const icon = document.createElement('i');
    icon.className = 'bi ' + biClass + ' me-1';
    icon.setAttribute('aria-hidden', 'true');
    button.prepend(icon);
  }

  function ensureButtonClasses(button, variant) {
    if (!button) return;
    button.classList.add('btn', 'btn-sm');
    button.classList.remove('btn-xs', 'btn-xxs');
    if (variant === 'danger') {
      button.classList.add('btn-outline-danger');
      button.classList.remove('btn-outline-secondary', 'btn-secondary', 'btn-primary');
    } else {
      button.classList.add('btn-outline-secondary');
      button.classList.remove('btn-outline-danger', 'btn-secondary', 'btn-primary');
    }
  }

  function applyArrayButtonA11y(root) {
    root.querySelectorAll('button').forEach(btn => {
      if (btn.classList.contains('json-editor-btntype-add')) {
        setButtonA11y(btn, 'Aggiungi elemento');
        setButtonIcon(btn, 'bi-plus-lg');
        ensureButtonClasses(btn, 'neutral');
      }
      if (btn.classList.contains('json-editor-btntype-delete') || btn.classList.contains('json-editor-btn-delete')) {
        setButtonA11y(btn, 'Elimina elemento');
        setButtonIcon(btn, 'bi-trash');
        ensureButtonClasses(btn, 'danger');
      }
      if (btn.classList.contains('json-editor-btntype-moveup')) {
        setButtonA11y(btn, 'Sposta elemento su');
        setButtonIcon(btn, 'bi-arrow-up');
        ensureButtonClasses(btn, 'neutral');
      }
      if (btn.classList.contains('json-editor-btntype-movedown')) {
        setButtonA11y(btn, 'Sposta elemento giu');
        setButtonIcon(btn, 'bi-arrow-down');
        ensureButtonClasses(btn, 'neutral');
      }
      if (btn.classList.contains('json-editor-btntype-deleteall')) {
        setButtonA11y(btn, 'Elimina tutti gli elementi');
        setButtonIcon(btn, 'bi-trash3');
        ensureButtonClasses(btn, 'danger');
      }
      if (btn.classList.contains('json-editor-btntype-deletelast')) {
        setButtonA11y(btn, 'Elimina ultimo elemento');
        setButtonIcon(btn, 'bi-dash-circle');
        ensureButtonClasses(btn, 'danger');
      }
    });
  }

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

  function findGenericHost(node) {
    return (
      (node && node.closest && node.closest('.je-object__container')) ||
      (node && node.closest && node.closest('.card')) ||
      (node && node.closest && node.closest('[data-schemapath]')) ||
      null
    );
  }

  function isItemControlGroup(group) {
    if (!group || group.closest('.je-modal')) return false;
    if (group.querySelector('.json-editor-btntype-deleteall, .json-editor-btntype-deletelast')) return false;
    const hasDelete = group.querySelector('.json-editor-btntype-delete, .json-editor-btn-delete');
    if (!hasDelete) return false;
    return !!(findIndexedHost(group) || findGenericHost(group));
  }

  function topLevelChild(parent, descendant) {
    let n = descendant;
    while (n && n.parentElement !== parent) n = n.parentElement;
    return n && n.parentElement === parent ? n : null;
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
    const group = actionBtn.closest('.btn-group') || actionBtn;
    return topLevelChild(title, group);
  }

  function clearLegacyStructure(root) {
    root.querySelectorAll('.' + LEGACY_WRAPPER_CLASS).forEach(w => {
      const p = w.parentElement;
      if (!p) return;
      while (w.firstChild) p.insertBefore(w.firstChild, w);
      w.remove();
    });
    root.querySelectorAll('.' + LEGACY_HEADER_ROW_CLASS).forEach(row => {
      const p = row.parentElement;
      if (!p) return;
      while (row.firstChild) p.insertBefore(row.firstChild, row);
      row.remove();
    });
  }

  function moveGroupToHeading(group) {
    const host = findIndexedHost(group) || findGenericHost(group);
    const title = findItemTitle(host);
    if (!host || !title) return;

    group.classList.add(ROW_CTRL_CLASS);
    group.classList.add('d-inline-flex', 'align-items-center');
    const anchor = findTitleActionsAnchor(title);
    if (anchor) {
      title.insertBefore(group, anchor);
      return;
    }
    title.appendChild(group);
  }

  function placeItemControlGroups(root) {
    clearLegacyStructure(root);
    root.querySelectorAll('.btn-group').forEach(group => {
      if (!isItemControlGroup(group)) return;
      moveGroupToHeading(group);
    });
    applyArrayButtonA11y(root);
  }

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
