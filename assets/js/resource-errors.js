/**
 * Dialog e listener globali per errori di caricamento risorse (script/CSS/rete).
 * Richiede Bootstrap JS e l'elemento #app-error-modal nel DOM.
 */
(function () {
  let _errorModalCooldown = false;

  function resetCooldownSoon() {
    const el = document.getElementById('app-error-modal');
    if (!el) return;
    const onHidden = function () {
      el.removeEventListener('hidden.bs.modal', onHidden);
      _errorModalCooldown = false;
    };
    el.addEventListener('hidden.bs.modal', onHidden);
  }

  window.showAppErrorModal = function (title, lead, detail) {
    if (_errorModalCooldown) return;
    _errorModalCooldown = true;

    const titleEl = document.getElementById('app-error-modal-title');
    const leadEl = document.getElementById('app-error-modal-lead');
    const detailEl = document.getElementById('app-error-modal-detail');
    const modalEl = document.getElementById('app-error-modal');

    const t = title || 'Errore';
    const l = lead || '';
    const d = detail != null ? String(detail) : '';

    if (!modalEl || !titleEl || typeof bootstrap === 'undefined' || !bootstrap.Modal) {
      window.alert(t + (l ? '\n\n' + l : '') + (d ? '\n\n' + d : ''));
      _errorModalCooldown = false;
      return;
    }

    titleEl.textContent = t;
    if (leadEl) leadEl.textContent = l;
    if (detailEl) detailEl.textContent = d;

    resetCooldownSoon();
    const instance = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static' });
    instance.show();
  };

  window.installResourceErrorHandlers = function () {
    window.addEventListener(
      'error',
      function (ev) {
        const t = ev.target;
        if (t && t.nodeName === 'SCRIPT' && t.src) {
          window.showAppErrorModal(
            'Script non caricato',
            'Il browser non ha potuto scaricare una libreria esterna. Verifica connessione, DNS, firewall e accesso al CDN (es. jsDelivr).',
            t.src + (ev.message ? '\n\n' + ev.message : '')
          );
        }
        if (t && t.nodeName === 'LINK' && t.rel === 'stylesheet' && t.href) {
          window.showAppErrorModal(
            'Stile non caricato',
            'Impossibile caricare un foglio di stile esterno.',
            t.href + (ev.message ? '\n\n' + ev.message : '')
          );
        }
      },
      true
    );

    window.addEventListener('unhandledrejection', function (ev) {
      const msg = String(
        ev.reason && ev.reason.message != null ? ev.reason.message : ev.reason
      );
      if (
        /NetworkError|Failed to fetch|ERR_|not resolved|Name not resolved|load failed|network|dns|aborted|timeout/i.test(
          msg
        )
      ) {
        window.showAppErrorModal(
          'Errore di rete o risorsa',
          'Un\'operazione asincrona non è riuscita (rete, DNS o server remoto).',
          msg
        );
      }
    });
  };

  /* Subito: intercetta errori dei <script> caricati dopo questo file. */
  if (document.getElementById('app-error-modal')) {
    window.installResourceErrorHandlers();
  }
})();

