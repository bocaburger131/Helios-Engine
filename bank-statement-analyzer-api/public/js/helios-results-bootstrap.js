/**

 * Results dashboard bootstrap.

 * Golden path: macro batch completes on Upload Hub; this page loads by ?id= only.

 * Legacy ?uploadSessionId= without ?id= is not auto-batched (prevents premature handoff).

 */

(function (global) {

  function escapeHtml(s) {

    if (global.HeliosApi?.escapeHtml) return global.HeliosApi.escapeHtml(s);

    const d = document.createElement('span');

    d.textContent = s == null ? '' : String(s);

    return d.innerHTML;

  }



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



  function showWarningsPanel(summaries) {

    const panel = document.getElementById('helios-warnings-panel');

    if (!panel) return;

    const list = Array.isArray(summaries) ? summaries : [];

    if (!list.length) {

      panel.hidden = true;

      panel.innerHTML = '';

      return;

    }

    const items = list

      .map((s) => {

        const file = s?.fileName || s?.name || 'Statement';

        const diagnosis =

          s?.diagnosis || s?.probeHint || s?.parseQuality || s?.status || s?.message || 'checksum review';

        const explanation = s?.explanation ? `<div class="warning-explanation">${escapeHtml(s.explanation)}</div>` : '';

        const delta = s?.delta != null ? ` (Δ ${escapeHtml(s.delta)})` : '';

        return `<li><strong>${escapeHtml(file)}</strong>: ${escapeHtml(diagnosis)}${delta}${explanation}</li>`;

      })

      .join('');

    panel.innerHTML =

      '<h2>Completed with warnings</h2>' +

      '<p>Macro analysis finished but some statements need human review:</p>' +

      `<ul>${items}</ul>`;

    panel.hidden = false;

  }



  function loadDiagnosticSummariesFromCache() {

    try {

      const dedicated = sessionStorage.getItem('macroDiagnosticSummaries');

      if (dedicated) {

        const parsedDedicated = JSON.parse(dedicated);

        if (Array.isArray(parsedDedicated) && parsedDedicated.length) return parsedDedicated;

      }

      const raw = sessionStorage.getItem('macroResult');

      if (!raw) return [];

      const parsed = JSON.parse(raw);

      return (

        parsed?.diagnosticSummaries ||

        parsed?.result?.diagnosticSummaries ||

        parsed?.data?.diagnosticSummaries ||

        []

      );

    } catch {

      return [];

    }

  }



  async function fetchDiagnosticSummariesFromApi(statementId) {

    const apiFetch = global.HeliosApi?.apiFetch;

    if (!apiFetch || !statementId) return [];

    try {

      const res = await apiFetch('/api/statements/' + encodeURIComponent(statementId));

      const json = await res.json().catch(() => ({}));

      if (!res.ok) return [];

      const summaries =

        json?.analysis?.envelope201?.diagnosticSummaries ||

        json?.analysis?.envelope201?.data?.diagnosticSummaries ||

        json?.diagnosticSummaries ||

        [];

      return Array.isArray(summaries) ? summaries : [];

    } catch {

      return [];

    }

  }



  async function prepare() {

    const params = new URLSearchParams(global.location.search);

    const statementId = params.get('id');

    const warningsMode = params.get('warnings') === '1';



    if (warningsMode) {

      let summaries = loadDiagnosticSummariesFromCache();

      if (!summaries.length && statementId) {

        summaries = await fetchDiagnosticSummariesFromApi(statementId);

      }

      showWarningsPanel(summaries);

    }



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



  global.HeliosResultsBootstrap = { prepare, showWarningsPanel };

})();

