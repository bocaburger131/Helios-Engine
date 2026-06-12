/**

 * Shared API helpers for Helios dashboard pages.

 */

(function (global) {

  const STORAGE_BASE = 'bsaDashboardBaseUrl';

  const STORAGE_TOKEN = 'bsaDashboardToken';



  function apiBaseUrl() {

    return (localStorage.getItem(STORAGE_BASE) || global.location.origin).replace(/\/$/, '');

  }



  function getToken() {

    return global.HeliosAuth ? global.HeliosAuth.getToken() : localStorage.getItem(STORAGE_TOKEN) || '';

  }



  async function apiFetch(path, options = {}) {

    const token = getToken();

    if (!global.HeliosAuth?.isValidJwt?.(token)) {

      const err = new Error('Authentication required');

      err.status = 401;

      throw err;

    }

    const headers = { Accept: 'application/json', ...(options.headers || {}) };

    if (!headers.Authorization) {

      headers.Authorization = 'Bearer ' + token;

    }

    const res = await fetch(apiBaseUrl() + path, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
      try {
        global.dispatchEvent(
          new CustomEvent('helios-auth-expired', { detail: { status: res.status, path } })
        );
      } catch {
        /* ignore */
      }
    }

    return res;

  }



  function escapeHtml(s) {

    const d = document.createElement('span');

    d.textContent = s == null ? '' : String(s);

    return d.innerHTML;

  }



  function formatCurrency(value) {

    const n = Number(value);

    if (!Number.isFinite(n)) return '—';

    return new Intl.NumberFormat('en-US', {

      style: 'currency',

      currency: 'USD',

      maximumFractionDigits: 0

    }).format(n);

  }



  function formatCompact(value) {

    const n = Number(value);

    if (!Number.isFinite(n)) return '—';

    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';

    if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';

    return formatCurrency(n);

  }



  function formatPercent(value, digits = 0) {

    const n = Number(value);

    if (!Number.isFinite(n)) return '—';

    return n.toFixed(digits) + '%';

  }



  function formatDate(iso) {

    if (!iso) return '—';

    const d = new Date(iso);

    if (Number.isNaN(d.getTime())) return '—';

    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  }



  global.HeliosApi = {

    STORAGE_BASE,

    apiBaseUrl,

    getToken,

    apiFetch,

    escapeHtml,

    formatCurrency,

    formatCompact,

    formatPercent,

    formatDate

  };

})(window);

