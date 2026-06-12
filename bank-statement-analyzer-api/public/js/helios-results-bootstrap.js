/**
 * Results dashboard bootstrap.
 * Golden path: macro batch completes on Upload Hub; this page loads by ?id= only.
 * Legacy ?uploadSessionId= without ?id= is not auto-batched (prevents premature handoff).
 */
(function (global) {
  function extractStatementId(json) {
    return json?.data?.id || json?.data?._id || null;
  }

  function showStatus(msg, isError) {
    const el = document.getElementById('helios-batch-status');
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
    el.classList.toggle('is-error', !!isError);
  }

  async function prepare() {
    const params = new URLSearchParams(global.location.search);
    const statementId = params.get('id');

    if (statementId) {
      showStatus('', false);
      return { ranBatch: false, statementId };
    }

    const uploadSessionId = params.get('uploadSessionId');
    if (uploadSessionId) {
      showStatus(
        'Complete staging on Upload Hub: review extracted data, click Run Analysis, then return here with the statement id.',
        true
      );
      return { ranBatch: false, statementId: null, needsUploadHub: true };
    }

    const cached = sessionStorage.getItem('macroResult');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const cachedId = extractStatementId(parsed);
        if (cachedId) {
          const url = new URL(global.location.href);
          url.searchParams.set('id', cachedId);
          url.searchParams.delete('uploadSessionId');
          global.history.replaceState({}, '', url.toString());
          showStatus('', false);
          return { ranBatch: false, cached: true, statementId: cachedId, json: parsed };
        }
      } catch {
        /* ignore */
      }
    }

    showStatus('', false);
    return { ranBatch: false, statementId: null };
  }

  global.HeliosResultsBootstrap = { prepare };
})();
