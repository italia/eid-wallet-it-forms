/**
 * Componenti di chrome condivisi tra le pagine (footer, toast, modale errori app).
 * Versioni CDN allineate a index.html / form.html (Bootstrap Italia 2.18.0, Bootstrap Icons 1.11.3).
 */
(function (global) {
  'use strict';

  var REPO = 'https://github.com/italia/eid-wallet-it-forms';

  function githubFooterLinkHtml() {
    return (
      '<a href="' +
      REPO +
      '" target="_blank" rel="noopener noreferrer" ' +
      'class="d-inline-flex align-items-center gap-1 align-middle text-decoration-none footer-github-link">' +
      '<i class="bi bi-github fs-5" aria-hidden="true"></i>' +
      '<span>GitHub</span></a>'
    );
  }

  /**
   * @param {HTMLElement|null} el elemento <footer> (mantiene classi sul tag)
   * @param {{ variant?: 'index'|'form' }} opts
   */
  function injectSiteFooter(el, opts) {
    if (!el) return;
    var variant = (opts && opts.variant) || 'index';
    var innerClass = variant === 'form' ? 'container-fluid text-center' : 'container text-center';
    var prefix =
      variant === 'form'
        ? '<span id="footer-webform-label">Schema e dati di riferimento da manifest</span> &middot; '
        : '';
    el.innerHTML =
      '<div class="' +
      innerClass +
      '">' +
      prefix +
      'Dati salvati localmente nel browser &middot; ' +
      githubFooterLinkHtml() +
      '</div>';
  }

  /** Toast container + modale #app-error-modal (per resource-errors.js). */
  function injectSharedOverlays(mountEl) {
    if (!mountEl) return;
    mountEl.innerHTML =
      '<div id="toast-container" class="toast-container p-3"></div>' +
      '<div class="modal fade" id="app-error-modal" tabindex="-1" aria-labelledby="app-error-modal-title" aria-hidden="true">' +
      '<div class="modal-dialog modal-dialog-centered modal-lg">' +
      '<div class="modal-content border-danger">' +
      '<div class="modal-header bg-danger text-white">' +
      '<h5 class="modal-title" id="app-error-modal-title">Errore</h5>' +
      '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Chiudi"></button>' +
      '</div>' +
      '<div class="modal-body">' +
      '<p class="mb-2" id="app-error-modal-lead"></p>' +
      '<pre class="small bg-light p-3 rounded text-break mb-0 border" id="app-error-modal-detail" ' +
      'style="white-space:pre-wrap;max-height:240px;overflow:auto;font-size:.8rem;"></pre>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>' +
      '</div></div></div></div>';
  }

  global.SiteChrome = {
    GITHUB_REPO_URL: REPO,
    injectSiteFooter: injectSiteFooter,
    injectSharedOverlays: injectSharedOverlays
  };
})(typeof window !== 'undefined' ? window : this);
