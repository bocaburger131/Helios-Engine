/**
 * JWT auth — login, token storage, session guard.
 */
(function (global) {
  const STORAGE_TOKEN = 'bsaDashboardToken';
  const STORAGE_BASE = 'bsaDashboardBaseUrl';
  const STORAGE_VERA_JWT = 'veraJwt';
  const LOGIN_PAGE = './login.html';

  function apiBaseUrl() {
    return (localStorage.getItem(STORAGE_BASE) || global.location.origin).replace(/\/$/, '');
  }

  function setBaseUrl(url) {
    localStorage.setItem(STORAGE_BASE, (url || global.location.origin).replace(/\/$/, ''));
  }

  function isValidJwt(token) {
    return typeof token === 'string' && token.length > 20 && token.split('.').length === 3;
  }

  function getToken() {
    return localStorage.getItem(STORAGE_TOKEN) || '';
  }

  function persistToken(token) {
    localStorage.setItem(STORAGE_TOKEN, token);
    try {
      sessionStorage.setItem(STORAGE_VERA_JWT, token);
    } catch {
      /* ignore */
    }
  }

  function clearToken() {
    localStorage.removeItem(STORAGE_TOKEN);
    try {
      sessionStorage.removeItem(STORAGE_VERA_JWT);
    } catch {
      /* ignore */
    }
  }

  function extractTokenFromResponse(json) {
    return json?.token || json?.data?.token || null;
  }

  async function login(email, password, baseUrl) {
    const root = (baseUrl || apiBaseUrl()).replace(/\/$/, '');
    const res = await fetch(root + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(json.error || json.message || 'Login failed (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    const token = extractTokenFromResponse(json);
    if (!isValidJwt(token)) {
      throw new Error('Login did not return a valid JWT');
    }
    persistToken(token);
    return { token, user: json?.data?.user || null };
  }

  function requireAuth(redirectPath) {
    if (isValidJwt(getToken())) return true;
    const next = redirectPath || global.location.pathname + global.location.search;
    const url =
      LOGIN_PAGE + '?redirect=' + encodeURIComponent(next.startsWith('/') ? next : './' + next.replace(/^\.\//, ''));
    global.location.href = url;
    return false;
  }

  function logout() {
    clearToken();
    global.location.href = LOGIN_PAGE;
  }

  function onAuthExpired(handler) {
    global.addEventListener('helios-auth-expired', handler);
  }

  global.HeliosAuth = {
    STORAGE_TOKEN,
    STORAGE_BASE,
    STORAGE_VERA_JWT,
    LOGIN_PAGE,
    apiBaseUrl,
    setBaseUrl,
    isValidJwt,
    getToken,
    persistToken,
    clearToken,
    login,
    requireAuth,
    logout,
    onAuthExpired
  };
})(window);
