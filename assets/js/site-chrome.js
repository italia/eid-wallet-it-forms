/**
 * Componenti di chrome condivisi tra le pagine (footer, toast, modale errori app).
 * Versioni CDN allineate a index.html / form.html (Bootstrap Italia 2.18.0, Bootstrap Icons 1.11.3).
 */
(function (global) {
  'use strict';

  var REPO = 'https://github.com/italia/eid-wallet-it-forms';
  var DTD_URL = 'https://innovazione.gov.it/dipartimento/';
  var ACCESSIBILITY_URL =
    'https://www.agid.gov.it/it/design-servizi/dichiarazione-accessibilita';

  /**
   * @param {HTMLElement|null} el elemento <footer>
   * @param {{ variant?: 'index'|'form' }} opts
   */
  function injectSiteFooter(el, opts) {
    if (!el) return;
    var variant = (opts && opts.variant) || 'index';
    el.className = 'it-footer';
    el.innerHTML =
      '<div class="it-footer-main">' +
      '<div class="container-xxl">' +
      '<section>' +
      '<div class="row clearfix">' +
      '<div class="col-12">' +
      '<div class="it-brand-wrapper app-footer-brand">' +
      '<a href="' +
      DTD_URL +
      '" target="_blank" rel="noopener noreferrer" class="app-footer-brand-link">' +
      '<img class="app-footer-emblem" src="assets/img/emblema-repubblica-italiana.svg" ' +
      'width="64" height="78" alt="Emblema della Repubblica Italiana" />' +
      '<img class="app-footer-dtd-logo" src="assets/img/logo-dipartimento-trasformazione-digitale-footer.png" ' +
      'width="320" height="59" alt="Dipartimento per la trasformazione digitale" />' +
      '</a>' +
      '</div>' +
      (variant === 'form'
        ? '<p class="app-footer-form-meta small mb-0 mt-3" id="footer-webform-label"></p>'
        : '') +
      '</div>' +
      '</div>' +
      '</section>' +
      '</div>' +
      '</div>' +
      '<div class="it-footer-small-prints clearfix">' +
      '<div class="container-xxl">' +
      '<h3 class="visually-hidden">Link utili</h3>' +
      '<ul class="it-footer-small-prints-list list-inline mb-0 d-flex flex-column flex-md-row gap-2 gap-md-4">' +
      '<li class="list-inline-item">' +
      '<a class="d-inline-flex align-items-center gap-1" href="' +
      ACCESSIBILITY_URL +
      '" target="_blank" rel="noopener noreferrer">' +
      'Dichiarazione di accessibilità' +
      '<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>' +
      '<span class="visually-hidden">(si apre in una nuova finestra)</span>' +
      '</a>' +
      '</li>' +
      '<li class="list-inline-item">' +
      '<a class="d-inline-flex align-items-center gap-1" href="' +
      REPO +
      '" target="_blank" rel="noopener noreferrer">' +
      '<i class="bi bi-github" aria-hidden="true"></i>GitHub' +
      '<span class="visually-hidden">(si apre in una nuova finestra)</span>' +
      '</a>' +
      '</li>' +
      '</ul>' +
      '</div>' +
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

  /**
   * Chiusura automatica del menu mobile Bootstrap Italia al click su link con href.
   * Funziona sia su index.html (#navMain) sia su form.html (#navMainForm).
   */
  function enableMobileNavbarAutoClose() {
    document.addEventListener('click', function (event) {
      if (window.matchMedia('(min-width: 992px)').matches) return;
      var link = event.target && event.target.closest
        ? event.target.closest('.navbar-collapsable a[href]')
        : null;
      if (!link) return;

      var menu = link.closest('.navbar-collapsable');
      if (!menu) return;

      var closeBtn = menu.querySelector('.close-menu');
      if (closeBtn && typeof closeBtn.click === 'function') {
        closeBtn.click();
        return;
      }

      menu.classList.remove('show');
      menu.setAttribute('aria-hidden', 'true');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enableMobileNavbarAutoClose);
  } else {
    enableMobileNavbarAutoClose();
  }

  global.SiteChrome = {
    GITHUB_REPO_URL: REPO,
    injectSiteFooter: injectSiteFooter,
    injectSharedOverlays: injectSharedOverlays
  };
})(typeof window !== 'undefined' ? window : this);
