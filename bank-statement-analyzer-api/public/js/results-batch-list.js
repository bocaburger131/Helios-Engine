/**
 * Results dashboard — analysis list when no statement id is selected.
 */
(function (global) {
  const { apiFetch, escapeHtml, formatDate } = global.HeliosApi;

  function formatAnalyzedAt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  async function deleteAnalysis(id, title, onDone) {
    const label = title || 'this analysis';
    if (!confirm(`Delete analysis for ${label}? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/api/statements/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || json.message || 'Delete failed');
      if (typeof onDone === 'function') onDone();
    } catch (err) {
      alert(err.message || 'Delete failed');
    }
  }

  function renderRow(s) {
    const id = s._id || s.id;
    const title = s.analysisTitle || s.applicationContext?.companyName || 'Unknown Company';
    const months = s.monthsAnalyzedLabel || '';
    const analyzed = formatAnalyzedAt(s.analyzedAt || s.processedDate || s.updatedAt || s.createdAt);
    const score =
      s.veritasScore != null ? ' · Veritas ' + Math.round(Number(s.veritasScore)) : '';
    const vera = s.veraDecision ? ' · Vera ' + escapeHtml(String(s.veraDecision)) : '';

    return (
      '<article class="helios-analysis-row" data-id="' +
      escapeHtml(String(id)) +
      '">' +
      '<a class="helios-analysis-row-main" href="./manual-results.html?id=' +
      encodeURIComponent(id) +
      '">' +
      '<span class="helios-analysis-title">' +
      escapeHtml(title) +
      '</span>' +
      (months
        ? '<span class="helios-analysis-months">' + escapeHtml(months) + '</span>'
        : '') +
      '<span class="helios-analysis-meta">Analyzed ' +
      escapeHtml(analyzed) +
      escapeHtml(score) +
      vera +
      '</span>' +
      '</a>' +
      '<div class="helios-analysis-actions">' +
      '<button type="button" class="helios-btn helios-btn-ghost helios-btn-sm" data-action="view-json" data-id="' +
      escapeHtml(String(id)) +
      '" data-title="' +
      escapeHtml(title) +
      '">View JSON</button>' +
      '<button type="button" class="helios-btn helios-btn-ghost helios-btn-sm" data-action="download-json" data-id="' +
      escapeHtml(String(id)) +
      '">Download</button>' +
      '<button type="button" class="helios-btn helios-btn-ghost helios-btn-sm helios-btn-danger" data-action="delete" data-id="' +
      escapeHtml(String(id)) +
      '" data-title="' +
      escapeHtml(title) +
      '">Delete</button>' +
      '</div></article>'
    );
  }

  function bindActions(container, reload) {
    container.querySelectorAll('[data-action="view-json"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (global.HeliosAnalysisJsonModal) {
          HeliosAnalysisJsonModal.open(btn.dataset.id, btn.dataset.title || 'Analysis JSON');
        }
      });
    });
    container.querySelectorAll('[data-action="download-json"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.dataset.id;
        apiFetch(`/api/statements/${encodeURIComponent(id)}/export-json?variant=master&download=1`)
          .then((res) => res.blob())
          .then((blob) => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `analysis_master_${id}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
          })
          .catch((err) => alert(err.message || 'Download failed'));
      });
    });
    container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteAnalysis(btn.dataset.id, btn.dataset.title, reload);
      });
    });
  }

  async function loadBatchList(container) {
    const reload = () => loadBatchList(container);
    container.innerHTML = '<p class="helios-list-loading">Loading analyses…</p>';
    try {
      const res = await apiFetch('/api/statements?limit=50');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || json.message || 'Failed to load statements (' + res.status + ')');
      }
      const items = json.data?.statements || json.statements || json.data || [];
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        container.innerHTML =
          '<p class="helios-list-empty">No completed analyses yet. On <a href="./manual-upload.html">Upload Hub</a>, upload PDFs and click <strong>Run Analysis</strong> — you will land here when macro finishes.</p>';
        return;
      }
      container.innerHTML =
        '<div class="helios-analysis-list">' + list.map((s) => renderRow(s)).join('') + '</div>';
      bindActions(container, reload);
    } catch (err) {
      container.innerHTML =
        '<p class="helios-list-error">' + escapeHtml(err.message || 'Load failed') + '</p>';
    }
  }

  global.HeliosBatchList = { loadBatchList, deleteAnalysis };
})(window);
