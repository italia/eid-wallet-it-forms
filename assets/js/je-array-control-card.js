/**
 * Avvolge i .btn-group delle righe array (cancella / sposta) in
 * <div class="card card-body bg-light je-array-control-card">.
 * Per gli oggetti-item: card prima di .je-object__controls; titolo + card + JSON in
 * <div class="je-array-item-header-row"> (flex nowrap, una sola riga).
 */
(function () {
  const WRAPPER_MARK = 'je-array-control-card';
  const WRAPPER_CLASS = 'card card-body bg-light ' + WRAPPER_MARK;
  const HEADER_ROW_CLASS = 'je-array-item-header-row';
  const ARRAY_ROW_HOST_CLASS = 'je-object--array-row-controls';
  /** Marca il btn-group sposta/cancella riga: stile CSS unico (referenti, canali, faq, …). */
  const ROW_CTRL_CLASS = 'je-array-item-row-controls';

  function unwrapHeaderRows(el) {
    el.querySelectorAll('.' + HEADER_ROW_CLASS).forEach(row => {
      const parent = row.parentElement;
      if (!parent) return;
      while (row.firstChild) {
        parent.insertBefore(row.firstChild, row);
      }
      row.remove();
    });
  }

  function repositionRowControlsInline(wrapper) {
    let container = wrapper.parentElement;
    if (!container || !container.classList.contains('je-object__container')) {
      container = wrapper.closest('.je-object__container');
    }
    if (!container) return;
    const controls = container.querySelector(':scope > .je-object__controls');
    if (!controls) return;
    container.insertBefore(wrapper, controls);
    container.classList.add(ARRAY_ROW_HOST_CLASS);
  }

  function ensureHeaderRow(container) {
    const title = container.querySelector(':scope > .je-object__title');
    const card = container.querySelector(':scope > .je-array-control-card');
    const controls = container.querySelector(':scope > .je-object__controls');
    if (!title || !card || !controls) return;
    if (title.parentElement && title.parentElement.classList.contains(HEADER_ROW_CLASS)) return;
    const row = document.createElement('div');
    row.className = HEADER_ROW_CLASS;
    container.insertBefore(row, title);
    row.appendChild(title);
    row.appendChild(card);
    row.appendChild(controls);
  }

  function wrapArrayRowControlGroupsImpl(el) {
    unwrapHeaderRows(el);
    el.querySelectorAll('.je-object__container.' + ARRAY_ROW_HOST_CLASS).forEach(c => {
      c.classList.remove(ARRAY_ROW_HOST_CLASS);
    });
    el.querySelectorAll('.btn-group').forEach(group => {
      if (!group.querySelector('.json-editor-btntype-delete, .json-editor-btn-delete')) return;
      if (group.closest('.je-modal')) return;
      if (group.closest('.' + WRAPPER_MARK)) return;
      group.classList.add(ROW_CTRL_CLASS);
      const wrap = document.createElement('div');
      wrap.className = WRAPPER_CLASS;
      group.parentNode.insertBefore(wrap, group);
      wrap.appendChild(group);
    });
    el.querySelectorAll('.' + WRAPPER_MARK).forEach(repositionRowControlsInline);
    el.querySelectorAll('.je-object__container.' + ARRAY_ROW_HOST_CLASS).forEach(ensureHeaderRow);
  }

  let _mo = null;
  let _moTimer = null;

  function wrapArrayRowControlGroups(root) {
    const el = root || document.getElementById('editor-container');
    if (!el) return;
    if (_mo) _mo.disconnect();
    try {
      wrapArrayRowControlGroupsImpl(el);
    } finally {
      if (_mo) _mo.observe(el, { childList: true, subtree: true });
    }
  }

  /** Da chiamare una volta dopo l’editor: json-editor riscrive il DOM in ritardo (es. referenti). */
  function setupJeArrayControlObserver() {
    const el = document.getElementById('editor-container');
    if (!el || _mo) return;
    _mo = new MutationObserver(() => {
      if (_moTimer) clearTimeout(_moTimer);
      _moTimer = setTimeout(() => {
        _moTimer = null;
        wrapArrayRowControlGroups(el);
      }, 80);
    });
    _mo.observe(el, { childList: true, subtree: true });
  }

  window.initJeArrayControlCard = wrapArrayRowControlGroups;
  window.setupJeArrayControlObserver = setupJeArrayControlObserver;
})();
