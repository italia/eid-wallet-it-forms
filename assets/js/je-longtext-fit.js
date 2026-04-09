/**
 * json-editor: niente riduzione font-size.
 * — textarea: aumenta `rows` finché il testo entra (con minimo da schema/tema e tetto massimo).
 * — input: solo overflow orizzontale (CSS); font sempre quello del tema.
 * Inizializzare su #editor-container dopo je-ready.
 */
(function () {
  const FIT_CLASS = 'je-longtext-fit';
  const DEBOUNCE_MS = 64;
  const TEXTAREA_MAX_ROWS = 100;

  const INPUT_SELECTOR =
    'input.form-control:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="button"]):not([type="submit"])';

  function isExcluded(el) {
    return (
      el.classList.contains('je-edit-json--textarea') ||
      el.closest('.je-modal') != null
    );
  }

  /**
   * Su `oneOf` con ramo `{ "maxLength": 0 }` (solo stringa vuota), json-editor può propagare
   * `maxlength="0"` anche al ramo reso come textarea / testo libero → il browser rifiuta ogni
   * carattere. La validazione resta nello schema; l’attributo HTML non deve bloccare la digitazione.
   */
  function stripBlockingHtmlMaxlength(el) {
    if (!el || !el.hasAttribute('maxlength')) return;
    const raw = el.getAttribute('maxlength');
    const m = parseInt(raw, 10);
    if (raw === '0' || m === 0) el.removeAttribute('maxlength');
  }

  function textareaMinRows(el) {
    const fromData = parseInt(el.dataset.jeMinRows, 10);
    if (Number.isFinite(fromData) && fromData >= 1) return fromData;
    const fromAttr = parseInt(el.getAttribute('rows'), 10);
    let n = Number.isFinite(fromAttr) && fromAttr >= 1 ? fromAttr : 2;
    // json-editor usa spesso rows alti sulle textarea: a campo vuoto resta compatto (cresce con il testo)
    if (!el.value && n > 3) n = 2;
    el.dataset.jeMinRows = String(n);
    return n;
  }

  function fitTextareaRows(el) {
    el.style.removeProperty('font-size');
    const minRows = textareaMinRows(el);

    if (!el.value) {
      el.rows = minRows;
      el.style.removeProperty('overflow-y');
      return;
    }

    let r = minRows;
    el.rows = r;
    while (r < TEXTAREA_MAX_ROWS && el.scrollHeight > el.clientHeight + 1) {
      r += 1;
      el.rows = r;
    }

    while (r > minRows) {
      el.rows = r - 1;
      if (el.scrollHeight > el.clientHeight + 1) {
        el.rows = r;
        break;
      }
      r -= 1;
    }

    if (r >= TEXTAREA_MAX_ROWS && el.scrollHeight > el.clientHeight + 1) {
      el.style.overflowY = 'auto';
    } else {
      el.style.removeProperty('overflow-y');
    }
  }

  function fitInput(el) {
    el.style.removeProperty('font-size');
  }

  function runFit(el) {
    if (!el.isConnected || isExcluded(el)) return;
    stripBlockingHtmlMaxlength(el);
    if (el.tagName === 'TEXTAREA') fitTextareaRows(el);
    else fitInput(el);
  }

  function bindEl(el) {
    if (!el || el.dataset.jeLongtextFitBound === '1') return;
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    if (isExcluded(el)) return;

    stripBlockingHtmlMaxlength(el);

    el.dataset.jeLongtextFitBound = '1';
    el.classList.add(FIT_CLASS);
    if (el.tagName === 'TEXTAREA') textareaMinRows(el);

    const run = () => runFit(el);
    let textareaFitTimer = null;
    const onInput = () => {
      if (el.tagName !== 'TEXTAREA') {
        run();
        return;
      }
      if (textareaFitTimer) window.clearTimeout(textareaFitTimer);
      textareaFitTimer = window.setTimeout(() => {
        textareaFitTimer = null;
        runFit(el);
      }, 32);
    };
    el.addEventListener('input', onInput);
    el.addEventListener('change', run);
    /*
     * Solo per `<input>`: ResizeObserver è utile se cambia larghezza.
     * Su `<textarea>` osservare lo stesso elemento mentre `fitTextareaRows` modifica `rows`
     * può innescare un ciclo osservatore → ridimensionamento → scrollHeight che sembra
     * «bloccare» il campo (focus / digitazione).
     */
    if (typeof ResizeObserver !== 'undefined' && el.tagName === 'INPUT') {
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
