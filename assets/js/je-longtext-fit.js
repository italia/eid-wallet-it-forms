/**
 * Riduce dinamicamente la font-size di input/textarea json-editor così il testo
 * resta leggibile senza ellissi (scroll orizzontale solo se serve, sotto una soglia minima).
 * Da inizializzare sul contenitore #editor-container dopo je-ready.
 */
(function () {
  const FIT_CLASS = 'je-longtext-fit';
  const MIN_PX = 10;
  const STEP = 0.5;
  const DEBOUNCE_MS = 64;

  const INPUT_SELECTOR =
    'input.form-control:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="button"]):not([type="submit"])';

  function isExcluded(el) {
    return (
      el.classList.contains('je-edit-json--textarea') ||
      el.closest('.je-modal') != null
    );
  }

  function captureMaxFontPx(el) {
    el.style.fontSize = '';
    const px = parseFloat(window.getComputedStyle(el).fontSize);
    if (Number.isFinite(px) && px > 0) {
      el.dataset.jeFitMaxPx = String(px);
    } else {
      el.dataset.jeFitMaxPx = '16';
    }
  }

  function fitFont(el) {
    if (!el.isConnected || isExcluded(el)) return;
    const maxPx = parseFloat(el.dataset.jeFitMaxPx);
    if (!Number.isFinite(maxPx) || maxPx <= 0) captureMaxFontPx(el);
    const cap = parseFloat(el.dataset.jeFitMaxPx);

    if (!el.value || el.value.length === 0) {
      el.style.removeProperty('font-size');
      return;
    }

    el.style.fontSize = cap + 'px';

    if (el.tagName === 'TEXTAREA') {
      let px = cap;
      while (
        px >= MIN_PX &&
        (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
      ) {
        px -= STEP;
        el.style.fontSize = px + 'px';
      }
    } else {
      let px = cap;
      while (px >= MIN_PX && el.scrollWidth > el.clientWidth + 1) {
        px -= STEP;
        el.style.fontSize = px + 'px';
      }
    }
  }

  function bindEl(el) {
    if (!el || el.dataset.jeLongtextFitBound === '1') return;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    if (isExcluded(el)) return;

    el.dataset.jeLongtextFitBound = '1';
    el.classList.add(FIT_CLASS);
    captureMaxFontPx(el);

    const run = () => fitFont(el);
    el.addEventListener('input', run);
    el.addEventListener('change', run);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(run);
      ro.observe(el);
    }
    requestAnimationFrame(run);
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(INPUT_SELECTOR).forEach(bindEl);
    root.querySelectorAll('textarea.form-control').forEach(bindEl);
  }

  let debounceId = null;
  function debouncedScan(root) {
    if (debounceId) window.clearTimeout(debounceId);
    debounceId = window.setTimeout(() => {
      debounceId = null;
      scan(root);
    }, DEBOUNCE_MS);
  }

  /**
   * @param {Element} rootEl – es. document.getElementById('editor-container')
   */
  function initJeLongtextFit(rootEl) {
    if (!rootEl) return;

    scan(rootEl);

    if (typeof MutationObserver === 'undefined') return;

    const mo = new MutationObserver(() => debouncedScan(rootEl));
    mo.observe(rootEl, { childList: true, subtree: true });
  }

  window.initJeLongtextFit = initJeLongtextFit;
})();
