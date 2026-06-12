/**
 * Full analysis JSON viewer — Master JSON vs Report envelope tabs.
 */
(function (global) {
  const { apiFetch, escapeHtml } = global.HeliosApi;

  let modalEl = null;

  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.id = 'helios-json-modal';
    modalEl.className = 'helios-json-modal';
    modalEl.hidden = true;
    modalEl.innerHTML =
      '<div class="helios-json-modal-backdrop" data-close="1"></div>' +
      '<div class="helios-json-modal-panel" role="dialog" aria-labelledby="helios-json-modal-title">' +
      '<header class="helios-json-modal-header">' +
      '<h2 id="helios-json-modal-title">Analysis JSON</h2>' +
      '<button type="button" class="helios-json-modal-close" data-close="1" aria-label="Close">×</button>' +
      '</header>' +
      '<div class="helios-json-tabs">' +
      '<button type="button" class="helios-json-tab is-active" data-tab="master">Master JSON</button>' +
      '<button type="button" class="helios-json-tab" data-tab="envelope">Report envelope</button>' +
      '</div>' +
      '<p class="helios-json-modal-status" id="helios-json-modal-status"></p>' +
      '<pre class="helios-json-modal-pre" id="helios-json-modal-pre"></pre>' +
      '<footer class="helios-json-modal-footer">' +
      '<button type="button" class="helios-btn helios-btn-ghost" id="helios-json-copy">Copy</button>' +
      '<button type="button" class="helios-btn helios-btn-primary" id="helios-json-download">Download</button>' +
      '</footer></div>';
    document.body.appendChild(modalEl);

    modalEl.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => close());
    });
    modalEl.querySelectorAll('.helios-json-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    document.getElementById('helios-json-copy').addEventListener('click', copyActive);
    document.getElementById('helios-json-download').addEventListener('click', downloadActive);

    if (!document.getElementById('helios-json-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'helios-json-modal-styles';
      style.textContent =
        '.helios-json-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center}' +
        '.helios-json-modal[hidden]{display:none}' +
        '.helios-json-modal-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.55)}' +
        '.helios-json-modal-panel{position:relative;width:min(920px,94vw);max-height:88vh;background:#fff;border-radius:14px;box-shadow:0 24px 48px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden}' +
        '.helios-json-modal-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #e2e8f0}' +
        '.helios-json-modal-header h2{margin:0;font-size:1.1rem}' +
        '.helios-json-modal-close{border:none;background:transparent;font-size:1.5rem;cursor:pointer;line-height:1}' +
        '.helios-json-tabs{display:flex;gap:8px;padding:12px 20px 0}' +
        '.helios-json-tab{border:1px solid #cbd5e1;background:#f8fafc;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:.82rem}' +
        '.helios-json-tab.is-active{background:#2563eb;color:#fff;border-color:#2563eb}' +
        '.helios-json-modal-status{padding:8px 20px;font-size:.8rem;color:#64748b;margin:0}' +
        '.helios-json-modal-pre{flex:1;margin:0 20px;padding:12px;background:#0f172a;color:#a7f3d0;font-size:.72rem;line-height:1.45;overflow:auto;max-height:50vh;border-radius:8px}' +
        '.helios-json-modal-footer{display:flex;gap:10px;justify-content:flex-end;padding:14px 20px;border-top:1px solid #e2e8f0}';
      document.head.appendChild(style);
    }
    return modalEl;
  }

  const state = { statementId: null, activeTab: 'master', master: null, envelope: null, title: '' };

  function switchTab(tab) {
    state.activeTab = tab;
    modalEl.querySelectorAll('.helios-json-tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === tab);
    });
    renderPre();
  }

  function renderPre() {
    const pre = document.getElementById('helios-json-modal-pre');
    const payload = state.activeTab === 'envelope' ? state.envelope : state.master;
    pre.textContent = payload ? JSON.stringify(payload, null, 2) : 'Loading…';
    const bytes = payload ? new Blob([JSON.stringify(payload)]).size : 0;
    document.getElementById('helios-json-modal-status').textContent = payload
      ? `${state.activeTab === 'envelope' ? 'Report envelope' : 'Master JSON'} · ~${(bytes / 1024).toFixed(1)} KB`
      : 'Loading…';
  }

  async function loadPayloads(statementId) {
    state.statementId = statementId;
    state.master = null;
    state.envelope = null;
    const [masterRes, envelopeRes] = await Promise.all([
      apiFetch(`/api/statements/${encodeURIComponent(statementId)}`),
      apiFetch(
        `/api/statements/${encodeURIComponent(statementId)}/export-json?variant=envelope`
      )
    ]);
    const masterJson = await masterRes.json().catch(() => ({}));
    const envelopeJson = await envelopeRes.json().catch(() => ({}));
    if (!masterRes.ok) throw new Error(masterJson.error || 'Failed to load Master JSON');
    state.master = masterJson;
    state.envelope = envelopeRes.ok ? envelopeJson : { error: envelopeJson.error || 'Envelope unavailable' };
    renderPre();
  }

  function copyActive() {
    const payload = state.activeTab === 'envelope' ? state.envelope : state.master;
    if (!payload) return;
    navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
  }

  function downloadActive() {
    if (!state.statementId) return;
    const variant = state.activeTab === 'envelope' ? 'envelope' : 'master';
    const url =
      `/api/statements/${encodeURIComponent(state.statementId)}/export-json?variant=${variant}&download=1`;
    apiFetch(url)
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `analysis_${variant}_${state.statementId}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err) => alert(err.message || 'Download failed'));
  }

  async function open(statementId, title) {
    ensureModal();
    state.title = title || 'Analysis JSON';
    document.getElementById('helios-json-modal-title').textContent = state.title;
    modalEl.hidden = false;
    document.getElementById('helios-json-modal-pre').textContent = 'Loading full analysis…';
    document.getElementById('helios-json-modal-status').textContent = '';
    try {
      await loadPayloads(statementId);
    } catch (err) {
      document.getElementById('helios-json-modal-pre').textContent = err.message || 'Load failed';
    }
  }

  function close() {
    if (modalEl) modalEl.hidden = true;
  }

  global.HeliosAnalysisJsonModal = { open, close };
})(window);
